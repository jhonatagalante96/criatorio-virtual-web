export interface BillingSubscription {
  billingCycle: string;
  breedingFarmId: string;
  createdAtUtc: string;
  firstChargeDueAtUtc: string | null;
  gracePeriodDaysRemaining: number | null;
  gracePeriodEndsAtUtc: string | null;
  gracePeriodStartedAtUtc: string | null;
  nextChargeDueAtUtc: string | null;
  planCode: string;
  status: string;
  trialEndsAtUtc: string | null;
  trialStartedAtUtc: string | null;
  updatedAtUtc: string;
}

export interface BillingPayment {
  amount: number;
  createdAtUtc: string;
  currencyCode: string;
  dueAtUtc: string;
  paidAtUtc: string | null;
  paymentId: string;
  status: string;
}

export interface BillingPaymentsResponse {
  breedingFarmId: string;
  items: BillingPayment[];
  page: number;
  pageSize: number;
  totalCount: number;
}

const subscriptionStatuses: Record<string, string> = {
  Active: "Ativa",
  Blocked: "Bloqueada",
  Cancelled: "Cancelada",
  Canceled: "Cancelada",
  GracePeriod: "Em período de tolerância",
  Pending: "Pendente",
  PendingSubscription: "Aguardando assinatura",
  Trial: "Período gratuito"
};

const paymentStatuses: Record<string, string> = {
  Cancelled: "Cancelada",
  Canceled: "Cancelada",
  Confirmed: "Paga",
  Failed: "Não aprovada",
  Paid: "Paga",
  Pending: "Pendente",
  Refunded: "Estornada"
};

export function billingStatusLabel(status: string): string {
  return subscriptionStatuses[status] ?? status;
}

export function paymentStatusLabel(status: string): string {
  return paymentStatuses[status] ?? status;
}

export function formatBillingDate(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

export function formatBillingAmount(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" }).format(amount);
  } catch {
    return `${amount.toLocaleString("pt-BR")} ${currencyCode}`;
  }
}
