import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function authenticatedSession(): Response {
  return new Response(JSON.stringify({
    email: "owner@example.com",
    emailConfirmed: true,
    userId: "user-id"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function AuthHarness() {
  const { error, login, logout, session, status } = useAuth();

  return (
    <>
      <output data-testid="status">{status}</output>
      {session && <p>{session.email}</p>}
      {error && <div role="alert">{error}</div>}
      <button onClick={() => void login("owner@example.com", "StrongPassword!123")} type="button">Entrar</button>
      <button onClick={() => void logout()} type="button">Sair</button>
    </>
  );
}

function renderAuthHarness() {
  return render(
    <AuthProvider>
      <AuthHarness />
    </AuthProvider>
  );
}

function storageContents(): string {
  return [window.localStorage, window.sessionStorage].flatMap((storage) =>
    Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? "") ?? "")
  ).join("\n");
}

describe("AuthProvider session security", () => {
  it("uses the protected cookie flow and stores no password after a successful login", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(authenticatedSession());
    vi.stubGlobal("fetch", fetchMock);
    renderAuthHarness();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByText("owner@example.com")).toBeTruthy());
    expect(window.sessionStorage.getItem("criatorio-authentication-provider")).toBe("email");
    expect(storageContents()).not.toContain("StrongPassword!123");
    expect(storageContents()).not.toContain("owner@example.com");
  });

  it("clears the provider marker when logout succeeds without managing the auth cookie in browser storage", async () => {
    window.sessionStorage.setItem("criatorio-authentication-provider", "google");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    renderAuthHarness();

    await waitFor(() => expect(screen.getByText("owner@example.com")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(window.sessionStorage.getItem("criatorio-authentication-provider")).toBeNull();
    expect(storageContents()).not.toContain("StrongPassword!123");
    expect(storageContents()).not.toContain("owner@example.com");
  });

  it("keeps a forbidden session out of the authenticated view", async () => {
    window.sessionStorage.setItem("criatorio-authentication-provider", "email");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    renderAuthHarness();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("forbidden"));
    expect(screen.getByRole("alert").textContent).toContain("não está autorizado");
    expect(screen.queryByText("owner@example.com")).toBeNull();
  });

  it("explains when valid credentials require email confirmation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "email_confirmation_required",
        title: "Email confirmation is required."
      }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    renderAuthHarness();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("forbidden"));
    expect(screen.getByRole("alert").textContent).toContain("Confirme seu e-mail antes de entrar");
    expect(screen.getByRole("alert").textContent).not.toContain("E-mail ou senha inválidos");
  });
});
