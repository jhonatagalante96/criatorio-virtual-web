import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyClient } from "./passkey-client";
import { PasskeyError } from "./passkeys";

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
    }),
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

function credential() {
  return {
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    id: "credential-id",
    rawId: new Uint8Array([1]).buffer,
    response: {
      clientDataJSON: new Uint8Array([2]).buffer,
      signature: new Uint8Array([3]).buffer,
      authenticatorData: new Uint8Array([4]).buffer,
      userHandle: null
    },
    toJSON: () => ({
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      id: "credential-id",
      rawId: "AQ",
      response: {
        authenticatorData: "BA",
        clientDataJSON: "Ag",
        signature: "Aw",
        userHandle: null
      },
      type: "public-key"
    }),
    type: "public-key"
  } as unknown as PublicKeyCredential;
}

function optionsResponse() {
  return new Response(JSON.stringify({
    challenge: "AQ",
    pubKeyCredParams: [],
    rp: { name: "Criatório Virtual" },
    user: { displayName: "Pessoa", id: "Ag", name: "pessoa@example.com" }
  }), { headers: { "content-type": "application/json" } });
}

function antiforgeryResponse() {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

afterEach(() => {
  restoreBrowserSupport();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PasskeyClient", () => {
  it("lists only the account passkey summaries through the authenticated GET endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      passkeys: [{
        credentialId: "credential-id",
        createdAt: "2026-09-13T12:00:00Z",
        isBackedUp: false,
        isBackupEligible: true,
        isUserVerified: true,
        name: null,
        transports: ["internal"]
      }]
    }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new PasskeyClient({ endpoint: "https://api.example.test" }).list()).resolves.toEqual([expect.objectContaining({ credentialId: "credential-id" })]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/auth/passkeys", expect.objectContaining({
      credentials: "include",
      method: "GET"
    }));
  });

  it("runs the registration ceremony through the API with antiforgery protection", async () => {
    const create = vi.fn().mockResolvedValue(credential());
    setBrowserSupport({ create, get: vi.fn() });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new PasskeyClient({ endpoint: "https://api.example.test" }).register();

    expect(result.id).toBe("credential-id");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ publicKey: expect.objectContaining({}) }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.test/api/auth/passkeys/register/options");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.example.test/api/auth/passkeys/register/verify");
    const registrationBody = JSON.parse(String(fetchMock.mock.calls[2][1].body));
    expect(JSON.parse(registrationBody.credentialJson)).toMatchObject({ id: "credential-id", type: "public-key" });
  });

  it("normalizes authenticator cancellation and does not submit a credential", async () => {
    const get = vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
    setBrowserSupport({ create: vi.fn(), get });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(new PasskeyClient({ endpoint: "https://api.example.test" }).authenticate()).rejects.toMatchObject({ kind: "cancelled" } satisfies Partial<PasskeyError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledOnce();
  });

  it("sends the login assertion in the backend credentialJson contract", async () => {
    const get = vi.fn().mockResolvedValue(credential());
    setBrowserSupport({ create: vi.fn(), get });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await new PasskeyClient({ endpoint: "https://api.example.test" }).authenticate();

    const loginBody = JSON.parse(String(fetchMock.mock.calls[2][1].body));
    expect(JSON.parse(loginBody.credentialJson)).toMatchObject({ id: "credential-id", type: "public-key" });
  });

  it("does not touch the network when WebAuthn is unavailable", async () => {
    setBrowserSupport({ create: vi.fn(), get: vi.fn() });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new PasskeyClient({ endpoint: "https://api.example.test" }).authenticate()).rejects.toMatchObject({ kind: "not-supported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
