"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError } from "../../lib/http/api-client";
import { isSafeHostedAsaasUrl, redirectToHostedAsaas } from "../../lib/billing/asaas-redirect";
import type { BillingSubscription } from "./subscription-data";

type Checkout = { checkoutUrl: string; status: string };
type Props = Readonly<{
  callback: boolean;
  callbackResult: string | null;
  client: ApiClient;
  farmId: string;
  onRefresh: () => void;
  subscription: BillingSubscription;
}>;

function normalizeTaxIdentifier(value: string) {
  return value.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();
}

export function SubscriptionActions({ callback, callbackResult, client, farmId, onRefresh, subscription }: Props) {
  const canCancel = ["Trial", "Active", "GracePeriod"].includes(subscription.status);
  const canRehire = subscription.status === "Cancelled" || (callback && subscription.status === "PendingSubscription" && ["cancelled", "expired"].includes(callbackResult ?? ""));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [errorNotice, setErrorNotice] = useState<string>();
  const csrfToken = useRef<string | undefined>(undefined);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const dialogHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (confirmCancel) dialogHeading.current?.focus();
    else cancelButton.current?.focus();
  }, [confirmCancel]);

  async function ensureCsrf() {
    if (!csrfToken.current) csrfToken.current = await client.fetchAntiforgeryToken();
  }

  async function cancelSubscription() {
    setIsCancelling(true);
    setErrorNotice(undefined);
    setNotice(undefined);
    try {
      client.setTenant(farmId);
      await ensureCsrf();
      await client.request<void>("api/billing/subscriptions", { method: "DELETE" });
      client.clearCache();
      setConfirmCancel(false);
      setNotice("A assinatura foi cancelada. Sua conta, seu criatório e seus dados continuam preservados.");
      onRefresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setErrorNotice("Sua sessão expirou. Entre novamente para continuar.");
      else if (cause instanceof ApiError && cause.status === 409) setErrorNotice("A assinatura não pode ser cancelada neste estado. Atualize os dados e tente novamente.");
      else setErrorNotice("Não foi possível cancelar a assinatura agora. Tente novamente em instantes.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function startRehire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTaxIdentifier(taxIdentifier);
    if (normalized.length !== 11 && normalized.length !== 14) {
      setFormError("Informe um CPF com 11 caracteres ou um CNPJ com 14 caracteres.");
      return;
    }
    setFormError(undefined);
    setNotice(undefined);
    setErrorNotice(undefined);
    setIsStartingCheckout(true);
    try {
      client.setTenant(farmId);
      await ensureCsrf();
      const result = await client.request<Checkout>("api/billing/subscription-checkouts", {
        body: JSON.stringify({ billingCycle, customerTaxIdentifier: normalized }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      if (result.status !== "pendingCheckout" || !isSafeHostedAsaasUrl(result.checkoutUrl)) throw new Error("Checkout indisponível");
      setTaxIdentifier("");
      redirectToHostedAsaas(result.checkoutUrl);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setErrorNotice("Sua sessão expirou. Entre novamente para continuar.");
      else if (cause instanceof ApiError && cause.status === 409) setErrorNotice("Não foi possível iniciar a recontratação para o estado atual da assinatura. Atualize os dados e tente novamente.");
      else if (cause instanceof ApiError && cause.status === 404) setErrorNotice("Somente o responsável pelo criatório pode iniciar a recontratação.");
      else setErrorNotice("Não foi possível iniciar o checkout. Tente novamente em instantes.");
    } finally {
      setIsStartingCheckout(false);
    }
  }

  function closeDialog(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !isCancelling) setConfirmCancel(false);
  }

  return <>
    {notice && <p className="subscription-action-notice" role="status">{notice}</p>}
    {errorNotice && <p className="subscription-action-notice subscription-action-notice-error" role="alert">{errorNotice}</p>}
    {subscription.status === "Cancelled" && <section className="subscription-actions-panel"><h2>Seus dados continuam guardados</h2><p>O cancelamento encerrou a assinatura sem apagar sua conta, seu criatório ou os dados registrados.</p></section>}
    {canCancel && <section className="subscription-actions-panel"><p>O cancelamento tem efeito imediato sobre a assinatura. Sua conta, seu criatório e os dados permanecem vinculados.</p><button className="subscription-danger-action" onClick={() => setConfirmCancel(true)} ref={cancelButton} type="button">Cancelar assinatura</button></section>}
    {subscription.status === "PendingSubscription" && !canRehire && <p className="subscription-action-help">A assinatura está em processamento. O retorno do checkout não ativa acesso; consulte o estado confirmado pelo backend.</p>}
    {canRehire && <section aria-labelledby="subscription-rehire-title" className="subscription-actions-panel subscription-rehire-panel"><p className="eyebrow">{subscription.status === "Cancelled" ? "Nova contratação" : "Nova tentativa"}</p><h2 id="subscription-rehire-title">Recontrate sua assinatura</h2><p>Escolha o ciclo de cobrança. O checkout é hospedado pelo Asaas; os dados do cartão não passam pelo Criatório Virtual.</p>
      <form className="subscription-rehire-form" onSubmit={(event) => void startRehire(event)}>
        <fieldset disabled={isStartingCheckout}><legend>Ciclo de cobrança</legend><label className="subscription-cycle-option"><input checked={billingCycle === "monthly"} name="billingCycle" onChange={() => setBillingCycle("monthly")} type="radio" value="monthly" /><span><strong>Mensal</strong><small>Cobrança mensal</small></span></label><label className="subscription-cycle-option"><input checked={billingCycle === "annual"} name="billingCycle" onChange={() => setBillingCycle("annual")} type="radio" value="annual" /><span><strong>Anual</strong><small>Cobrança anual</small></span></label></fieldset>
        <label className="subscription-tax-field" htmlFor="customer-tax-identifier">CPF ou CNPJ do responsável</label><input autoComplete="off" id="customer-tax-identifier" inputMode="text" maxLength={18} onChange={(event) => setTaxIdentifier(event.target.value)} value={taxIdentifier} aria-describedby={formError ? "tax-identifier-error" : "tax-identifier-help"} />
        {formError ? <p className="subscription-field-error" id="tax-identifier-error" role="alert">{formError}</p> : <p className="subscription-field-help" id="tax-identifier-help">Usado para preparar o checkout hospedado do Asaas.</p>}
        <button className="subscription-primary-action" disabled={isStartingCheckout} type="submit">{isStartingCheckout ? "Preparando checkout…" : "Continuar para o checkout seguro"}</button>
      </form>
    </section>}
    {confirmCancel && <div className="subscription-dialog-backdrop" onKeyDown={closeDialog} role="presentation"><section aria-labelledby="cancel-confirm-title" aria-modal="true" className="subscription-confirm-dialog" role="dialog"><h2 id="cancel-confirm-title" ref={dialogHeading} tabIndex={-1}>Cancelar assinatura agora?</h2><p>O cancelamento tem efeito imediato. Sua conta, seu criatório e os dados registrados continuam preservados.</p><div className="subscription-dialog-actions"><button className="subscription-secondary-action" disabled={isCancelling} onClick={() => setConfirmCancel(false)} type="button">Manter assinatura</button><button className="subscription-danger-action" disabled={isCancelling} onClick={() => void cancelSubscription()} type="button">{isCancelling ? "Cancelando…" : "Confirmar cancelamento"}</button></div></section></div>}
  </>;
}
