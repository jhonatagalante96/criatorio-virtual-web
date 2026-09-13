import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../http/api-client";
import {
  detectPasskeySupport,
  normalizePasskeyError,
  parseCreationOptions,
  parseRequestOptions,
  serializePublicKeyCredential
} from "./passkeys";

const browserDescriptors = {
  credentials: Object.getOwnPropertyDescriptor(navigator, "credentials"),
  isSecureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  publicKeyCredential: Object.getOwnPropertyDescriptor(window, "PublicKeyCredential")
};

type CredentialApi = Pick<CredentialsContainer, "create" | "get">;

function setBrowserSupport({
  credentials = { create: vi.fn(), get: vi.fn() },
  publicKeyCredential,
  secure = true
}: {
  credentials?: CredentialApi;
  publicKeyCredential?: typeof PublicKeyCredential;
  secure?: boolean;
} = {}) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });
  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: publicKeyCredential ?? function PublicKeyCredentialMock() {} });
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

afterEach(() => {
  restoreBrowserSupport();
  vi.restoreAllMocks();
});

describe("passkey browser utilities", () => {
  it("detects a secure browser with the required credential APIs", () => {
    setBrowserSupport();

    expect(detectPasskeySupport()).toEqual({ reason: "supported", supported: true });
  });

  it("reports insecure contexts without probing the authenticator", () => {
    setBrowserSupport({ secure: false });

    expect(detectPasskeySupport()).toEqual({ reason: "insecure-context", supported: false });
  });

  it("uses the browser JSON parser when available", () => {
    const parsed = { challenge: new Uint8Array([1]).buffer } as unknown as PublicKeyCredentialCreationOptions;
    function PublicKeyCredentialMock() {}
    const parseCreationOptionsFromJSON = vi.fn(() => parsed);
    Object.assign(PublicKeyCredentialMock, { parseCreationOptionsFromJSON });
    setBrowserSupport({ publicKeyCredential: PublicKeyCredentialMock as unknown as typeof PublicKeyCredential });

    const options = {
      challenge: "AQ",
      pubKeyCredParams: [],
      rp: { name: "Criatório Virtual" },
      user: { displayName: "Pessoa", id: "Ag", name: "pessoa@example.com" }
    } satisfies PublicKeyCredentialCreationOptionsJSON;

    expect(parseCreationOptions(options)).toBe(parsed);
    expect(parseCreationOptionsFromJSON).toHaveBeenCalledWith(options);
  });

  it("decodes base64url binary fields when the browser parser is unavailable", () => {
    setBrowserSupport();

    const creation = parseCreationOptions({
      challenge: "AQID",
      excludeCredentials: [{ id: "BAUG", transports: ["internal"], type: "public-key" }],
      pubKeyCredParams: [],
      rp: { name: "Criatório Virtual" },
      user: { displayName: "Pessoa", id: "BwgJ", name: "pessoa@example.com" }
    });
    const request = parseRequestOptions({ challenge: "AQID", rpId: "localhost" });

    expect(creation.challenge).toEqual(new Uint8Array([1, 2, 3]));
    expect(creation.user.id).toEqual(new Uint8Array([7, 8, 9]));
    expect(creation.excludeCredentials?.[0].id).toEqual(new Uint8Array([4, 5, 6]));
    expect(request.challenge).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("serializes a credential without persisting WebAuthn material", () => {
    const credential = {
      authenticatorAttachment: "platform",
      getClientExtensionResults: () => ({}),
      id: "credential-id",
      rawId: new Uint8Array([1, 2, 3]).buffer,
      response: {
        attestationObject: new Uint8Array([4, 5, 6]).buffer,
        clientDataJSON: new Uint8Array([7, 8, 9]).buffer,
        getTransports: () => ["internal"]
      },
      type: "public-key"
    } as unknown as PublicKeyCredential;
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(serializePublicKeyCredential(credential)).toEqual({
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      id: "credential-id",
      rawId: "AQID",
      response: {
        attestationObject: "BAUG",
        clientDataJSON: "BwgJ",
        transports: ["internal"]
      },
      type: "public-key"
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("normalizes browser and API failures without exposing API details", () => {
    expect(normalizePasskeyError(new DOMException("user cancelled", "NotAllowedError"), "authentication")).toMatchObject({
      kind: "cancelled",
      message: "A operação com a chave de acesso foi cancelada."
    });
    expect(normalizePasskeyError(new DOMException("aborted", "AbortError"), "authentication")).toMatchObject({ kind: "cancelled" });
    expect(normalizePasskeyError(new DOMException("duplicate", "InvalidStateError"), "registration")).toMatchObject({
      kind: "already-registered"
    });
    expect(normalizePasskeyError(new DOMException("unsupported", "NotSupportedError"), "authentication")).toMatchObject({ kind: "not-supported" });
    expect(normalizePasskeyError(new ApiError(400, "Dados inválidos.", "segredo interno", {}, "invalid_passkey"), "authentication")).toMatchObject({
      apiCode: "invalid_passkey",
      kind: "http",
      message: "Não foi possível entrar com a chave de acesso. Tente outra forma de acesso.",
      status: 400
    });
    expect(normalizePasskeyError(new ApiError(409, "Conflito."), "authentication")).toMatchObject({ kind: "http" });
    expect(normalizePasskeyError(new TypeError("Failed to fetch"), "authentication")).toMatchObject({ kind: "network" });
  });
});
