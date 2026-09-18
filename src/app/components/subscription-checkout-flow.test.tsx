import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionCheckoutFlow } from "./subscription-checkout-flow";
import { navigateToHostedCheckout } from "./hosted-checkout-navigation";

const { router, routerReplace } = vi.hoisted(() => {
  const routerReplace = vi.fn();
  return { router: { replace: routerReplace }, routerReplace };
});

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./hosted-checkout-navigation", () => ({ navigateToHostedCheckout: vi.fn() }));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  routerReplace.mockReset();
});

function authenticatedSession(): Response {
  return new Response(JSON.stringify({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function subscriptionResponse(status: string, billingCycle = "Monthly"): Response {
  return new Response(JSON.stringify({ billingCycle, status, trialEndsAtUtc: null }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function noSubscriptionResponse(): Response {
  return new Response(JSON.stringify({ status: 404, title: "No subscription." }), {
    headers: { "content-type": "application/problem+json" },
    status: 404
  });
}

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function mockFetch(
  subscription: Response = noSubscriptionResponse(),
  checkout?: Response,
  session: Response = authenticatedSession()
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api/auth/session")) return Promise.resolve(session.clone());
    if (url.includes("api/billing/subscription-checkouts")) {
      return checkout ? Promise.resolve(checkout) : Promise.reject(new Error("Unexpected checkout request"));
    }
    if (url.includes("api/billing/subscription")) return Promise.resolve(subscription.clone());
    if (url.includes("antiforgery/token")) return Promise.resolve(antiforgeryResponse());
    return Promise.reject(new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`));
  });
}

describe("SubscriptionCheckoutFlow", () => {
  it("shows a retry when the account session cannot be restored", async () => {
    window.history.replaceState({}, "", "/billing/subscription-checkout?result=success");
    const sessionError = new Response(JSON.stringify({ status: 503, title: "Unavailable" }), {
      headers: { "content-type": "application/problem+json" },
      status: 503
    });
    const fetchMock = mockFetch(noSubscriptionResponse(), undefined, sessionError);
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow isReturn />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível restaurar sua sessão" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar para o login" }).getAttribute("href"))
      .toBe("/login?returnUrl=%2Fbilling%2Fsubscription-checkout%3Fresult%3Dsuccess");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api/billing/subscription"))).toBe(false);
  });

  it("offers monthly and annual checkout when the selected farm has no subscription", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha sua assinatura" })).toBeTruthy());
    expect(screen.getByRole("radio", { name: /Mensal/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Anual/ })).toBeTruthy();
    expect(screen.getByLabelText("CPF ou CNPJ")).toBeTruthy();
    expect(screen.getByText(/7 dias grátis/)).toBeTruthy();
    expect(screen.getByText(/Não informe dados de cartão nesta página/)).toBeTruthy();
  });

  it("validates CPF or CNPJ before making a checkout request", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha sua assinatura" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o pagamento" }));

    expect(screen.getByText("Informe um CPF com 11 dígitos ou um CNPJ com 14 caracteres.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("subscription-checkouts"))).toBe(false);
  });

  it("sends the chosen billing cycle and CPF with CSRF protection, then opens the hosted checkout", async () => {
    const fetchMock = mockFetch(noSubscriptionResponse(), new Response(JSON.stringify({
        checkoutId: "checkout-id",
        checkoutUrl: "https://sandbox.asaas.com/checkoutSession/show/checkout-id",
        expiresAtUtc: "2026-09-18T15:00:00Z",
        status: "pendingCheckout",
        subscriptionId: "subscription-id"
      }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha sua assinatura" })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "123.456.789-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o pagamento" }));

    await waitFor(() => expect(navigateToHostedCheckout).toHaveBeenCalledWith("https://sandbox.asaas.com/checkoutSession/show/checkout-id"));
    const checkoutRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("subscription-checkouts"))?.[1];
    expect(checkoutRequest).toBeDefined();
    const request = checkoutRequest!;
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({ billingCycle: "annual", customerTaxIdentifier: "12345678901" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("antiforgery/token"))).toBe(true);
  });

  it("explains when the selected farm cannot be used to start a subscription", async () => {
    const unavailableFarm = new Response(JSON.stringify({ status: 404, title: "The selected breeding farm was not found." }), {
      headers: { "content-type": "application/problem+json" },
      status: 404
    });
    const fetchMock = mockFetch(noSubscriptionResponse(), unavailableFarm);
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha sua assinatura" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "123.456.789-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o pagamento" }));

    const checkoutError = await screen.findByRole("alert");
    expect(checkoutError.textContent).toBe("Não foi possível contratar o criatório selecionado. Confira se este é o criatório correto e se sua conta tem autorização de responsável.");
  });

  it("does not navigate to a checkout URL outside the Asaas domain", async () => {
    const checkoutResponse = new Response(JSON.stringify({
      checkoutId: "checkout-id",
      checkoutUrl: "https://asaas.com.evil.example/checkout",
      expiresAtUtc: null,
      status: "pendingCheckout",
      subscriptionId: "subscription-id"
    }), { headers: { "content-type": "application/json" }, status: 200 });
    const fetchMock = mockFetch(noSubscriptionResponse(), checkoutResponse);
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha sua assinatura" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "123.456.789-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o pagamento" }));

    const checkoutError = await screen.findByRole("alert");
    expect(checkoutError.textContent).toBe("Não foi possível abrir o checkout seguro. Tente novamente em instantes.");
    expect(navigateToHostedCheckout).not.toHaveBeenCalled();
  });

  it("does not trust the success redirect before the backend confirms trial access", async () => {
    window.history.replaceState({}, "", "/billing/subscription-checkout?result=success");
    const timer = vi.spyOn(window, "setTimeout");
    const fetchMock = mockFetch(subscriptionResponse("PendingSubscription"));
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow isReturn />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Aguardando confirmação" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("trial for confirmado");
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio", { name: /Mensal/ })).toBeNull();
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 3000);
  });

  it("opens the app only after the backend returns an access-enabled status", async () => {
    window.history.replaceState({}, "", "/billing/subscription-checkout?result=cancelled");
    const fetchMock = mockFetch(subscriptionResponse("Trial"));
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow isReturn />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByRole("heading", { name: "Checkout encerrado" })).toBeNull();
  });

  it("offers a safe retry after a canceled checkout and preserves the pending plan", async () => {
    window.history.replaceState({}, "", "/billing/subscription-checkout?result=cancelled");
    const fetchMock = mockFetch(subscriptionResponse("PendingSubscription", "Annual"));
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCheckoutFlow isReturn />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Checkout encerrado" })).toBeTruthy());
    expect((screen.getByRole("radio", { name: /Anual/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /Anual/ }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Continuar para o checkout" })).toBeTruthy();
  });
});
