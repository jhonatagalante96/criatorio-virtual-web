import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/http/api-client";
import { SubscriptionPage } from "./subscription-screen";

const { mockRequest, mockFetchAntiforgeryToken, mockRefresh, mockSetTenant, mockClearCache, mockSession } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockFetchAntiforgeryToken: vi.fn(),
  mockRefresh: vi.fn(),
  mockSetTenant: vi.fn(),
  mockClearCache: vi.fn(),
  mockSession: { email: "criador@example.test", emailConfirmed: true, userId: "user-1" }
}));

vi.mock("../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ error: undefined, refresh: mockRefresh, session: mockSession, status: "authenticated" })
}));

vi.mock("../../lib/http/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/http/api-client")>("../../lib/http/api-client");
  return {
    ...actual,
    createApiClient: () => ({ clearCache: mockClearCache, fetchAntiforgeryToken: mockFetchAntiforgeryToken, request: mockRequest, setTenant: mockSetTenant })
  };
});

const activeSubscription = {
  billingCycle: "monthly", breedingFarmId: "farm-1", planCode: "standard", status: "Trial",
  trialEndsAtUtc: "2026-09-25T12:00:00Z", nextChargeDueAtUtc: "2026-09-25T12:00:00Z", gracePeriodEndsAtUtc: null
};
const cancelledSubscription = { ...activeSubscription, status: "Cancelled", trialEndsAtUtc: null, nextChargeDueAtUtc: null };
const pendingSubscription = { ...activeSubscription, status: "PendingSubscription", trialEndsAtUtc: null, nextChargeDueAtUtc: null };

function setSubscription(subscription: typeof activeSubscription | typeof cancelledSubscription | typeof pendingSubscription) {
  mockRequest.mockImplementation(async (path: string, options: { method?: string } = {}) => {
    if (path === "api/breeding-farms") return { breedingFarms: [{ breedingFarmId: "farm-1", isSelected: true, name: "Criatório Aurora" }], selectedBreedingFarmId: "farm-1" };
    if (path === "api/billing/subscription") return subscription;
    if (path === "api/billing/subscriptions" && options.method === "DELETE") { Object.assign(subscription, cancelledSubscription); return undefined; }
    if (path === "api/billing/subscription-checkouts") throw new ApiError(502, "Checkout indisponível");
    throw new Error(`Unexpected request: ${path}`);
  });
}

afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAntiforgeryToken.mockResolvedValue("csrf-test-token");
  mockRefresh.mockResolvedValue({ ok: true });
});

describe("SubscriptionPage", () => {
  it("asks for confirmation, cancels the subscription, and preserves account data", async () => {
    const subscription = { ...activeSubscription };
    setSubscription(subscription);
    render(<SubscriptionPage />);

    await screen.findByRole("button", { name: "Cancelar assinatura" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    expect((await screen.findByRole("dialog")).textContent).toContain("Sua conta, seu criatório e os dados registrados continuam preservados.");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("api/billing/subscriptions", { method: "DELETE" }));
    expect(await screen.findByText(/A assinatura foi cancelada/)).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Seus dados continuam guardados" })).toBeTruthy();
  });

  it("starts rehire through the hosted checkout contract without collecting card details", async () => {
    setSubscription({ ...cancelledSubscription });
    render(<SubscriptionPage />);

    const taxField = await screen.findByLabelText("CPF ou CNPJ do responsável");
    fireEvent.change(taxField, { target: { value: "123.456.789-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o checkout seguro" }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("api/billing/subscription-checkouts", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ billingCycle: "monthly", customerTaxIdentifier: "12345678901" })
    })));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível iniciar o checkout");
    expect(screen.queryByLabelText(/cartão|cvv/i)).toBeNull();
  });


  it("treats an Asaas cancellation callback as navigation and allows a fresh checkout attempt", async () => {
    window.history.replaceState({}, "", "/billing/subscription-checkout?result=cancelled");
    setSubscription({ ...pendingSubscription });
    render(<SubscriptionPage callback />);

    expect((await screen.findByText(/O checkout foi cancelado/)).textContent).toContain("O checkout foi cancelado");
    expect(await screen.findByLabelText("CPF ou CNPJ do responsável")).toBeTruthy();
    expect(screen.getByText(/Seus dados continuam preservados/)).toBeTruthy();
  });
  it("rejects invalid tax identifiers before starting a checkout", async () => {
    setSubscription({ ...cancelledSubscription });
    render(<SubscriptionPage />);

    fireEvent.change(await screen.findByLabelText("CPF ou CNPJ do responsável"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o checkout seguro" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Informe um CPF com 11 caracteres");
    expect(mockRequest).not.toHaveBeenCalledWith("api/billing/subscription-checkouts", expect.anything());
  });
});







