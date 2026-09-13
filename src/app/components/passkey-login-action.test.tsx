import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyLoginAction } from "./passkey-login-action";

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
    parseRequestOptionsFromJSON: (options: PublicKeyCredentialRequestOptionsJSON) => ({
      ...options,
      challenge: new Uint8Array([1]).buffer
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

function antiforgeryResponse() {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function optionsResponse() {
  return new Response(JSON.stringify({ challenge: "AQ", userVerification: "required" }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function credential() {
  return {
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    id: "credential-id",
    rawId: new Uint8Array([1]).buffer,
    response: {
      authenticatorData: new Uint8Array([2]).buffer,
      clientDataJSON: new Uint8Array([3]).buffer,
      signature: new Uint8Array([4]).buffer,
      userHandle: null
    },
    toJSON: () => ({
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      id: "credential-id",
      rawId: "AQ",
      response: { authenticatorData: "Ag", clientDataJSON: "Aw", signature: "BA", userHandle: null },
      type: "public-key"
    }),
    type: "public-key"
  } as unknown as PublicKeyCredential;
}

afterEach(() => {
  cleanup();
  restoreBrowserSupport();
  refresh.mockReset().mockResolvedValue({ ok: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PasskeyLoginAction", () => {
  it("authenticates with a discoverable passkey and bootstraps the application session", async () => {
    const get = vi.fn().mockResolvedValue(credential());
    setBrowserSupport({ create: vi.fn(), get });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyLoginAction />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar com biometria" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Entrar com biometria" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledWith({ showLoading: false }));
    expect(get).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Entrando…" }) as HTMLButtonElement).disabled).toBe(true);
    const verifyBody = JSON.parse(String(fetchMock.mock.calls[2][1].body));
    expect(JSON.parse(verifyBody.credentialJson)).toMatchObject({ id: "credential-id", type: "public-key" });
  });

  it("keeps cancellation non-critical and leaves the password and Google fallback available", async () => {
    const get = vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
    setBrowserSupport({ create: vi.fn(), get });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyLoginAction />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar com biometria" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Entrar com biometria" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Tudo bem"));
    expect(screen.getByRole("button", { name: "Entrar com biometria" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hides the passwordless action when WebAuthn is unavailable", async () => {
    setBrowserSupport();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyLoginAction />);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Entrar com biometria" })).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a generic fallback after the API rejects an assertion", async () => {
    const get = vi.fn().mockResolvedValue(credential());
    setBrowserSupport({ create: vi.fn(), get });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Invalid passkey." }), {
        headers: { "content-type": "application/problem+json" },
        status: 401
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyLoginAction />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar com biometria" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Entrar com biometria" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("senha ou Google"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
