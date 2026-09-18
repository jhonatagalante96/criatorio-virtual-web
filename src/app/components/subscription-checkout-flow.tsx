"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { useAccessContext } from "../../lib/auth/access-provider";
import type { AccessContextResult } from "../../lib/auth/access-context";
import { ApiClient, ApiError, createApiClient } from "../../lib/http/api-client";
import { BillingSubscription, hasSubscriptionAccess } from "../../lib/billing/subscription-access";
import { sanitizeHostedAsaasUrl } from "../../lib/billing/asaas-redirect";
import { AppLoadingState } from "./app-loading-state";
import { BrandLockup, BrandPanel } from "./brand";
import { navigateToHostedCheckout } from "./hosted-checkout-navigation";

type BillingCycle = "annual" | "monthly";
type CheckoutResult = "cancelled" | "expired" | "success" | undefined;
const subscriptionCheckDelaysMs = [3000, 5000, 10000, 15000] as const;

interface CreateCheckoutResponse {
  checkoutId: string;
  checkoutUrl: string;
  expiresAtUtc: string | null;
  status: "pendingCheckout";
  subscriptionId: string;
}

type BillingView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "farm-selection" }
  | { kind: "no-subscription" }
  | { kind: "pending"; subscription: BillingSubscription }
  | { kind: "cancelled"; subscription: BillingSubscription }
  | { kind: "blocked"; subscription: BillingSubscription }
  | { kind: "access" };

function normalizeTaxIdentifier(value: string): string {
  return value.replace(/[^a-z\d]/gi, "").toUpperCase();
}

function isTaxIdentifierValid(value: string): boolean {
  const normalized = normalizeTaxIdentifier(value);
  return /^\d{11}$/.test(normalized) || /^[A-Z\d]{14}$/.test(normalized);
}

function checkoutResultFromLocation(isReturn: boolean): CheckoutResult {
  if (!isReturn || typeof window === "undefined") return undefined;
  const result = new URLSearchParams(window.location.search).get("result");
  return result === "success" || result === "cancelled" || result === "expired" ? result : undefined;
}

function CheckoutForm({
  initialCycle = "monthly",
  pending,
  onCheckout,
  error,
  isSubmitting
}: Readonly<{
  initialCycle?: BillingCycle;
  pending: boolean;
  onCheckout: (billingCycle: BillingCycle, taxIdentifier: string) => void;
  error?: string;
  isSubmitting: boolean;
}>) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialCycle);
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [taxIdentifierError, setTaxIdentifierError] = useState<string>();

  useEffect(() => setBillingCycle(initialCycle), [initialCycle]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isTaxIdentifierValid(taxIdentifier)) {
      setTaxIdentifierError("Informe um CPF com 11 dígitos ou um CNPJ com 14 caracteres.");
      return;
    }
    setTaxIdentifierError(undefined);
    onCheckout(billingCycle, normalizeTaxIdentifier(taxIdentifier));
  }

  return (
    <form className="subscription-checkout-form" noValidate onSubmit={submit}>
      <fieldset className="subscription-plan-fieldset" disabled={isSubmitting || (pending && initialCycle !== undefined)}>
        <legend>Escolha a periodicidade</legend>
        <label className={`subscription-plan-choice${billingCycle === "monthly" ? " is-selected" : ""}`}>
          <input
            checked={billingCycle === "monthly"}
            name="billingCycle"
            onChange={() => setBillingCycle("monthly")}
            type="radio"
            value="monthly"
          />
          <span className="subscription-plan-copy"><strong>Mensal</strong><small>Cobrança todo mês</small></span>
          <span className="subscription-plan-price"><strong>R$ 19,90</strong><small>por mês</small></span>
        </label>
        <label className={`subscription-plan-choice${billingCycle === "annual" ? " is-selected" : ""}`}>
          <input
            checked={billingCycle === "annual"}
            name="billingCycle"
            onChange={() => setBillingCycle("annual")}
            type="radio"
            value="annual"
          />
          <span className="subscription-plan-copy"><strong>Anual <span className="subscription-savings">2 meses grátis</span></strong><small>Uma cobrança por ano</small></span>
          <span className="subscription-plan-price"><strong>R$ 199,90</strong><small>por ano</small></span>
        </label>
      </fieldset>

      {pending && <p className="subscription-pending-note">Há uma contratação em andamento. Você pode continuar o checkout com segurança; a API reaproveita a contratação pendente.</p>}

      <div className="field-group subscription-tax-field">
        <label htmlFor="customer-tax-identifier">CPF ou CNPJ</label>
        <input
          aria-describedby={taxIdentifierError ? "customer-tax-identifier-error" : "customer-tax-identifier-help"}
          aria-invalid={Boolean(taxIdentifierError)}
          autoComplete="off"
          disabled={isSubmitting}
          id="customer-tax-identifier"
          inputMode="text"
          maxLength={32}
          onChange={(event) => {
            setTaxIdentifier(event.target.value);
            setTaxIdentifierError(undefined);
          }}
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          value={taxIdentifier}
        />
        {taxIdentifierError
          ? <p className="field-error" id="customer-tax-identifier-error">{taxIdentifierError}</p>
          : <p className="field-help" id="customer-tax-identifier-help">Esse dado será usado pelo Asaas para identificar a contratação.</p>}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Preparando checkout…" : pending ? "Continuar para o checkout" : "Continuar para o pagamento"}
      </button>
      <p className="subscription-secure-note">O pagamento será concluído no ambiente seguro do Asaas. Não informe dados de cartão nesta página.</p>
    </form>
  );
}

function CheckoutContent({ isReturn }: Readonly<{ isReturn: boolean }>) {
  const { error: authenticationError, refresh, session, status } = useAuth();
  const access = useAccessContext();
  const router = useRouter();
  const api = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const [view, setView] = useState<BillingView>({ kind: "loading" });
  const [checkoutError, setCheckoutError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [subscription, setSubscription] = useState<BillingSubscription>();
  const [result] = useState(() => checkoutResultFromLocation(isReturn));
  const [isCheckingAgain, setIsCheckingAgain] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (!api.current) api.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    let cancelled = false;
    let timeout: number | undefined;
    let checkAgainCount = 0;
    let isInitialCheck = true;

    async function checkSubscription() {
      if (isInitialCheck) setView({ kind: "loading" });
      isInitialCheck = false;
      try {
        api.current!.clearCache();
        const current = await api.current!.request<BillingSubscription>("api/billing/subscription");
        if (cancelled) return;
        setSubscription(current);
        if (hasSubscriptionAccess(current.status)) {
          let freshAccess: AccessContextResult | undefined;
          try {
            freshAccess = access?.refetch ? await access.refetch() : undefined;
          } catch {
            freshAccess = undefined;
          }
          if (cancelled) return;
          if (freshAccess?.access?.canAccessApp === true) {
            setView({ kind: "access" });
            router.replace("/dashboard");
            return;
          }
          setView({
            kind: "pending",
            subscription: current
          });
          return;
        }
        if (current.status === "PendingSubscription") {
          setView({ kind: result === "cancelled" || result === "expired" ? "cancelled" : "pending", subscription: current });
          if (result === "success") {
            const delay = subscriptionCheckDelaysMs[Math.min(checkAgainCount, subscriptionCheckDelaysMs.length - 1)];
            checkAgainCount += 1;
            timeout = window.setTimeout(() => void checkSubscription(), delay);
          }
          return;
        }
        if (current.status === "Cancelled") {
          setView({ kind: "cancelled", subscription: current });
          return;
        }
        setView({ kind: "blocked", subscription: current });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setSubscription(undefined);
          setView({ kind: "no-subscription" });
          return;
        }
        if (error instanceof ApiError && error.status === 409) {
          setView({ kind: "farm-selection" });
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          const refreshed = await refresh();
          if (cancelled) return;
          setView({
            kind: "error",
            message: refreshed.ok
              ? "Não foi possível verificar a assinatura. Tente novamente."
              : refreshed.error ?? "Sua sessão expirou. Entre novamente para continuar."
          });
          return;
        }
        setView({
          kind: "error",
          message: error instanceof ApiError && error.status >= 500
            ? "O serviço está indisponível no momento. Tente novamente em instantes."
            : "Não foi possível verificar sua assinatura. Tente novamente."
        });
      }
    }

    void checkSubscription();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [refresh, result, retryVersion, router, session, status]);

  useEffect(() => {
    if (view.kind === "loading") return;
    headingRef.current?.focus();
  }, [view.kind]);

  async function startCheckout(billingCycle: BillingCycle, taxIdentifier: string) {
    setIsSubmitting(true);
    setCheckoutError(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await api.current!.fetchAntiforgeryToken();
      const checkout = await api.current!.request<CreateCheckoutResponse>("api/billing/subscription-checkouts", {
        body: JSON.stringify({ billingCycle, customerTaxIdentifier: taxIdentifier }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const checkoutUrl = sanitizeHostedAsaasUrl(checkout.checkoutUrl);
      if (checkout.status !== "pendingCheckout" || !checkout.checkoutId || !checkout.subscriptionId || !checkoutUrl) {
        setCheckoutError("Não foi possível abrir o checkout seguro. Tente novamente em instantes.");
        return;
      }
      navigateToHostedCheckout(checkoutUrl);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCheckoutError("Sua sessão expirou. Entre novamente para continuar.");
      } else if (error instanceof ApiError && error.status === 404 && error.message === "The selected breeding farm was not found.") {
        setCheckoutError("Não foi possível contratar o criatório selecionado. Confira se este é o criatório correto e se sua conta tem autorização de responsável.");
      } else if (error instanceof ApiError && error.status === 404) {
        setCheckoutError("O serviço de contratação não está disponível no momento. Tente novamente em instantes.");
      } else if (error instanceof ApiError && error.status === 400) {
        setCheckoutError("Confira o CPF ou CNPJ e a periodicidade antes de continuar.");
      } else if (error instanceof ApiError && error.status === 409) {
        setCheckoutError("A assinatura mudou enquanto você preenchia o formulário. Atualizando os dados…");
        setRetryVersion((current) => current + 1);
      } else {
        setCheckoutError("Não foi possível preparar o checkout agora. Tente novamente em instantes.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function refreshSubscription() {
    setIsCheckingAgain(true);
    setRetryVersion((current) => current + 1);
    window.setTimeout(() => setIsCheckingAgain(false), 500);
  }

  if (status === "loading" || status === "authenticating" || (status === "authenticated" && view.kind === "loading")) {
    return <AppLoadingState label="Verificando assinatura" message="Um instante enquanto confirmamos seu acesso." />;
  }

  const returnPath = isReturn && typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : "/assinatura";
  let content: React.ReactNode;
  if (status === "error" || status === "forbidden") {
    content = (
      <div className="auth-state-card">
        <BrandLockup stacked />
        <h1 ref={headingRef} tabIndex={-1}>{status === "forbidden" ? "Acesso não autorizado" : "Não foi possível restaurar sua sessão"}</h1>
        <p className="lede">{authenticationError ?? "Verifique sua conexão e tente novamente."}</p>
        <button className="auth-secondary-action" onClick={() => void refresh()} type="button">Tentar novamente</button>
        <Link className="text-action" href={`/login?returnUrl=${encodeURIComponent(returnPath)}`}>Voltar para o login</Link>
      </div>
    );
  } else if (status !== "authenticated" || !session) {
    content = (
      <div className="auth-state-card">
        <BrandLockup stacked />
        <h1 ref={headingRef} tabIndex={-1}>Entre para continuar</h1>
        <p className="lede">Acesse sua conta para concluir a contratação da assinatura.</p>
        <Link className="auth-primary-action" href={`/login?returnUrl=${encodeURIComponent(returnPath)}`}>Entrar na conta</Link>
      </div>
    );
  } else if (view.kind === "error") {
    content = (
      <div className="auth-state-card">
        <BrandLockup stacked />
        <h1 ref={headingRef} tabIndex={-1}>Não foi possível verificar o acesso</h1>
        <p className="lede">{view.message}</p>
        <button className="auth-secondary-action" onClick={refreshSubscription} type="button">Tentar novamente</button>
        <Link className="text-action" href="/login">Voltar para o login</Link>
      </div>
    );
  } else if (view.kind === "farm-selection") {
    content = (
      <div className="auth-state-card">
        <BrandLockup stacked />
        <h1 ref={headingRef} tabIndex={-1}>Escolha um criatório</h1>
        <p className="lede">Selecione o criatório que terá esta assinatura.</p>
        <Link className="auth-primary-action" href="/onboarding/criatorio/selecionar">Selecionar criatório</Link>
      </div>
    );
  } else if (view.kind === "access") {
    content = (
      <div className="auth-state-card">
        <BrandLockup stacked />
        <h1 ref={headingRef} tabIndex={-1}>Acesso confirmado</h1>
        <p className="lede">Estamos abrindo seu criatório.</p>
      </div>
    );
  } else if (view.kind === "blocked") {
    content = (
      <div className="auth-state-card">
        <BrandLockup stacked />
        <h1 ref={headingRef} tabIndex={-1}>Assinatura sem acesso ativo</h1>
        <p className="lede">O backend ainda não confirmou uma assinatura com acesso liberado. Consulte a situação da cobrança ou fale com o suporte.</p>
        <button className="auth-secondary-action" onClick={refreshSubscription} type="button">{isCheckingAgain ? "Verificando…" : "Verificar novamente"}</button>
      </div>
    );
  } else {
    const isPending = view.kind === "pending";
    const initialCycle: BillingCycle | undefined = subscription?.billingCycle.toLowerCase() === "annual"
      ? "annual"
      : subscription?.billingCycle.toLowerCase() === "monthly" ? "monthly" : undefined;
    const pendingCopy = result === "success"
      ? "Recebemos seu retorno. A confirmação depende da atualização segura do backend e pode levar alguns instantes."
      : result === "cancelled"
        ? "O checkout foi cancelado. Você pode retomá-lo quando quiser."
        : result === "expired"
          ? "O checkout expirou. Selecione a periodicidade e gere um novo link seguro."
          : "Sua contratação está aguardando confirmação. O acesso será liberado assim que o backend confirmar o trial.";
    content = (
      <div className="subscription-checkout-content">
        <div className="auth-mobile-brand"><BrandLockup stacked /></div>
        <p className="eyebrow">Plano Criatório Virtual</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {view.kind === "cancelled"
            ? result === "expired" ? "Checkout expirado" : "Checkout encerrado"
            : isPending ? "Aguardando confirmação" : "Escolha sua assinatura"}
        </h1>
        <p className="lede">
          {view.kind === "cancelled"
            ? pendingCopy
            : isPending ? pendingCopy : "Comece com 7 dias grátis. Depois, a cobrança seguirá a periodicidade escolhida no ambiente seguro do Asaas."}
        </p>
        {isPending && result === "success" && (
          <div className="subscription-pending-panel" role="status">
            <span aria-hidden="true" className="subscription-status-dot" />
            <span>Estamos consultando o status da assinatura. Esta tela atualizará quando o trial for confirmado.</span>
            <button className="auth-secondary-action" disabled={isCheckingAgain} onClick={refreshSubscription} type="button">
              {isCheckingAgain ? "Verificando…" : "Verificar agora"}
            </button>
          </div>
        )}
        {(view.kind === "no-subscription" || view.kind === "cancelled" || (view.kind === "pending" && result !== "success")) && (
          <CheckoutForm
            error={checkoutError}
            initialCycle={initialCycle}
            isSubmitting={isSubmitting}
            onCheckout={(cycle, identifier) => void startCheckout(cycle, identifier)}
            pending={subscription?.status === "PendingSubscription"}
          />
        )}
        <Link className="text-action" href="/">Voltar para a página inicial</Link>
      </div>
    );
  }

  return (
    <main className="auth-page subscription-checkout-page">
      <a className="skip-link" href="#subscription-checkout-main">Pular para o conteúdo</a>
      <div className="auth-shell subscription-checkout-shell">
        <BrandPanel />
        <section aria-label="Assinatura" className="auth-form-panel subscription-checkout-panel">
          <div className="auth-form-panel-content" id="subscription-checkout-main">{content}</div>
        </section>
      </div>
    </main>
  );
}

export function SubscriptionCheckoutFlow({ isReturn = false }: Readonly<{ isReturn?: boolean }>) {
  return (
    <AuthProvider>
      <CheckoutContent isReturn={isReturn} />
    </AuthProvider>
  );
}
