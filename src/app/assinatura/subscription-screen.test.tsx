import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../../lib/http/api-client";
import type { BillingSubscription } from "./subscription-data";
import { SubscriptionActions } from "./subscription-screen";

const { mockRequest, mockFetchAntiforgeryToken, mockRefresh, mockSetTenant, mockClearCache } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockFetchAntiforgeryToken: vi.fn(),
  mockRefresh: vi.fn(),
  mockSetTenant: vi.fn(),
  mockClearCache: vi.fn()
}));

const client = {
  clearCache: mockClearCache,
  fetchAntiforgeryToken: mockFetchAntiforgeryToken,
  request: mockRequest,
  setTenant: mockSetTenant
} as unknown as ApiClient;

const trialSubscription = { billingCycle: "Monthly", breedingFarmId: "farm-1", status: "Trial" } as BillingSubscription;
const cancelledSubscription = { ...trialSubscription, status: "Cancelled" };
const pendingSubscription = { ...trialSubscription, status: "PendingSubscription" };
const onRefresh = vi.fn();

function renderActions(subscription: BillingSubscription, callback = false, callbackResult: string | null = null) {
  return render(<SubscriptionActions callback={callback} callbackResult={callbackResult} client={client} farmId="farm-1" onRefresh={onRefresh} subscription={subscription} />);
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAntiforgeryToken.mockResolvedValue("csrf-test-token");
  mockRequest.mockResolvedValue(undefined);
});

describe("SubscriptionActions", () => {
  it("confirms cancellation and refreshes the preserved subscription data", async () => {
    renderActions(trialSubscription);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    expect((await screen.findByRole("dialog")).textContent).toContain("Sua conta, seu criatório e os dados registrados continuam preservados.");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("api/billing/subscriptions", { method: "DELETE" }));
    expect(await screen.findByText(/A assinatura foi cancelada/)).toBeTruthy();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(mockClearCache).toHaveBeenCalledOnce();
  });

  it("starts rehire through the hosted checkout contract without collecting card details", async () => {
    mockRequest.mockRejectedValue(new ApiError(502, "Checkout indisponível"));
    renderActions(cancelledSubscription);

    fireEvent.change(await screen.findByLabelText("CPF ou CNPJ do responsável"), { target: { value: "123.456.789-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o checkout seguro" }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("api/billing/subscription-checkouts", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ billingCycle: "monthly", customerTaxIdentifier: "12345678901" })
    })));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível iniciar o checkout");
    expect(screen.queryByLabelText(/cartão|cvv/i)).toBeNull();
  });

  it("allows a new checkout attempt after a cancelled hosted-checkout return", async () => {
    renderActions(pendingSubscription, true, "cancelled");
    expect(await screen.findByLabelText("CPF ou CNPJ do responsável")).toBeTruthy();
  });

  it("rejects invalid tax identifiers before calling the API", async () => {
    renderActions(cancelledSubscription);
    fireEvent.change(await screen.findByLabelText("CPF ou CNPJ do responsável"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o checkout seguro" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Informe um CPF com 11 caracteres");
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
