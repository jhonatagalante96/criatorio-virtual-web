import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyManagementPanel } from "./passkey-management-panel";

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

function passkeyListResponse(passkeys: unknown[]): Response {
  return new Response(JSON.stringify({ passkeys }), { headers: { "content-type": "application/json" }, status: 200 });
}

function passkey(overrides: Record<string, unknown> = {}) {
  return {
    credentialId: "credential-id",
    createdAt: "2026-09-13T12:00:00Z",
    isBackedUp: true,
    isBackupEligible: true,
    isUserVerified: true,
    name: "Notebook",
    transports: ["internal"],
    ...overrides
  };
}

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function optionsResponse(): Response {
  return new Response(JSON.stringify({
    challenge: "AQ",
    pubKeyCredParams: [],
    rp: { name: "Criatório Virtual" },
    user: { displayName: "Pessoa", id: "Ag", name: "pessoa@example.com" }
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function registrationCredential(): PublicKeyCredential {
  return {
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    id: "new-credential-id",
    rawId: new Uint8Array([1]).buffer,
    response: {
      attestationObject: new Uint8Array([2]).buffer,
      clientDataJSON: new Uint8Array([3]).buffer,
      getTransports: () => ["internal"]
    },
    toJSON: () => ({
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      id: "new-credential-id",
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
  refresh.mockReset().mockResolvedValue({ ok: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PasskeyManagementPanel", () => {
  it("lists safe passkey metadata without exposing the credential id", async () => {
    setBrowserSupport();
    const fetchMock = vi.fn().mockResolvedValue(passkeyListResponse([passkey()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyManagementPanel />);

    await waitFor(() => expect(screen.getByText("Notebook")).toBeTruthy());
    expect(screen.getByText(/Criada em/)).toBeTruthy();
    expect(screen.getByText(/Este dispositivo/)).toBeTruthy();
    expect(screen.getByText(/Sincronizada/)).toBeTruthy();
    expect(screen.queryByText("credential-id")).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar outra chave" })).toBeTruthy();
  });

  it("adds another passkey and refreshes the list", async () => {
    const create = vi.fn().mockResolvedValue(registrationCredential());
    setBrowserSupport({ create, get: vi.fn() });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(passkeyListResponse([]))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(optionsResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(passkeyListResponse([passkey({ credentialId: "new-credential-id", name: "Celular" })]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyManagementPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar chave de acesso" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar chave de acesso" }));

    await waitFor(() => expect(screen.getByText("Celular")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("adicionada");
    expect(create).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("renames a passkey and reloads the updated metadata", async () => {
    setBrowserSupport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(passkeyListResponse([passkey()]))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(passkeyListResponse([passkey({ name: "Celular" })]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyManagementPanel />);
    await waitFor(() => expect(screen.getByText("Notebook")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Renomear Notebook" }));
    fireEvent.change(screen.getByLabelText("Nome da Passkey"), { target: { value: "Celular" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));

    await waitFor(() => expect(screen.getByText("Celular")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("atualizado");
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toEqual({ name: "Celular" });
  });

  it("requires confirmation before removing a passkey and refreshes the empty state", async () => {
    setBrowserSupport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(passkeyListResponse([passkey()]))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(passkeyListResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyManagementPanel />);
    await waitFor(() => expect(screen.getByText("Notebook")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Remover Notebook" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/sessões já abertas não serão encerradas/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog").querySelector(".settings-danger-action")!);

    await waitFor(() => expect(screen.getByText("Nenhuma chave de acesso cadastrada")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("removida");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("explains when the browser cannot manage passkeys without contacting the API", async () => {
    setBrowserSupport();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PasskeyManagementPanel />);

    await waitFor(() => expect(screen.getByText(/não oferece suporte a chaves de acesso/)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/login por senha ou Google continua disponível/)).toBeTruthy();
  });
});
