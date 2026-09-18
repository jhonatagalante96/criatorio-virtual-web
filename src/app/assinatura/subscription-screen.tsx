"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";

type FarmSelection = { breedingFarms: Array<{ breedingFarmId: string; isSelected: boolean; name: string }>; selectedBreedingFarmId: string | null };
type Subscription = { billingCycle: string; breedingFarmId: string; planCode: string; status: string; trialEndsAtUtc: string | null; nextChargeDueAtUtc: string | null; gracePeriodEndsAtUtc: string | null };
type Checkout = { checkoutId: string; checkoutUrl: string; expiresAtUtc: string | null; status: string; subscriptionId: string };
type ViewState = "blocked" | "error" | "loading" | "missing" | "ready";

function normalizeTaxIdentifier(value: string) { return value.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase(); }
function formatDate(value: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(date); }
function displayStatus(value: string) { return ({ Active: "Ativa", Cancelled: "Cancelada", GracePeriod: "Em período de tolerância", PendingSubscription: "Aguardando confirmação", Trial: "Em período de teste" } as Record<string, string>)[value] ?? "Em processamento"; }

function StateCard({ heading, message, onRetry }: Readonly<{ heading: string; message: string; onRetry?: () => void }>) {
  return <section className="subscription-state-card"><h2>{heading}</h2><p>{message}</p>{onRetry && <button className="subscription-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}<Link href="/dashboard">Voltar ao painel</Link></section>;
}

function SubscriptionScreen({ callback = false }: Readonly<{ callback?: boolean }>) {
  const { error: authError, refresh, session, status: authStatus } = useAuth();
  const [farmName, setFarmName] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [loadMessage, setLoadMessage] = useState("Carregando os dados da assinatura.");
  const [reloadKey, setReloadKey] = useState(0);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [errorNotice, setErrorNotice] = useState<string>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  if (!client.current) client.current = createApiClient(() => csrfToken.current);
  const callbackResult = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("result");

  useEffect(() => {
    if (authStatus !== "authenticated" || !session) return;
    let cancelled = false;
    const controller = new AbortController();
    setViewState("loading");
    setLoadMessage("Carregando os dados da assinatura.");
    async function load() {
      try {
        const selection = await client.current!.request<FarmSelection>("api/breeding-farms", { signal: controller.signal });
        if (cancelled) return;
        if (!selection.selectedBreedingFarmId) {
          setViewState("blocked");
          setLoadMessage(selection.breedingFarms.length ? "Selecione um criatório para gerenciar a assinatura." : "Crie um criatório antes de gerenciar uma assinatura.");
          return;
        }
        setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name ?? "Meu criatório");
        client.current!.setTenant(selection.selectedBreedingFarmId);
        const data = await client.current!.request<Subscription>("api/billing/subscription", { signal: controller.signal });
        if (cancelled) return;
        setSubscription(data);
        setViewState("ready");
      } catch (cause) {
        if (cancelled || cause instanceof StaleTenantResponseError) return;
        if (cause instanceof ApiError && cause.status === 404) { setSubscription(null); setViewState("missing"); return; }
        if (cause instanceof ApiError && cause.status === 409) { setViewState("blocked"); setLoadMessage("Selecione um criatório para consultar sua assinatura."); return; }
        if (cause instanceof ApiError && cause.status === 401) { const result = await refresh(); if (result.ok && !cancelled) setReloadKey((key) => key + 1); return; }
        setViewState("error");
        setLoadMessage(cause instanceof ApiError && cause.status >= 500 ? "O serviço de assinaturas está indisponível. Tente novamente em instantes." : "Não foi possível carregar a assinatura. Verifique sua conexão e tente novamente.");
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [authStatus, refresh, reloadKey, session]);

  useEffect(() => {
    if (!callback || ["cancelled", "expired"].includes(callbackResult ?? "") || viewState !== "ready" || subscription?.status !== "PendingSubscription" || pollAttempts >= 12) return;
    const timer = window.setTimeout(() => {
      client.current?.clearCache();
      setPollAttempts((attempts) => attempts + 1);
      setReloadKey((key) => key + 1);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [callback, callbackResult, pollAttempts, subscription?.status, viewState]);

  async function ensureCsrf() { if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken(); }
  async function cancelSubscription() {
    setIsCancelling(true); setErrorNotice(undefined); setNotice(undefined);
    try {
      await ensureCsrf();
      await client.current!.request<void>("api/billing/subscriptions", { method: "DELETE" });
      client.current!.clearCache();
      setConfirmCancel(false);
      setNotice("A assinatura foi cancelada. Sua conta, seu criatório e seus dados continuam preservados.");
      setReloadKey((key) => key + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { const result = await refresh(); setErrorNotice(result.ok ? "Atualizamos sua sessão. Tente confirmar o cancelamento novamente." : "Sua sessão expirou. Entre novamente para continuar."); }
      else if (cause instanceof ApiError && cause.status === 409) setErrorNotice("A assinatura não pode ser cancelada neste estado. Atualize os dados e tente novamente.");
      else setErrorNotice("Não foi possível cancelar a assinatura agora. Tente novamente em instantes.");
    } finally { setIsCancelling(false); }
  }

  async function startRehire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTaxIdentifier(taxIdentifier);
    if (normalized.length !== 11 && normalized.length !== 14) { setFormError("Informe um CPF com 11 caracteres ou um CNPJ com 14 caracteres."); return; }
    setFormError(undefined); setNotice(undefined); setErrorNotice(undefined); setIsStartingCheckout(true);
    try {
      await ensureCsrf();
      const result = await client.current!.request<Checkout>("api/billing/subscription-checkouts", { body: JSON.stringify({ billingCycle, customerTaxIdentifier: normalized }), headers: { "content-type": "application/json" }, method: "POST" });
      if (result.status !== "pendingCheckout" || !result.checkoutUrl) throw new Error("Checkout indisponível");
      setTaxIdentifier("");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { const refreshed = await refresh(); setErrorNotice(refreshed.ok ? "Atualizamos sua sessão. Tente iniciar a recontratação novamente." : "Sua sessão expirou. Entre novamente para continuar."); }
      else if (cause instanceof ApiError && cause.status === 409) setErrorNotice("Não foi possível iniciar a recontratação para o estado atual da assinatura. Atualize os dados e tente novamente.");
      else if (cause instanceof ApiError && cause.status === 404) setErrorNotice("Somente o responsável pelo criatório pode iniciar a recontratação.");
      else setErrorNotice("Não foi possível iniciar o checkout. Tente novamente em instantes.");
    } finally { setIsStartingCheckout(false); }
  }

  if (["loading", "authenticating", "signing-out"].includes(authStatus)) return <AppLoadingState activeNav="subscription" email={session?.email} label="Verificando sua sessão" message="Só um instante enquanto confirmamos seu acesso." />;
  if (authStatus === "error") return <StateCard heading="Não foi possível abrir a assinatura" message={authError ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (authStatus === "forbidden") return <StateCard heading="Acesso bloqueado" message={authError ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} />;
  if (authStatus !== "authenticated" || !session) return <StateCard heading="Entre para gerenciar sua assinatura" message="Faça login para consultar, cancelar ou recontratar a assinatura do seu criatório." />;
  if (viewState === "loading") return <AppLoadingState activeNav="subscription" email={session.email} label="Carregando assinatura" message={loadMessage} />;

  const callbackMessage = callback
    ? subscription?.status === "Trial" || subscription?.status === "Active"
      ? "Assinatura confirmada pelo backend. O acesso segue o estado autorizado recebido do serviço."
      : callbackResult === "cancelled" ? "O checkout foi cancelado. Sua assinatura não foi reativada. Você pode tentar novamente quando quiser."
        : callbackResult === "expired" ? "O link do checkout expirou. Confira os dados e inicie uma nova tentativa."
          : subscription?.status === "PendingSubscription"
            ? "Checkout recebido. Estamos aguardando a confirmação do backend; o redirecionamento não ativa a assinatura."
            : "Recebemos o retorno do checkout. A confirmação depende da atualização segura do backend."
    : undefined;
  const canRehire = subscription?.status === "Cancelled" || (callback && subscription?.status === "PendingSubscription" && ["cancelled", "expired"].includes(callbackResult ?? ""));
  const content = <div className="subscription-view">
    <nav aria-label="Navegação estrutural" className="subscription-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Assinatura</span></nav>
    <header className="subscription-header"><p className="eyebrow">Conta e cobrança</p><h1>{callback ? "Retorno do checkout" : "Assinatura"}</h1><p>Consulte o estado da assinatura e gerencie a continuidade do acesso ao seu criatório.</p></header>
    {callbackMessage && <p className="subscription-notice" role="status">{callbackMessage}</p>}
    {notice && <p className="subscription-notice" role="status">{notice}</p>}
    {errorNotice && <p className="subscription-notice subscription-notice-error" role="alert">{errorNotice}</p>}
    {callback && subscription?.status === "PendingSubscription" && pollAttempts >= 12 && <button className="subscription-secondary-action" onClick={() => { client.current?.clearCache(); setPollAttempts(0); setReloadKey((key) => key + 1); }} type="button">Atualizar status</button>}
    {viewState === "blocked" && <StateCard heading="Selecione um criatório" message={loadMessage} />}
    {viewState === "error" && <StateCard heading="Não foi possível carregar a assinatura" message={loadMessage} onRetry={() => setReloadKey((key) => key + 1)} />}
    {viewState === "missing" && <section className="subscription-panel"><p className="subscription-kicker">{farmName}</p><h2>Nenhuma assinatura encontrada</h2><p>Não há uma assinatura vinculada ao criatório selecionado. A contratação inicial é feita pelo fluxo de contratação da conta.</p><Link className="subscription-secondary-action" href="/dashboard">Voltar ao painel</Link></section>}
    {viewState === "ready" && subscription && <>
      <section aria-labelledby="subscription-summary-title" className="subscription-panel">
        <div className="subscription-panel-heading"><div><p className="subscription-kicker">{farmName}</p><h2 id="subscription-summary-title">Plano {subscription.billingCycle.toLowerCase() === "annual" ? "anual" : "mensal"}</h2></div><span className={`subscription-status${subscription.status === "Cancelled" ? " is-cancelled" : ""}`}>{displayStatus(subscription.status)}</span></div>
        <dl className="subscription-details"><div><dt>Plano</dt><dd>{subscription.planCode}</dd></div>{subscription.trialEndsAtUtc && <div><dt>Fim do período de teste</dt><dd>{formatDate(subscription.trialEndsAtUtc) ?? "Data indisponível"}</dd></div>}{subscription.nextChargeDueAtUtc && <div><dt>Próxima cobrança</dt><dd>{formatDate(subscription.nextChargeDueAtUtc) ?? "Data indisponível"}</dd></div>}{subscription.gracePeriodEndsAtUtc && <div><dt>Fim do período de tolerância</dt><dd>{formatDate(subscription.gracePeriodEndsAtUtc) ?? "Data indisponível"}</dd></div>}</dl>
        {subscription.status === "Cancelled" ? <div className="subscription-cancelled-copy"><h3>Seus dados continuam guardados</h3><p>O cancelamento encerra a assinatura sem apagar sua conta, seu criatório ou os dados registrados.</p></div> : ["Trial", "Active", "GracePeriod"].includes(subscription.status) ? <div className="subscription-cancel-action"><p>O cancelamento tem efeito imediato sobre a assinatura. Seus dados permanecem vinculados à sua conta.</p><button className="subscription-danger-action" onClick={() => setConfirmCancel(true)} type="button">Cancelar assinatura</button></div> : callbackResult === "cancelled" || callbackResult === "expired" ? <p className="subscription-field-help">Esta tentativa não iniciou uma assinatura. Seus dados continuam preservados; você pode gerar um novo checkout abaixo.</p> : <p className="subscription-field-help">A assinatura está em processamento. Atualize esta página para consultar o estado confirmado pelo backend.</p>}
      </section>
      {canRehire && <section aria-labelledby="subscription-rehire-title" className="subscription-panel subscription-rehire-panel"><p className="subscription-kicker">{subscription.status === "Cancelled" ? "Nova contratação" : "Nova tentativa"}</p><h2 id="subscription-rehire-title">Recontrate sua assinatura</h2><p>Escolha o ciclo de cobrança. O checkout é hospedado pelo Asaas; os dados do cartão não passam pelo Criatório Virtual.</p>
        <form className="subscription-rehire-form" onSubmit={(event) => void startRehire(event)}>
          <fieldset disabled={isStartingCheckout}><legend>Ciclo de cobrança</legend><label className="subscription-cycle-option"><input checked={billingCycle === "monthly"} name="billingCycle" onChange={() => setBillingCycle("monthly")} type="radio" value="monthly" /><span><strong>Mensal</strong><small>Cobrança mensal</small></span></label><label className="subscription-cycle-option"><input checked={billingCycle === "annual"} name="billingCycle" onChange={() => setBillingCycle("annual")} type="radio" value="annual" /><span><strong>Anual</strong><small>Cobrança anual</small></span></label></fieldset>
          <label className="subscription-tax-field" htmlFor="customer-tax-identifier">CPF ou CNPJ do responsável</label><input autoComplete="off" id="customer-tax-identifier" inputMode="text" maxLength={18} onChange={(event) => setTaxIdentifier(event.target.value)} value={taxIdentifier} aria-describedby={formError ? "tax-identifier-error" : "tax-identifier-help"} />
          {formError ? <p className="subscription-field-error" id="tax-identifier-error" role="alert">{formError}</p> : <p className="subscription-field-help" id="tax-identifier-help">Usado para preparar o checkout hospedado do Asaas.</p>}
          <button className="subscription-primary-action" disabled={isStartingCheckout} type="submit">{isStartingCheckout ? "Preparando checkout…" : "Continuar para o checkout seguro"}</button>
        </form>
      </section>}
    </>}
    {confirmCancel && <div className="subscription-dialog-backdrop" role="presentation"><section aria-labelledby="cancel-confirm-title" aria-modal="true" className="subscription-confirm-dialog" role="dialog"><h2 id="cancel-confirm-title">Cancelar assinatura agora?</h2><p>O cancelamento tem efeito imediato. Sua conta, seu criatório e os dados registrados continuam preservados.</p><div className="subscription-dialog-actions"><button className="subscription-secondary-action" disabled={isCancelling} onClick={() => setConfirmCancel(false)} type="button">Manter assinatura</button><button className="subscription-danger-action" disabled={isCancelling} onClick={() => void cancelSubscription()} type="button">{isCancelling ? "Cancelando…" : "Confirmar cancelamento"}</button></div></section></div>}
  </div>;
  return <AuthenticatedShell activeNav="subscription" email={session.email} farmName={farmName}>{content}</AuthenticatedShell>;
}

export function SubscriptionPage({ callback = false }: Readonly<{ callback?: boolean }>) { return <AuthProvider><SubscriptionScreen callback={callback} /></AuthProvider>; }






