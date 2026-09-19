import { redirectToHostedAsaas } from "../../lib/billing/asaas-redirect";

export function navigateToHostedCheckout(url: string): void {
  redirectToHostedAsaas(url);
}
