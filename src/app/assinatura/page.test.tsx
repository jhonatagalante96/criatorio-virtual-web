import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubscriptionPage from "./page";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

function sessionResponse(): Response {
  return jsonResponse({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" });
}

function farmSelectionResponse() {
  return {
    breedingFarms: [{ breedingFarmId: "farm-id", isSelected: true, name: "Sítio Esperança", responsibleName: "Responsável" }],
    selectedBreedingFarmId: "farm-id"
  };
}

function subscriptionResponse() {
  return {
    billingCycle: "Monthly",
    breedingFarmId: "farm-id",
    createdAtUtc: "2026-01-01T12:00:00Z",
    firstChargeDueAtUtc: "2026-01-15T12:00:00Z",
    gracePeriodDaysRemaining: 2,
    gracePeriodEndsAtUtc: "2026-02-15T12:00:00Z",
    gracePeriodStartedAtUtc: "2026-02-12T12:00:00Z",
    nextChargeDueAtUtc: "2026-02-15T12:00:00Z",
    planCode: "small-bird",
    status: "GracePeriod",
    trialEndsAtUtc: "2026-01-15T12:00:00Z",
    trialStartedAtUtc: "2026-01-01T12:00:00Z",
    updatedAtUtc: "2026-02-12T12:00:00Z"
  };
}

function paymentsResponse(items: unknown[] = []) {
  return { breedingFarmId: "farm-id", items, page: 1, pageSize: 20, totalCount: items.length };
}

describe("SubscriptionPage", () => {
  it("loads the selected farm subscription and safely displays billing history", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) return sessionResponse();
      if (url.includes("api/breeding-farms")) return jsonResponse(farmSelectionResponse());
      if (url.includes("api/billing/subscription")) return jsonResponse(subscriptionResponse());
      if (url.includes("api/billing/payments")) return jsonResponse(paymentsResponse([{
        amount: 119.5,
        createdAtUtc: "2026-01-15T12:00:00Z",
        currencyCode: "BRL",
        dueAtUtc: "2026-01-15T12:00:00Z",
        paidAtUtc: "2026-01-15T12:30:00Z",
        paymentId: "internal-payment-id",
        status: "Paid"
      }]));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Assinatura" })).toBeTruthy());
    expect(screen.getByText("Em período de tolerância")).toBeTruthy();
    expect(screen.getByText("Restam 2 dia(s) no período de tolerância, até 15 de fevereiro de 2026.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Histórico de cobranças" })).toBeTruthy();
    expect(screen.getByText(/119,50/)).toBeTruthy();
    expect(screen.getByText("Paga")).toBeTruthy();
    expect(screen.queryByText("internal-payment-id")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api/billing/subscription"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api/billing/payments?page=1&pageSize=20"))).toBe(true);
  });

  it("shows an explicit empty state when the farm has no subscription or payments", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) return sessionResponse();
      if (url.includes("api/breeding-farms")) return jsonResponse(farmSelectionResponse());
      if (url.includes("api/billing/subscription")) return jsonResponse({ title: "The selected breeding farm has no subscription." }, 404);
      if (url.includes("api/billing/payments")) return jsonResponse(paymentsResponse());
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhuma assinatura cadastrada" })).toBeTruthy());
    expect(screen.getByText("Nenhuma cobrança encontrada.")).toBeTruthy();
  });

  it("does not request billing data until a farm is selected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) return sessionResponse();
      if (url.includes("api/breeding-farms")) return jsonResponse({
        breedingFarms: [{ breedingFarmId: "farm-id", isSelected: false, name: "Sítio Esperança", responsibleName: "Responsável" }],
        selectedBreedingFarmId: null
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api/billing/"))).toBe(false);
  });

  it("offers a retry when the billing service fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) return sessionResponse();
      if (url.includes("api/breeding-farms")) return jsonResponse(farmSelectionResponse());
      if (url.includes("api/billing/subscription")) return jsonResponse({ title: "Unavailable" }, 503);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar a assinatura" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByText("A consulta está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
  });
});
