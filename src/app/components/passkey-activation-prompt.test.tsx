import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyActivationPrompt } from "./passkey-activation-prompt";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../lib/auth/auth-context", () => ({
  useAuth: () => ({ refresh })
}));

const browserDescriptors = {
  credentials: Object.getOwnPropertyDescriptor(navigator, "credentials"),
  isSecureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  publicKeyCredential: Object.getOwnPropertyDescriptor(window, "PublicKeyCredential")
};

type CredentialApi = Pick<CredentialsContainer, "create" | "get">;

function setBrowserSupport(credentials: CredentialApi = { create: vi.fn(), get: vi.fn() }) {
  function PublicKeyCredentialMock() {}
  Object.assign(PublicKeyCredentialMock, {
    parseCreationOptionsFromJSON: (options: PublicKeyCredentialCreationOptionsJSON) => ({
      ...options,
      challenge: new Uint8Array([1]).buffer,
      user: { ...options.user, id: new Uint8Array([2]).buffer }
    })
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: PublicKeyCredentialMock });
  Object.defineProperty(navigator, "credentials", { configurable: true, value: credentials });
}

function restoreBrowserSupport() {
  if (browserDescriptors.credentials) Object.defineProperty(navigator, "credentials", browserDescriptors.credentials);
  else delete (navigator as { credentials?: CredentialsContainer }).credentials;
  if (browserDescriptors.isSecureContext) Object.defineProperty(window, "isSecureContext", browserDescriptors.isSecureContext);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
  if (browserDescriptors.publicKeyCredential) Object.defineProperty(window, "PublicKeyCredential", browserDescriptors.publicKeyCredential);
  else delete (window as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
}

function listResponse(passkeys: unknown[] = []) {
  return new Response(JSON.stringify({ passkeys }), { headers: { "content-type": "application/json" }, status: 200 });
}

function antiforgeryResponse() {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function registrationOptionsResponse() {
  return new Response(JSON.stringify({
    challenge: "AQ",
    pubKeyCredParams: [],
    rp: { name: "Criatório Virtual" },
    user: { displayName: "Pessoa", id: "Ag", name: "pessoa@example.com" }
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function credential() {
  return {
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    id: "credential-id",
    rawId: new Uint8Array([1]).buffer,
    response: {
      attestationObject: new Uint8Array([2]).buffer,
      clientDataJSON: new Uint8Array([3]).buffer,
      getTransports: () => ["internal"]
    },
    toJSON: () => ({
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      id: "credential-id",
      rawId: "AQ",
      response: { attestationObject: "Ag", clientDataJSON: "Aw", transports: ["internal"] },
      type: "public-key"
    }),
    type: "public-key"
  } as unknown as PublicKeyCredential;
}

afterEach(() => {
  cleanup();
  restoreBrowserSupport();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PasskeyActivationPrompt", () => {
  it("offers activation only after confirming that the account has no passkeys", async () => {
    setBrowserSupport();
    const fetchMock = vi.fn().mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyActivationPrompt variant="dashboard" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Ative o login rápido" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/passkeys"), expect.anything());
  });

  it("runs registration, keeps cancellation non-critical, and confirms success", async () => {
    const create = vi.fn().mockResolvedValue(credential());
    setBrowserSupport({ create, get: vi.fn() });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(registrationOptionsResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyActivationPrompt variant="settings" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ativar login rápido" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Login rápido ativado"));
    expect(screen.queryByRole("button", { name: "Ativar login rápido" })).toBeNull();
    expect(create).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the prompt available after the user cancels the authenticator", async () => {
    const create = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    setBrowserSupport({ create, get: vi.fn() });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(registrationOptionsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyActivationPrompt variant="settings" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ativar login rápido" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Tudo bem"));
    expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows guidance without calling the API when WebAuthn is unsupported", async () => {
    setBrowserSupport();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyActivationPrompt variant="settings" />);

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("não estão disponíveis"));
    expect(screen.queryByRole("button", { name: "Ativar login rápido" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers retry when the passkey list is temporarily unavailable", async () => {
    setBrowserSupport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(listResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyActivationPrompt variant="settings" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
