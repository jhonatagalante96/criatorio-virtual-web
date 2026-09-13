import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentsPage from "./page";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ refresh, session: { email: "owner@example.com" } })
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  window.history.replaceState({}, "", "/documentos");
  vi.unstubAllGlobals();
});

function selectedFarmResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{
      breedingFarmId: "farm-a",
      isSelected: true,
      name: "Criatório Aurora",
      responsibleName: "Ana Souza"
    }],
    selectedBreedingFarmId: "farm-a"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function birdsResponse(items = [bird() as Record<string, unknown>]): Response {
  return new Response(JSON.stringify({ items, totalCount: items.length }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function bird(overrides: Partial<{
  birthDate: string | null;
  birdId: string;
  identificationPending: boolean;
  name: string;
  ringNumber: string | null;
  sex: "Female" | "Male" | "Unknown";
  speciesPopularName: string;
}> = {}) {
  return {
    birthDate: "2024-02-14",
    birdId: "bird-a",
    identificationPending: false,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Female" as const,
    speciesPopularName: "Canário-do-reino",
    ...overrides
  };
}

function generatedDocumentResponse(): Response {
  return new Response(JSON.stringify({
    contentType: "application/pdf",
    documentId: "document-a",
    downloadUrl: "/api/birds/bird-a/documents/document-a/content",
    fileName: "cracha-aurora.pdf",
    generatedAtUtc: "2026-09-13T12:00:00Z",
    length: 2048,
    modelId: "Photographic",
    pageCount: 1,
    printSize: "Large",
    selectedFields: ["Name", "RingNumber", "Species", "Sex"],
    type: "Badge",
    widthMillimeters: 125,
    heightMillimeters: 88
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

function certificateEligibilityResponse(overrides: Partial<{ identificationPending: boolean; isEligible: boolean; issues: Array<{ code: string; message: string }> }> = {}): Response {
  return new Response(JSON.stringify({
    birdId: "bird-a",
    identificationPending: false,
    isEligible: true,
    issues: [],
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function certificateGenealogyResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    edges: [
      { childNodeKey: "bird-a", parentNodeKey: "father-a", position: "father" },
      { childNodeKey: "bird-a", parentNodeKey: "mother-a", position: "mother" }
    ],
    isTruncated: false,
    maxGenerations: 6,
    nodes: [
      { birthDate: "2024-02-14", birdId: "bird-a", canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
      { birthDate: "2021-01-04", birdId: "father-a", canNavigate: true, generation: 1, isAccessible: true, isSnapshot: false, name: "Sol", nodeKey: "father-a", position: "father", ringNumber: "111111", sex: "Male", source: "Private", status: "Active" },
      { birthDate: null, birdId: null, canNavigate: false, generation: 1, isAccessible: false, isSnapshot: true, name: "Lua externa", nodeKey: "mother-a", position: "mother", ringNumber: null, sex: "Female", source: "External", status: null }
    ],
    rootBirdId: "bird-a"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function certificateFarmSettingsResponse(): Response {
  return new Response(JSON.stringify({
    address: { city: "São Paulo", complement: null, country: "Brasil", neighborhood: "Centro", number: "10", postalCode: "01000-000", state: "SP", street: "Rua Aurora" },
    contactEmail: "criatorio@example.com",
    contactPhone: null,
    breedingFarmId: "farm-a",
    name: "Criatório Aurora",
    officialRegistrationNumber: null,
    responsibleName: "Ana Souza"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function generatedCertificateResponse(): Response {
  return new Response(JSON.stringify({
    contentType: "application/pdf",
    documentId: "document-certificate-a",
    downloadUrl: "/api/birds/bird-a/documents/document-certificate-a/content",
    fileName: "certificado-genealogia-aurora.pdf",
    generatedAtUtc: "2026-09-13T12:00:00Z",
    heightMillimeters: 210,
    length: 4096,
    modelId: null,
    pageCount: 1,
    printSize: null,
    selectedFields: [],
    type: "GenealogyCertificate",
    widthMillimeters: 297
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

function generatedProvenanceResponse(): Response {
  return new Response(JSON.stringify({
    contentType: "application/pdf",
    documentId: "document-provenance-a",
    downloadUrl: "/api/birds/bird-a/documents/document-provenance-a/content",
    fileName: "documento-procedencia-aurora.pdf",
    generatedAtUtc: "2026-09-13T12:00:00Z",
    heightMillimeters: 210,
    length: 4096,
    modelId: null,
    pageCount: 1,
    printSize: null,
    selectedFields: [],
    type: "ProvenanceDocument",
    widthMillimeters: 297
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

describe("DocumentsPage", () => {
  it("refreshes an expired session before loading the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("completes the badge wizard and sends the backend contract", async () => {
    window.history.pushState({}, "", "/documentos?birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(generatedDocumentResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    expect(screen.getByRole("option", { name: /Aurora/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o modelo" })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /Fotográfico/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione os campos" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o tamanho" })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /Large/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira a prévia" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e gere" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Gerar crachá" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crachá gerado com sucesso" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      type: "Badge",
      modelId: "Photographic",
      printSize: "Large",
      selectedFields: ["Name", "RingNumber", "Species", "Sex"]
    });
    expect(screen.getByRole("link", { name: "Baixar crachá em PDF" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-a/content");
  });

  it("blocks birds without a ring number before generation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird({ ringNumber: null, identificationPending: true })]));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByText("Identificação pendente · anilha necessária")).toBeTruthy());
    expect((screen.getByRole("option", { name: /Aurora/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a recoverable failure when the bird list cannot be loaded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar as aves" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByText("O serviço está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
  });

  it("completes the genealogy certificate flow with the fixed backend contract", async () => {
    window.history.pushState({}, "", "/documentos?type=GenealogyCertificate&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(certificateEligibilityResponse())
      .mockResolvedValueOnce(certificateGenealogyResponse())
      .mockResolvedValueOnce(certificateFarmSettingsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(generatedCertificateResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Certificado de genealogia" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Valide a elegibilidade" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Ave elegível para o certificado")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira a prévia" })).toBeTruthy());
    expect(screen.getByText("Estrutura genealógica")).toBeTruthy();
    expect(screen.getByText("Sol")).toBeTruthy();
    expect(screen.getByText("Lua externa")).toBeTruthy();
    expect(screen.queryByText("Escolha o modelo")).toBeNull();
    expect(screen.queryByText("Escolha o tamanho")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e gere" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Gerar certificado" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Certificado gerado com sucesso" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ type: "GenealogyCertificate" });
    expect(screen.getByRole("link", { name: "Baixar certificado em PDF" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-certificate-a/content");
  });

  it("shows the eligibility reason and edit path when the certificate is blocked", async () => {
    window.history.pushState({}, "", "/documentos?type=GenealogyCertificate");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird({ ringNumber: null, identificationPending: true })]))
      .mockResolvedValueOnce(certificateEligibilityResponse({
        identificationPending: true,
        isEligible: false,
        issues: [{ code: "MissingRingNumber", message: "A valid six-digit ring number is required for this action." }]
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByText("Identificação pendente · anilha necessária")).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Certificado bloqueado para esta ave" })).toBeTruthy());
    expect(screen.getByText("Informe uma anilha válida de seis dígitos na edição da ave.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Editar dados da ave" }).getAttribute("href")).toBe("/plantel/aves/bird-a/editar");
    expect(fetchMock.mock.calls.some(([, request]) => String(request?.url).includes("/genealogy"))).toBe(false);
  });

  it("shows a recoverable permission error during certificate validation", async () => {
    window.history.pushState({}, "", "/documentos?type=GenealogyCertificate");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Forbidden" }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível validar a ave" })).toBeTruthy());
    expect(screen.getByText("Sua conta não tem permissão para consultar esta ave ou criatório.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("completes the provenance document flow with the fixed backend contract", async () => {
    window.history.pushState({}, "", "/documentos?type=ProvenanceDocument&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(certificateEligibilityResponse())
      .mockResolvedValueOnce(certificateGenealogyResponse())
      .mockResolvedValueOnce(certificateFarmSettingsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(generatedProvenanceResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Documento de procedência" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Valide a elegibilidade" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Ave elegível para o documento de procedência")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira a prévia" })).toBeTruthy());
    expect(screen.getByText("Pais e ancestrais registrados")).toBeTruthy();
    expect(screen.getByText("Data de emissão")).toBeTruthy();
    expect(screen.getByText("Assinatura do responsável")).toBeTruthy();
    expect(screen.getByText("Documento interno · não substitui registro SISPASS/IBAMA")).toBeTruthy();
    expect(screen.queryByText("Escolha o modelo")).toBeNull();
    expect(screen.queryByText("Escolha o tamanho")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e gere" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Gerar documento" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Documento de procedência gerado com sucesso" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ type: "ProvenanceDocument" });
    expect(screen.getByRole("link", { name: "Baixar documento de procedência em PDF" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-provenance-a/content");
  });

  it("keeps the provenance review recoverable when private storage is unavailable", async () => {
    window.history.pushState({}, "", "/documentos?type=ProvenanceDocument&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(certificateEligibilityResponse())
      .mockResolvedValueOnce(certificateGenealogyResponse())
      .mockResolvedValueOnce(certificateFarmSettingsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("Ave elegível para o documento de procedência")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira a prévia" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e gere" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Gerar documento" }));

    await waitFor(() => expect(screen.getByText("O armazenamento privado está indisponível. Tente novamente em instantes.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Gerar documento" })).toBeTruthy();
  });
});
