"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { normalizeFarmResponse, selectedFarmFromResponse, type BreedingFarmSelectionResponse } from "../reproducao/reproduction-data";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { SessionRecovery } from "../components/session-recovery";
import { type BillingPayment, type BillingPaymentsResponse, type BillingSubscription, billingStatusLabel, formatBillingAmount, formatBillingDate, paymentStatusLabel } from "./subscription-data";
import { clearPendingRegularizationReturn, findCurrentRegularizablePayment, type HostedInvoiceRegularizationResponse, isSafeHostedInvoiceUrl, paymentAndSubscriptionAllowAccess, type PendingRegularizationReturn, readPendingRegularizationReturn, redirectToHostedInvoice, savePendingRegularizationReturn } from "./regularization";

type SubscriptionView =
  | { kind: "loading" }
  | { kind: "no-farm" }
  | { kind: "unselected" }
  | { kind: "missing-farm" }
  | { kind: "error"; message: string }
  | { kind: "awaiting-confirmation"; farmName: string; message?: string }
  | { kind: "ready"; farmName: string; payments: BillingPaymentsResponse; subscription: BillingSubscription | null; regularizationConfirmed?: boolean };

const pageSize = 20;

function SubscriptionScreen() {
  const { error: authError, refresh, session, status } = useAuth();
  const [view, setView] = useState<SubscriptionView>({ kind: "loading" });
  const [paymentPage, setPaymentPage] = useState(1);
  const [pendingRegularization, setPendingRegularization] = useState<PendingRegularizationReturn | null>(() => readPendingRegularizationReturn());
  const [regularizationBusy, setRegularizationBusy] = useState(false);
  const [regularizationError, setRegularizationError] = useState<string>();
  const [returnPollAttempt, setReturnPollAttempt] = useState(0);
  const [isPollingReturn, setIsPollingReturn] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const requestId = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const loadSubscription = useCallback(async (recoverSession = true) => {
    const currentRequest = ++requestId.current;
    const isCurrent = () => requestId.current === currentRequest;
    if (!pendingRegularization) setView({ kind: "loading" });

    try {
      const selection = normalizeFarmResponse(await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms"));
      if (!isCurrent()) return;
      if (selection.breedingFarms.length === 0) {
        setView({ kind: "no-farm" });
        return;
      }
      const farm = selectedFarmFromResponse(selection);
      if (!farm) {
        setView({ kind: "unselected" });
        return;
      }

      client.current!.setTenant(farm.breedingFarmId);
      let subscription: BillingSubscription | null;
      try {
        subscription = await client.current!.request<BillingSubscription>("api/billing/subscription");
      } catch (subscriptionError) {
        if (subscriptionError instanceof ApiError && subscriptionError.status === 404 && subscriptionError.message.includes("has no subscription")) {
          subscription = null;
        } else {
          throw subscriptionError;
        }
      }
      if (!isCurrent()) return;
      if (subscription && subscription.breedingFarmId !== farm.breedingFarmId) throw new StaleTenantResponseError();

      const payments = await client.current!.request<BillingPaymentsResponse>(`api/billing/payments?page=${paymentPage}&pageSize=${pageSize}`);
      if (!isCurrent()) return;
      if (payments.breedingFarmId !== farm.breedingFarmId) throw new StaleTenantResponseError();
      const savedReturn = pendingRegularization ?? readPendingRegularizationReturn();
      if (savedReturn && savedReturn.breedingFarmId !== farm.breedingFarmId) {
        clearPendingRegularizationReturn();
        setPendingRegularization(null);
      } else if (savedReturn) {
        setPendingRegularization(savedReturn);
        const returnedPayment = payments.items.find((payment) => payment.paymentId === savedReturn.paymentId);
        if (returnedPayment && subscription && paymentAndSubscriptionAllowAccess(returnedPayment.status, subscription.status)) {
          clearPendingRegularizationReturn();
          setPendingRegularization(null);
          setView({ kind: "ready", farmName: farm.name, payments, subscription, regularizationConfirmed: true });
          return;
        }
        setView({ kind: "awaiting-confirmation", farmName: farm.name });
        return;
      }
      setView({ kind: "ready", farmName: farm.name, payments, subscription });
    } catch (requestError) {
      if (!isCurrent()) return;
      if (requestError instanceof ApiError && requestError.status === 401 && recoverSession) {
        const refreshed = await refresh();
        if (isCurrent() && refreshed.ok) await loadSubscription(false);
        return;
      }
      if ((pendingRegularization ?? readPendingRegularizationReturn()) && !(requestError instanceof ApiError && requestError.status === 409)) {
        setView({ kind: "awaiting-confirmation", farmName: "", message: "Não foi possível confirmar o pagamento agora. Tente consultar novamente." });
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 409) {
        setView({ kind: "unselected" });
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 404) {
        setView({ kind: "missing-farm" });
        return;
      }
      setView({
        kind: "error",
        message: requestError instanceof ApiError && requestError.status >= 500
          ? "A consulta está indisponível no momento. Tente novamente em instantes."
          : requestError instanceof StaleTenantResponseError
            ? "O criatório selecionado mudou em outra janela. Atualize a consulta para continuar."
            : "Verifique sua conexão e tente novamente."
      });
    }
  }, [paymentPage, pendingRegularization, refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadSubscription();
    return () => { requestId.current += 1; };
  }, [loadSubscription, status]);

  useEffect(() => {
    if (!pendingRegularization || status !== "authenticated") return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    setIsPollingReturn(true);

    async function pollPaymentStatus() {
      try {
        client.current!.setTenant(pendingRegularization!.breedingFarmId);
        client.current!.clearCache();
        const [subscription, payments] = await Promise.all([
          client.current!.request<BillingSubscription>("api/billing/subscription"),
          client.current!.request<BillingPaymentsResponse>("api/billing/payments?page=1&pageSize=20")
        ]);
        if (cancelled) return;
        if (subscription.breedingFarmId !== pendingRegularization!.breedingFarmId || payments.breedingFarmId !== pendingRegularization!.breedingFarmId) {
          throw new StaleTenantResponseError();
        }
        const payment = payments.items.find((item) => item.paymentId === pendingRegularization!.paymentId);
        if (payment && paymentAndSubscriptionAllowAccess(payment.status, subscription.status)) {
          clearPendingRegularizationReturn();
          setPendingRegularization(null);
          setIsPollingReturn(false);
          setView({ kind: "ready", farmName: "Criatório Virtual", payments, subscription, regularizationConfirmed: true });
          return;
        }
        const confirmationMessage = payment?.status === "Confirmed"
          ? "Pagamento confirmado. Estamos aguardando a atualização da permissão de acesso."
          : "Assim que o Asaas confirmar o pagamento, o acesso será liberado automaticamente.";
        attempts += 1;
        if (attempts >= 60) {
          setView({ kind: "awaiting-confirmation", farmName: "", message: "Ainda não recebemos a confirmação. Você pode consultar novamente." });
          setIsPollingReturn(false);
          return;
        }
        setView((current) => current.kind === "awaiting-confirmation"
          ? { ...current, message: confirmationMessage }
          : { kind: "awaiting-confirmation", farmName: "", message: confirmationMessage });
        timer = window.setTimeout(() => void pollPaymentStatus(), 3000);
      } catch {
        if (cancelled) return;
        setView({ kind: "awaiting-confirmation", farmName: "", message: "Não foi possível consultar a confirmação agora. Tente novamente." });
        setIsPollingReturn(false);
      }
    }

    void pollPaymentStatus();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      setIsPollingReturn(false);
    };
  }, [pendingRegularization, returnPollAttempt, status]);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="subscription" email={session?.email} label="Carregando assinatura" message="Um instante enquanto consultamos sua situação financeira." />;
  }
  if (status === "error" || status === "forbidden") {
    return <main className="app-loading-page"><section className="subscription-notice"><h1>{status === "forbidden" ? "Acesso bloqueado" : "Não foi possível consultar sua assinatura"}</h1><p>{authError ?? "Tente novamente para continuar."}</p><button className="auth-secondary-action" onClick={() => void refresh()} type="button">Tentar novamente</button></section></main>;
  }
  if (status === "unauthenticated" || !session) return <SessionRecovery />;
  if (view.kind === "loading") return <AppLoadingState activeNav="subscription" email={session.email} label="Carregando assinatura" message="Um instante enquanto consultamos sua situação financeira." />;
  if (view.kind === "awaiting-confirmation") return <AwaitingPaymentConfirmation busy={isPollingReturn} message={view.message} onRetry={() => setReturnPollAttempt((attempt) => attempt + 1)} />;

  const content = (() => {
    if (view.kind === "no-farm") return <SubscriptionNotice actionHref="/onboarding/criatorio" actionLabel="Criar meu criatório" heading="Crie seu primeiro criatório" message="Vincule um criatório à sua conta para consultar a assinatura e as cobranças." />;
    if (view.kind === "unselected") return <SubscriptionNotice actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message="Escolha o criatório que deseja consultar." />;
    if (view.kind === "missing-farm") return <SubscriptionNotice actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar outro criatório" heading="Criatório indisponível" message="Não foi possível localizar o criatório selecionado. Escolha outro para continuar." onRetry={() => void loadSubscription()} />;
    if (view.kind === "error") return <SubscriptionNotice heading="Não foi possível carregar a assinatura" message={view.message} onRetry={() => void loadSubscription()} />;
    return <SubscriptionDetails
      farmName={view.farmName}
      onPageChange={setPaymentPage}
      onRegularize={(payment) => void startRegularization(payment, view.farmName, view.subscription?.breedingFarmId)}
      payments={view.payments}
      regularizationBusy={regularizationBusy}
      regularizationError={regularizationError}
      regularizationConfirmed={view.regularizationConfirmed === true}
      subscription={view.subscription}
    />;
  })();

  async function startRegularization(payment: BillingPayment, farmName: string, breedingFarmId?: string) {
    if (!breedingFarmId || regularizationBusy) return;
    setRegularizationBusy(true);
    setRegularizationError(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<HostedInvoiceRegularizationResponse>(
        `api/billing/payments/${encodeURIComponent(payment.paymentId)}/regularization`,
        { method: "POST" }
      );
      if (response.paymentId !== payment.paymentId || response.status !== "awaitingCustomerPayment" || !isSafeHostedInvoiceUrl(response.paymentUrl)) {
        throw new Error("invoice_unavailable");
      }
      const pending = { breedingFarmId, paymentId: payment.paymentId };
      savePendingRegularizationReturn(pending);
      setPendingRegularization(pending);
      setView({ kind: "awaiting-confirmation", farmName });
      redirectToHostedInvoice(response.paymentUrl);
    } catch (requestError) {
      setRegularizationError(requestError instanceof ApiError && requestError.status === 409
        ? "A cobrança mudou de situação e não pode mais ser regularizada por esta fatura. Atualize os dados para consultar o estado atual."
        : requestError instanceof ApiError && requestError.status === 404
          ? "Não encontramos a cobrança atual deste criatório. Atualize os dados e tente novamente."
          : requestError instanceof ApiError && requestError.status >= 500
            ? "O serviço de pagamento está indisponível. Tente novamente em instantes."
            : requestError instanceof Error && requestError.message === "invoice_unavailable"
              ? "O link seguro de pagamento não está disponível. Tente novamente em instantes."
              : "Não foi possível iniciar a regularização. Verifique sua conexão e tente novamente.");
      client.current!.clearCache();
      if (requestError instanceof ApiError && [404, 409].includes(requestError.status)) void loadSubscription();
    } finally {
      setRegularizationBusy(false);
    }
  }

  return <AuthenticatedShell activeNav="subscription" email={session.email} farmName={view.kind === "ready" ? view.farmName : "Criatório Virtual"}>{content}</AuthenticatedShell>;
}

function SubscriptionNotice({ actionHref, actionLabel, heading, message, onRetry }: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return <main className="subscription-page"><section className="subscription-notice"><h1>{heading}</h1><p>{message}</p><div className="subscription-notice-actions">{actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}{onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}</div></section></main>;
}

function SubscriptionDetails({ farmName, onPageChange, onRegularize, payments, regularizationBusy, regularizationError, regularizationConfirmed, subscription }: Readonly<{ farmName: string; onPageChange: (page: number) => void; onRegularize: (payment: BillingPayment) => void; payments: BillingPaymentsResponse; regularizationBusy: boolean; regularizationError?: string; regularizationConfirmed: boolean; subscription: BillingSubscription | null }>) {
  const isTrial = subscription?.status === "Trial";
  const isGracePeriod = subscription?.status === "GracePeriod";
  const isBlocked = subscription?.status === "Blocked";
  const totalPages = Math.max(1, Math.ceil(payments.totalCount / payments.pageSize));
  const regularizablePayment = findCurrentRegularizablePayment(subscription, payments);

  return (
    <main className="subscription-page">
      <nav aria-label="Navegação estrutural" className="settings-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Assinatura</span></nav>
      <header className="subscription-header"><div><p className="eyebrow">Conta e pagamentos</p><h1>Assinatura</h1><p>Acompanhe o período gratuito, as próximas cobranças e o histórico financeiro de {farmName}.</p></div>{subscription && <span className={`subscription-status${isBlocked || isGracePeriod ? " subscription-status-warning" : ""}`}>{billingStatusLabel(subscription.status)}</span>}</header>

      {regularizationConfirmed && <div aria-live="polite" className="subscription-alert subscription-alert-success" role="status"><strong>Pagamento confirmado</strong><p>O backend confirmou a cobrança e o acesso ao criatório foi restabelecido.</p></div>}

      {!subscription ? (
        <section aria-labelledby="subscription-empty-title" className="subscription-empty">
          <span aria-hidden="true" className="subscription-empty-icon">♧</span>
          <div><h2 id="subscription-empty-title">Nenhuma assinatura cadastrada</h2><p>Quando houver uma assinatura vinculada a este criatório, os detalhes do período gratuito e das cobranças aparecerão aqui.</p></div>
        </section>
      ) : (
        <>
          {(isGracePeriod || isBlocked) && <>
            <section aria-live="polite" className={`subscription-alert${isBlocked ? " subscription-alert-blocked" : ""}`}><strong>{isBlocked ? "Acesso financeiro bloqueado" : "Pagamento em período de tolerância"}</strong><p>{isBlocked ? "A assinatura está bloqueada. Regularize a cobrança para recuperar o acesso aos recursos do criatório." : `Restam ${subscription.gracePeriodDaysRemaining ?? 0} dia(s) no período de tolerância, até ${formatBillingDate(subscription.gracePeriodEndsAtUtc)}.`}</p></section>
            <section aria-labelledby="regularization-title" className="subscription-regularization">
              <div><p className="eyebrow">Cobrança atual</p><h2 id="regularization-title">Regularize seu acesso</h2><p>Você seguirá para a fatura hospedada e segura do Asaas. O acesso será liberado após a confirmação do pagamento.</p></div>
              {regularizablePayment ? <dl className="subscription-regularization-facts"><div><dt>Vencimento</dt><dd>{formatBillingDate(regularizablePayment.dueAtUtc)}</dd></div><div><dt>Valor</dt><dd>{formatBillingAmount(regularizablePayment.amount, regularizablePayment.currencyCode)}</dd></div><div><dt>Situação</dt><dd>{paymentStatusLabel(regularizablePayment.status)}</dd></div></dl> : <p className="subscription-regularization-empty">Não encontramos uma cobrança atual disponível para regularização. Atualize a consulta ou tente novamente mais tarde.</p>}
              {regularizationError && <p className="subscription-regularization-error" role="alert">{regularizationError}</p>}
              {regularizablePayment && <button className="auth-primary-action" disabled={regularizationBusy} onClick={() => onRegularize(regularizablePayment)} type="button">{regularizationBusy ? "Preparando fatura segura…" : "Regularizar pagamento"}</button>}
            </section>
          </>}
          <section aria-labelledby="subscription-overview-title" className="subscription-overview">
            <div className="subscription-overview-heading"><div><p className="eyebrow">Resumo financeiro</p><h2 id="subscription-overview-title">Detalhes da assinatura</h2></div><span className="subscription-plan">{subscription.planCode.replaceAll("-", " ")}</span></div>
            <dl className="subscription-facts">
              {isTrial && <div><dt>Período gratuito até</dt><dd>{formatBillingDate(subscription.trialEndsAtUtc)}</dd></div>}
              <div><dt>Primeira cobrança</dt><dd>{formatBillingDate(subscription.firstChargeDueAtUtc)}</dd></div>
              <div><dt>Próxima cobrança</dt><dd>{formatBillingDate(subscription.nextChargeDueAtUtc)}</dd></div>
              <div><dt>Ciclo de cobrança</dt><dd>{subscription.billingCycle === "Annual" ? "Anual" : subscription.billingCycle === "Monthly" ? "Mensal" : subscription.billingCycle}</dd></div>
              {subscription.gracePeriodDaysRemaining !== null && <div><dt>Dias restantes de tolerância</dt><dd>{subscription.gracePeriodDaysRemaining}</dd></div>}
              <div><dt>Assinatura criada em</dt><dd>{formatBillingDate(subscription.createdAtUtc)}</dd></div>
            </dl>
          </section>
        </>
      )}

      <section aria-labelledby="billing-payments-title" className="subscription-payments">
        <div className="subscription-section-heading"><div><p className="eyebrow">Transações</p><h2 id="billing-payments-title">Histórico de cobranças</h2></div><span>{payments.totalCount} {payments.totalCount === 1 ? "registro" : "registros"}</span></div>
        {payments.items.length === 0 ? <p className="subscription-payments-empty">Nenhuma cobrança encontrada.</p> : <div className="subscription-table-wrap"><table><thead><tr><th scope="col">Vencimento</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Pagamento</th></tr></thead><tbody>{payments.items.map((payment) => <tr key={payment.paymentId}><td>{formatBillingDate(payment.dueAtUtc)}</td><td>{formatBillingAmount(payment.amount, payment.currencyCode)}</td><td><span className={`payment-status payment-status-${payment.status.toLowerCase()}`}>{paymentStatusLabel(payment.status)}</span></td><td>{formatBillingDate(payment.paidAtUtc)}</td></tr>)}</tbody></table></div>}
        {totalPages > 1 && <nav aria-label="Paginação do histórico de cobranças" className="subscription-pagination"><button disabled={payments.page <= 1} onClick={() => onPageChange(payments.page - 1)} type="button">Anterior</button><span>Página {payments.page} de {totalPages}</span><button disabled={payments.page >= totalPages} onClick={() => onPageChange(payments.page + 1)} type="button">Próxima</button></nav>}
      </section>
      <p className="subscription-privacy-note">São exibidos apenas dados financeiros necessários à consulta. Identificadores internos e dados do provedor de pagamento não são apresentados.</p>
    </main>
  );
}

function AwaitingPaymentConfirmation({ busy, message, onRetry }: Readonly<{ busy: boolean; message?: string; onRetry: () => void }>) {
  return <main className="subscription-return-page"><section aria-live="polite" aria-busy={busy} className="subscription-return-card"><span aria-hidden="true" className="subscription-return-icon">◷</span><p className="eyebrow">Regularização de cobrança</p><h1>Aguardando confirmação</h1><p>{message ?? "A confirmação é feita pelo Asaas e pelo backend. Esta página não considera o retorno da fatura como pagamento confirmado."}</p>{busy && <span className="subscription-return-progress">Consultando a situação do pagamento…</span>}<button className="auth-secondary-action" disabled={busy} onClick={onRetry} type="button">Consultar novamente</button></section></main>;
}

function SubscriptionPageContent() {
  return <SubscriptionScreen />;
}

export default function SubscriptionPage() {
  return <AuthProvider><SubscriptionPageContent /></AuthProvider>;
}
