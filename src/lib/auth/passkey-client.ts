"use client";

import { ApiClient, createApiClient } from "../http/api-client";
import {
  detectPasskeySupport,
  normalizePasskeyError,
  parseCreationOptions,
  parseRequestOptions,
  PasskeyCredentialJson,
  PasskeyError,
  PasskeyOperation,
  PasskeySupport,
  serializePublicKeyCredential
} from "./passkeys";

export const passkeyEndpoints = {
  loginOptions: "api/auth/passkeys/login/options",
  loginVerify: "api/auth/passkeys/login/verify",
  registerOptions: "api/auth/passkeys/register/options",
  registerVerify: "api/auth/passkeys/register/verify"
} as const;

export interface PasskeyClientOptions {
  csrfToken?: string;
  endpoint?: string;
  fetchAntiforgeryToken?: () => Promise<string>;
}

export interface PasskeyOperationOptions {
  signal?: AbortSignal;
}

function requirePublicKeyCredential(credential: Credential | null): PublicKeyCredential {
  if (!credential || credential.type !== "public-key") {
    throw new PasskeyError("invalid", "A resposta da chave de acesso é inválida.");
  }
  return credential as PublicKeyCredential;
}

export class PasskeyClient {
  private readonly api: ApiClient;
  private readonly fetchAntiforgeryToken: () => Promise<string>;
  private csrfToken: string | undefined;

  constructor(options: PasskeyClientOptions = {}) {
    this.csrfToken = options.csrfToken;
    this.api = options.endpoint
      ? new ApiClient(options.endpoint, () => this.csrfToken)
      : createApiClient(() => this.csrfToken);
    this.fetchAntiforgeryToken = options.fetchAntiforgeryToken ?? (() => this.api.fetchAntiforgeryToken());
  }

  get support(): PasskeySupport {
    return detectPasskeySupport();
  }

  async register({ signal }: PasskeyOperationOptions = {}): Promise<PublicKeyCredential> {
    return this.run("registration", async () => {
      const optionsJson = await this.requestOptions<PublicKeyCredentialCreationOptionsJSON>(passkeyEndpoints.registerOptions, signal);
      const credential = requirePublicKeyCredential(await navigator.credentials.create({
        publicKey: parseCreationOptions(optionsJson),
        signal
      }));
      await this.verify(passkeyEndpoints.registerVerify, serializePublicKeyCredential(credential), signal);
      return credential;
    });
  }

  async authenticate({ signal }: PasskeyOperationOptions = {}): Promise<PublicKeyCredential> {
    return this.run("authentication", async () => {
      const optionsJson = await this.requestOptions<PublicKeyCredentialRequestOptionsJSON>(passkeyEndpoints.loginOptions, signal);
      const credential = requirePublicKeyCredential(await navigator.credentials.get({
        publicKey: parseRequestOptions(optionsJson),
        signal
      }));
      await this.verify(passkeyEndpoints.loginVerify, serializePublicKeyCredential(credential), signal);
      this.csrfToken = undefined;
      return credential;
    });
  }

  private async ensureSupport(): Promise<void> {
    const support = this.support;
    if (!support.supported) {
      throw new PasskeyError(
        "not-supported",
        support.reason === "insecure-context"
          ? "Chaves de acesso exigem uma conexão segura."
          : "Este navegador ou dispositivo não oferece suporte a chaves de acesso."
      );
    }
  }

  private async ensureAntiforgeryToken(): Promise<void> {
    if (this.csrfToken) return;
    this.csrfToken = await this.fetchAntiforgeryToken();
  }

  private async requestOptions<T>(path: string, signal?: AbortSignal): Promise<T> {
    await this.ensureAntiforgeryToken();
    return this.api.request<T>(path, { method: "POST", signal });
  }

  private async verify(path: string, credential: PasskeyCredentialJson, signal?: AbortSignal): Promise<void> {
    await this.ensureAntiforgeryToken();
    await this.api.request<void>(path, {
      body: JSON.stringify(credential),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal
    });
  }

  private async run<T>(operation: PasskeyOperation, action: () => Promise<T>): Promise<T> {
    try {
      await this.ensureSupport();
      return await action();
    } catch (error) {
      throw normalizePasskeyError(error, operation);
    }
  }
}
