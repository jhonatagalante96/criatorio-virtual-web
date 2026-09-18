export interface BillingSubscription {
  billingCycle: string;
  status: string;
  trialEndsAtUtc?: string | null;
}

export function hasSubscriptionAccess(status: string): boolean {
  return status === "Trial" || status === "Active" || status === "GracePeriod";
}
