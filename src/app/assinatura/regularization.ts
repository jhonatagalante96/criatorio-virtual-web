import type { BillingPayment, BillingPaymentsResponse, BillingSubscription } from "./subscription-data";
import { isSafeHostedAsaasUrl, redirectToHostedAsaas } from "../../lib/billing/asaas-redirect";

export interface HostedInvoiceRegularizationResponse {
  paymentId: string;
  paymentStatus: string;
  paymentUrl: string;
  status: "awaitingCustomerPayment";
}

export interface PendingRegularizationReturn {
  breedingFarmId: string;
  paymentId: string;
}

const returnStorageKey = "criatorio-billing-hosted-invoice-return";

export function findCurrentRegularizablePayment(
  subscription: BillingSubscription | null,
  payments: BillingPaymentsResponse
): BillingPayment | undefined {
  if (!subscription || !["Blocked", "GracePeriod"].includes(subscription.status) || !subscription.nextChargeDueAtUtc) return undefined;
  const dueDate = new Date(subscription.nextChargeDueAtUtc);
  if (Number.isNaN(dueDate.getTime())) return undefined;
  const currentDueDate = dueDate.toISOString().slice(0, 10);
  return payments.items.find((payment) => {
    const paymentDueDate = new Date(payment.dueAtUtc);
    return !Number.isNaN(paymentDueDate.getTime()) &&
      paymentDueDate.toISOString().slice(0, 10) === currentDueDate &&
      payment.status === "Pending";
  });
}

export function isSafeHostedInvoiceUrl(value: string): boolean {
  return isSafeHostedAsaasUrl(value);
}

export function paymentAndSubscriptionAllowAccess(paymentStatus: string, subscriptionStatus: string): boolean {
  return paymentStatus === "Confirmed" && subscriptionStatus === "Active";
}

export function readPendingRegularizationReturn(): PendingRegularizationReturn | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(returnStorageKey);
    if (!value) return null;
    const pending = JSON.parse(value) as Partial<PendingRegularizationReturn>;
    return typeof pending.breedingFarmId === "string" && pending.breedingFarmId.length > 0 &&
      typeof pending.paymentId === "string" && pending.paymentId.length > 0
      ? { breedingFarmId: pending.breedingFarmId, paymentId: pending.paymentId }
      : null;
  } catch {
    return null;
  }
}

export function savePendingRegularizationReturn(pending: PendingRegularizationReturn): void {
  window.sessionStorage.setItem(returnStorageKey, JSON.stringify(pending));
}

export function clearPendingRegularizationReturn(): void {
  window.sessionStorage.removeItem(returnStorageKey);
}

export function redirectToHostedInvoice(url: string): void {
  redirectToHostedAsaas(url);
}
