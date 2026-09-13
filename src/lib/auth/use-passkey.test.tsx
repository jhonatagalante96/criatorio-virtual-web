import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyClient } from "./passkey-client";
import { usePasskey } from "./use-passkey";

const browserDescriptors = {
  credentials: Object.getOwnPropertyDescriptor(navigator, "credentials"),
  isSecureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  publicKeyCredential: Object.getOwnPropertyDescriptor(window, "PublicKeyCredential")
};

function setBrowserSupport() {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: function PublicKeyCredentialMock() {} });
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: vi.fn(), get: vi.fn() } });
}

function restoreBrowserSupport() {
  if (browserDescriptors.credentials) Object.defineProperty(navigator, "credentials", browserDescriptors.credentials);
  else delete (navigator as { credentials?: CredentialsContainer }).credentials;
  if (browserDescriptors.isSecureContext) Object.defineProperty(window, "isSecureContext", browserDescriptors.isSecureContext);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
  if (browserDescriptors.publicKeyCredential) Object.defineProperty(window, "PublicKeyCredential", browserDescriptors.publicKeyCredential);
  else delete (window as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
}

afterEach(() => {
  cleanup();
  restoreBrowserSupport();
  vi.restoreAllMocks();
});

describe("usePasskey", () => {
  it("exposes a successful operation and its support state", async () => {
    setBrowserSupport();
    const client = {
      register: vi.fn().mockResolvedValue({ id: "credential-id" }),
      authenticate: vi.fn()
    } as unknown as PasskeyClient;
    const { result } = renderHook(() => usePasskey({ client }));

    await act(async () => {
      await expect(result.current.register()).resolves.toMatchObject({ ok: true });
    });

    expect(result.current.status).toBe("success");
    expect(result.current.support.supported).toBe(true);
    expect(client.register).toHaveBeenCalledOnce();
  });

  it("keeps cancellation distinct from a critical error", async () => {
    setBrowserSupport();
    const client = {
      register: vi.fn(),
      authenticate: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"))
    } as unknown as PasskeyClient;
    const { result } = renderHook(() => usePasskey({ client }));

    await act(async () => {
      await expect(result.current.authenticate()).resolves.toMatchObject({ ok: false, error: { kind: "cancelled" } });
    });

    expect(result.current.status).toBe("cancelled");
    expect(result.current.error?.kind).toBe("cancelled");
  });
});
