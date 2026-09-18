import { afterEach, describe, expect, it } from "vitest";
import { findCurrentRegularizablePayment, isSafeHostedInvoiceUrl, paymentAndSubscriptionAllowAccess, readPendingRegularizationReturn, savePendingRegularizationReturn, clearPendingRegularizationReturn } from "./regularization";
import type { BillingPaymentsResponse, BillingSubscription } from "./subscription-data";

const subscription = {
  billingCycle: "Monthly",
  breedingFarmId: "farm-id",
  createdAtUtc: "2026-01-01T00:00:00Z",
  firstChargeDueAtUtc: null,
  gracePeriodDaysRemaining: 0,
  gracePeriodEndsAtUtc: null,
  gracePeriodStartedAtUtc: null,
  nextChargeDueAtUtc: "2026-02-15T12:00:00Z",
  planCode: "small-bird",
  status: "Blocked",
  trialEndsAtUtc: null,
  trialStartedAtUtc: null,
  updatedAtUtc: "2026-02-15T12:00:00Z"
} satisfies BillingSubscription;

const payments = {
  breedingFarmId: "farm-id",
  items: [
    { amount: 119.5, createdAtUtc: "2026-02-15T12:00:00Z", currencyCode: "BRL", dueAtUtc: "2026-02-15T12:00:00Z", paidAtUtc: null, paymentId: "due-payment", status: "Pending" },
    { amount: 119.5, createdAtUtc: "2026-01-15T12:00:00Z", currencyCode: "BRL", dueAtUtc: "2026-01-15T12:00:00Z", paidAtUtc: null, paymentId: "older-payment", status: "Failed" }
  ],
  page: 1,
  pageSize: 20,
  totalCount: 2
} satisfies BillingPaymentsResponse;

afterEach(() => window.sessionStorage.clear());

describe("hosted invoice regularization", () => {
  it("selects only the current due payment for a blocked or grace period subscription", () => {
    expect(findCurrentRegularizablePayment(subscription, payments)?.paymentId).toBe("due-payment");
    expect(findCurrentRegularizablePayment({ ...subscription, status: "Active" }, payments)).toBeUndefined();
    expect(findCurrentRegularizablePayment(subscription, { ...payments, items: [] })).toBeUndefined();
  });

  it("accepts only HTTPS Asaas invoice hosts", () => {
    expect(isSafeHostedInvoiceUrl("https://www.asaas.com/i/abc")).toBe(true);
    expect(isSafeHostedInvoiceUrl("https://asaas.com/i/abc")).toBe(true);
    expect(isSafeHostedInvoiceUrl("http://asaas.com/i/abc")).toBe(false);
    expect(isSafeHostedInvoiceUrl("https://asaas.com.attacker.example/i/abc")).toBe(false);
    expect(isSafeHostedInvoiceUrl("https://attacker.example/?next=https://asaas.com")).toBe(false);
  });

  it("requires confirmed payment and an access-permitting subscription before restoring access", () => {
    expect(paymentAndSubscriptionAllowAccess("Confirmed", "Active")).toBe(true);
    expect(paymentAndSubscriptionAllowAccess("Pending", "Blocked")).toBe(false);
    expect(paymentAndSubscriptionAllowAccess("Confirmed", "Blocked")).toBe(false);
    expect(paymentAndSubscriptionAllowAccess("Confirmed", "GracePeriod")).toBe(false);
  });

  it("persists only the farm and payment identifiers for the return check", () => {
    savePendingRegularizationReturn({ breedingFarmId: "farm-id", paymentId: "due-payment" });
    expect(readPendingRegularizationReturn()).toEqual({ breedingFarmId: "farm-id", paymentId: "due-payment" });
    clearPendingRegularizationReturn();
    expect(readPendingRegularizationReturn()).toBeNull();
  });
});
