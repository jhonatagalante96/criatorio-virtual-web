import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

const routerReplace = vi.hoisted(() => vi.fn());

const browserDescriptors = {
  credentials: Object.getOwnPropertyDescriptor(navigator, "credentials"),
  isSecureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  publicKeyCredential: Object.getOwnPropertyDescriptor(window, "PublicKeyCredential")
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

afterEach(() => {
  cleanup();
  if (browserDescriptors.credentials) Object.defineProperty(navigator, "credentials", browserDescriptors.credentials);
  else delete (navigator as { credentials?: CredentialsContainer }).credentials;
  if (browserDescriptors.isSecureContext) Object.defineProperty(window, "isSecureContext", browserDescriptors.isSecureContext);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
  if (browserDescriptors.publicKeyCredential) Object.defineProperty(window, "PublicKeyCredential", browserDescriptors.publicKeyCredential);
  else delete (window as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
  window.history.replaceState({}, "", "/configuracoes");
  window.sessionStorage.clear();
  routerReplace.mockReset();
  vi.unstubAllGlobals();
});

function setBrowserSupport() {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: function PublicKeyCredentialMock() {} });
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: vi.fn(), get: vi.fn() } });
}

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

function openSecuritySettings(): void {
  window.history.replaceState({}, "", "/configuracoes?section=security");
}

describe("SettingsPage", () => {
  it("keeps account settings private when there is no authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para acessar as configurações" })).toBeTruthy());
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the configuration overview before opening a section", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authenticatedSession()));
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Configurações" })).toBeTruthy());
    expect(screen.getByRole("link", { name: /Minha conta/ }).getAttribute("href")).toBe("/configuracoes?section=account");
    expect(screen.getByRole("link", { name: /Segurança/ }).getAttribute("href")).toBe("/configuracoes?section=security");
    expect(screen.getByRole("link", { name: /Sessão/ }).getAttribute("href")).toBe("/configuracoes?section=session");
  });

  it("shows the authenticated account details", async () => {
    window.history.replaceState({}, "", "/configuracoes?section=account");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authenticatedSession()));
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Minha conta" })).toBeTruthy());
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("E-mail confirmado")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Editar dados" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers passkey activation inside account security settings", async () => {
    openSecuritySettings();
    setBrowserSupport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(JSON.stringify({ passkeys: [] }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Login rápido" })).toBeTruthy();
    expect(String(fetchMock.mock.calls[1][0])).toContain("api/auth/passkeys");
  });

  it("changes a local password with antiforgery protection and clears the form after success", async () => {
    openSecuritySettings();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Alterar senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "InitialStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "Abcdef1!" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "Abcdef1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(screen.getByText("Senha alterada com sucesso. Use a nova senha no próximo login.")).toBeTruthy());
    expect((screen.getByLabelText("Senha atual") as HTMLInputElement).value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, request] = fetchMock.mock.calls[2];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({
      confirmPassword: "Abcdef1!",
      currentPassword: "InitialStrongPassword!123",
      newPassword: "Abcdef1!"
    });
  });

  it("maps an invalid current password without exposing the API payload", async () => {
    openSecuritySettings();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The current password is invalid." }), {
        headers: { "content-type": "application/problem+json" },
        status: 400
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Alterar senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "WrongCurrentPassword!123" } });
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "ChangedStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "ChangedStrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("A senha atual está incorreta."));
    expect(screen.queryByText("The current password is invalid.")).toBeNull();
  });

  it("does not keep showing private settings after the mutation session expires", async () => {
    openSecuritySettings();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Alterar senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "InitialStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "ChangedStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "ChangedStrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para acessar as configurações" })).toBeTruthy());
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("hides the local password form when the API confirms a Google-only account", async () => {
    openSecuritySettings();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "A local password is not configured for this account." }), {
        headers: { "content-type": "application/problem+json" },
        status: 400
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Alterar senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "SomePassword!123" } });
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "ChangedStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "ChangedStrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await waitFor(() => expect(screen.getByText("Sua conta utiliza login com Google")).toBeTruthy());
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    expect(screen.getByText(/Continue usando o Google/)).toBeTruthy();
  });

  it("opens and cancels the session logout confirmation without logging out", async () => {
    window.history.replaceState({}, "", "/configuracoes?section=session");
    const fetchMock = vi.fn().mockResolvedValue(authenticatedSession());
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sessão" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!, { target: screen.getByRole("dialog").parentElement });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns to login through client-side navigation after logout", async () => {
    window.history.replaceState({}, "", "/configuracoes?section=session");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sessão" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }));
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
