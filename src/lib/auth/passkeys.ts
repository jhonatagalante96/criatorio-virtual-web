import { ApiError } from "../http/api-client";

export type PasskeyOperation = "authentication" | "registration";

export type PasskeySupportReason = "insecure-context" | "supported" | "unavailable" | "unsupported";

export interface PasskeySupport {
  reason: PasskeySupportReason;
  supported: boolean;
}

export type PasskeyErrorKind =
  | "already-registered"
  | "cancelled"
  | "http"
  | "invalid"
  | "network"
  | "not-supported"
  | "unknown";

export class PasskeyError extends Error {
  readonly apiCode: string | undefined;
  readonly kind: PasskeyErrorKind;
  readonly status: number | undefined;

  constructor(
    kind: PasskeyErrorKind,
    message: string,
    options: { apiCode?: string; status?: number } = {}
  ) {
    super(message);
    this.name = "PasskeyError";
    this.apiCode = options.apiCode;
    this.kind = kind;
    this.status = options.status;
  }
}

export interface PasskeyCredentialJson {
  authenticatorAttachment?: string | null;
  clientExtensionResults?: AuthenticationExtensionsClientOutputs;
  id: string;
  rawId: string;
  response: {
    attestationObject?: string;
    authenticatorData?: string;
    clientDataJSON: string;
    signature?: string;
    transports?: string[];
    userHandle?: string | null;
  };
  type: "public-key";
}

const operationMessages: Record<PasskeyOperation, { http: string; unknown: string }> = {
  authentication: {
    http: "Não foi possível entrar com a chave de acesso. Tente outra forma de acesso.",
    unknown: "Não foi possível concluir a entrada com a chave de acesso. Tente novamente."
  },
  registration: {
    http: "Não foi possível cadastrar a chave de acesso. Tente novamente.",
    unknown: "Não foi possível concluir o cadastro da chave de acesso. Tente novamente."
  }
};

export function detectPasskeySupport(): PasskeySupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { reason: "unavailable", supported: false };
  }

  if (!window.isSecureContext) return { reason: "insecure-context", supported: false };

  const publicKeyCredential = window.PublicKeyCredential;
  const credentials = navigator.credentials;
  const supported = typeof publicKeyCredential === "function"
    && typeof credentials?.create === "function"
    && typeof credentials.get === "function";

  return supported
    ? { reason: "supported", supported: true }
    : { reason: "unsupported", supported: false };
}

function passkeyConstructor(): typeof PublicKeyCredential | undefined {
  if (typeof window === "undefined" || typeof window.PublicKeyCredential !== "function") return undefined;
  return window.PublicKeyCredential;
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new PasskeyError("invalid", "As opções da chave de acesso são inválidas.");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  let decoded: string;

  try {
    decoded = atob(padded);
  } catch (error) {
    throw new PasskeyError("invalid", "As opções da chave de acesso são inválidas.");
  }

  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function fallbackCreationOptions(options: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    attestation: options.attestation as AttestationConveyancePreference | undefined,
    challenge: base64UrlToBytes(options.challenge),
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToBytes(credential.id),
      transports: credential.transports as AuthenticatorTransport[] | undefined,
      type: credential.type as PublicKeyCredentialType
    })),
    extensions: options.extensions as AuthenticationExtensionsClientInputs | undefined,
    user: {
      ...options.user,
      id: base64UrlToBytes(options.user.id)
    }
  } as PublicKeyCredentialCreationOptions;
}

function fallbackRequestOptions(options: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToBytes(credential.id),
      transports: credential.transports as AuthenticatorTransport[] | undefined,
      type: credential.type as PublicKeyCredentialType
    })),
    challenge: base64UrlToBytes(options.challenge),
    extensions: options.extensions as AuthenticationExtensionsClientInputs | undefined,
    userVerification: options.userVerification as UserVerificationRequirement | undefined
  } as PublicKeyCredentialRequestOptions;
}

export function parseCreationOptions(options: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  const constructor = passkeyConstructor();
  return constructor?.parseCreationOptionsFromJSON
    ? constructor.parseCreationOptionsFromJSON(options)
    : fallbackCreationOptions(options);
}

export function parseRequestOptions(options: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  const constructor = passkeyConstructor();
  return constructor?.parseRequestOptionsFromJSON
    ? constructor.parseRequestOptionsFromJSON(options)
    : fallbackRequestOptions(options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSerializedCredential(value: unknown): value is PasskeyCredentialJson {
  if (!isRecord(value) || value.type !== "public-key" || typeof value.id !== "string" || typeof value.rawId !== "string") return false;
  if (!isRecord(value.response) || typeof value.response.clientDataJSON !== "string") return false;
  return true;
}

function isAttestationResponse(response: AuthenticatorResponse): response is AuthenticatorAttestationResponse {
  return "attestationObject" in response;
}

function isAssertionResponse(response: AuthenticatorResponse): response is AuthenticatorAssertionResponse {
  return "authenticatorData" in response && "signature" in response;
}

export function serializePublicKeyCredential(credential: PublicKeyCredential): PasskeyCredentialJson {
  const candidate = credential as PublicKeyCredential & { toJSON?: () => unknown };
  const serialized = typeof candidate.toJSON === "function" ? candidate.toJSON() : undefined;
  if (isSerializedCredential(serialized)) return serialized;

  const response = credential.response;
  const serializedResponse: PasskeyCredentialJson["response"] = {
    clientDataJSON: bytesToBase64Url(response.clientDataJSON)
  };

  if (isAttestationResponse(response)) {
    serializedResponse.attestationObject = bytesToBase64Url(response.attestationObject);
    if (typeof response.getTransports === "function") serializedResponse.transports = response.getTransports();
  } else if (isAssertionResponse(response)) {
    serializedResponse.authenticatorData = bytesToBase64Url(response.authenticatorData);
    serializedResponse.signature = bytesToBase64Url(response.signature);
    serializedResponse.userHandle = response.userHandle ? bytesToBase64Url(response.userHandle) : null;
  } else {
    throw new PasskeyError("invalid", "A resposta da chave de acesso é inválida.");
  }

  return {
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: typeof credential.getClientExtensionResults === "function"
      ? credential.getClientExtensionResults()
      : undefined,
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    response: serializedResponse,
    type: "public-key"
  };
}

function isDomException(error: unknown, name: string): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === name;
}

export function normalizePasskeyError(error: unknown, operation: PasskeyOperation): PasskeyError {
  if (error instanceof PasskeyError) return error;

  if (error instanceof ApiError) {
    const kind = operation === "registration" && error.status === 409 ? "already-registered" : "http";
    const message = kind === "already-registered" ? "Esta chave de acesso já está cadastrada." : operationMessages[operation].http;
    return new PasskeyError(kind, message, { apiCode: error.code, status: error.status });
  }

  if (isDomException(error, "AbortError") || isDomException(error, "NotAllowedError")) {
    return new PasskeyError("cancelled", "A operação com a chave de acesso foi cancelada.");
  }

  if (isDomException(error, "InvalidStateError")) {
    return operation === "registration"
      ? new PasskeyError("already-registered", "Esta chave de acesso já está cadastrada.")
      : new PasskeyError("invalid", "Não foi possível processar a chave de acesso.");
  }

  if (isDomException(error, "NotSupportedError")) {
    return new PasskeyError("not-supported", "Este navegador ou dispositivo não oferece suporte a chaves de acesso.");
  }

  if (error instanceof TypeError && /fetch|network|load/i.test(error.message)) {
    return new PasskeyError("network", "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.");
  }

  if (error instanceof TypeError) {
    return new PasskeyError("invalid", "Não foi possível processar a chave de acesso.");
  }

  return new PasskeyError("unknown", operationMessages[operation].unknown);
}
