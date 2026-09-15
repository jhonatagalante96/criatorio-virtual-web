import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname
}));

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
    modelId: "Modern",
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

function documentHistoryResponse(items = [
  {
    birdId: "bird-a",
    contentType: "application/pdf",
    documentId: "document-history-badge",
    downloadUrl: "/api/birds/bird-a/documents/document-history-badge/content",
    fileName: "cracha-aurora.pdf",
    generatedAtUtc: "2026-09-13T12:00:00Z",
    length: 2048,
    modelId: "Classic",
    printSize: "Medium",
    selectedFields: ["Name", "RingNumber", "Species", "Sex"],
    type: "Badge"
  },
  {
    birdId: "bird-a",
    contentType: "application/pdf",
    documentId: "document-history-certificate",
    downloadUrl: "/api/birds/bird-a/documents/document-history-certificate/content",
    fileName: "certificado-aurora.pdf",
    generatedAtUtc: "2026-09-12T12:00:00Z",
    length: 4096,
    modelId: "Institutional",
    printSize: null,
    selectedFields: [],
    type: "GenealogyCertificate"
  },
  {
    birdId: "bird-a",
    contentType: "application/pdf",
    documentId: "document-history-internal",
    downloadUrl: "/api/birds/bird-a/documents/document-history-internal/content",
    fileName: "internal-record.pdf",
    generatedAtUtc: "2026-09-11T12:00:00Z",
    length: 1024,
    modelId: null,
    printSize: null,
    selectedFields: [],
    type: "InternalRecord"
  }
]): Response {
  return new Response(JSON.stringify({ breedingFarmId: "farm-a", birdId: "bird-a", items }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function reissuedDocumentResponse(): Response {
  return new Response(JSON.stringify({
    birdId: "bird-a",
    contentType: "application/pdf",
    documentId: "document-history-badge-reissued",
    downloadUrl: "/api/birds/bird-a/documents/document-history-badge-reissued/content",
    fileName: "cracha-aurora-reemitido.pdf",
    generatedAtUtc: "2026-09-13T13:00:00Z",
    heightMillimeters: 88,
    length: 3072,
    modelId: "Photographic",
    pageCount: 1,
    printSize: "Large",
    selectedFields: ["Name", "RingNumber", "BirdPhoto"],
    type: "Badge",
    widthMillimeters: 125
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

function reissuedCertificateResponse(): Response {
  return new Response(JSON.stringify({
    birdId: "bird-a",
    contentType: "application/pdf",
    documentId: "document-history-certificate-reissued",
    downloadUrl: "/api/birds/bird-a/documents/document-history-certificate-reissued/content",
    fileName: "certificado-aurora-reemitido.pdf",
    generatedAtUtc: "2026-09-13T13:00:00Z",
    heightMillimeters: 210,
    length: 3072,
    modelId: "Modern",
    pageCount: 1,
    printSize: null,
    selectedFields: [],
    type: "GenealogyCertificate",
    widthMillimeters: 297
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

describe("DocumentsPage", () => {
  it("refreshes an expired session before loading the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Documentos" })).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("opens the document history by default and combines emissions from active birds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird(), bird({ birdId: "bird-b", name: "Brisa", ringNumber: "654321", speciesPopularName: "Calopsita" })]))
      .mockResolvedValueOnce(documentHistoryResponse())
      .mockResolvedValueOnce(documentHistoryResponse([{
        birdId: "bird-b",
        contentType: "application/pdf",
        documentId: "document-history-brisa",
        downloadUrl: "/api/birds/bird-b/documents/document-history-brisa/content",
        fileName: "cracha-brisa.pdf",
        generatedAtUtc: "2026-09-10T12:00:00Z",
        length: 1024,
        modelId: "Classic",
        printSize: "Medium",
        selectedFields: ["Name"],
        type: "Badge"
       }]))
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Documentos" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Todos os documentos" })).toBeTruthy());
    expect(screen.getAllByText(/Aurora/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Brisa/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Emitir novo documento" }).getAttribute("href")).toBe("/documentos/novo");
    expect(screen.queryByRole("link", { name: "Voltar para Aves" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Consultar emissões" })).toBeNull();
    expect(screen.queryByText("Documentos internos")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/birds/bird-a/documents"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/birds/bird-b/documents"))).toBe(true);
  });

  it("reveals document history ten items at a time", async () => {
    const historyItems = Array.from({ length: 12 }, (_, index) => ({
      birdId: "bird-a",
      contentType: "application/pdf",
      documentId: `document-history-${index}`,
      downloadUrl: `/api/birds/bird-a/documents/document-history-${index}/content`,
      fileName: `cracha-aurora-${index}.pdf`,
      generatedAtUtc: `2026-09-${String(12 - index).padStart(2, "0")}T12:00:00Z`,
      length: 2048,
      modelId: "Classic" as const,
      printSize: "Medium" as const,
      selectedFields: ["Name" as const],
      type: "Badge" as const
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse(historyItems));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(document.querySelectorAll(".document-history-item")).toHaveLength(10));
    expect(screen.getByRole("status").textContent).toContain("Exibindo 10 de 12 emissões");
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(document.querySelectorAll(".document-history-item")).toHaveLength(12);
    expect(screen.getByRole("status").textContent).toContain("Exibindo 12 de 12 emissões");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("links from the document history to the dedicated new-document flow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Emitir novo documento" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Emitir novo documento" }).getAttribute("href")).toBe("/documentos/novo");
    expect(screen.queryByRole("button", { name: "Emitir novo documento" })).toBeNull();

    cleanup();
    const generationFetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse());
    vi.stubGlobal("fetch", generationFetchMock);
    window.history.replaceState({}, "", "/documentos/novo");
    render(<DocumentsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Voltar para documentos" }).getAttribute("href")).toBe("/documentos");
  });

  it("completes the badge wizard and sends the backend contract", async () => {
    window.history.pushState({}, "", "/documentos/novo?birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(generatedDocumentResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    expect(screen.getByRole("option", { name: /Aurora/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Voltar" }).getAttribute("href")).toBe("/documentos");

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o modelo" })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /Fotográfico/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione os campos" })).toBeTruthy());
    expect(screen.getByRole("checkbox", { name: /Endereço do criatório/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Endereço do criatório/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o tamanho" })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /Grande/ }));
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
      selectedFields: ["Name", "RingNumber", "Species", "Sex", "BreedingFarmAddress"]
    });
    expect(screen.getByRole("link", { name: "Baixar crachá" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-a/content");
  });

  it("blocks birds without a ring number before generation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird({ ringNumber: null, identificationPending: true })]));
    vi.stubGlobal("fetch", fetchMock);

    window.history.pushState({}, "", "/documentos/novo?type=Badge");
    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
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

  it("allows choosing one of the three genealogy certificate models", async () => {
    window.history.pushState({}, "", "/documentos/novo?type=GenealogyCertificate&birdId=bird-a");
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Certificado de genealogia" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Valide a elegibilidade" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Ave elegível para o certificado")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira a prévia" })).toBeTruthy());
    expect(screen.getByText("Clássico Premium")).toBeTruthy();
    expect(screen.getByText("Institucional Claro")).toBeTruthy();
    expect(screen.getByText("Moderno")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Moderno/ }));
    expect(screen.getByText("Estrutura genealógica")).toBeTruthy();
    expect(screen.getByText("Sol")).toBeTruthy();
    expect(screen.getByText("Lua externa")).toBeTruthy();
    expect(screen.queryByText("Escolha o tamanho")).toBeNull();
    const modelStep = screen.getByRole("heading", { name: "Escolha o modelo" }).closest("section");
    fireEvent.click(within(modelStep as HTMLElement).getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e gere" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Gerar certificado" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Certificado gerado com sucesso" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ type: "GenealogyCertificate", modelId: "Modern" });
    expect(screen.getByRole("link", { name: "Baixar certificado" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-certificate-a/content");
  });

  it("shows the eligibility reason and edit path when the certificate is blocked", async () => {
    window.history.pushState({}, "", "/documentos/novo?type=GenealogyCertificate");
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("Identificação pendente · anilha necessária")).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Certificado bloqueado para esta ave" })).toBeTruthy());
    expect(screen.getByText("Informe uma anilha válida de seis dígitos na edição da ave.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Editar dados da ave" }).getAttribute("href")).toBe("/plantel/aves/bird-a/editar");
    expect(fetchMock.mock.calls.some(([, request]) => String(request?.url).includes("/genealogy"))).toBe(false);
  });

  it("shows a recoverable permission error during certificate validation", async () => {
    window.history.pushState({}, "", "/documentos/novo?type=GenealogyCertificate");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Forbidden" }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível validar a ave" })).toBeTruthy());
    expect(screen.getByText("Sua conta não tem permissão para consultar esta ave ou criatório.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("completes the provenance document flow with the fixed backend contract", async () => {
    window.history.pushState({}, "", "/documentos/novo?type=ProvenanceDocument&birdId=bird-a");
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Documento de procedência" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha a ave" })).toBeTruthy());
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
    expect(screen.getByRole("link", { name: "Baixar documento de procedência" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-provenance-a/content");
  });

  it("keeps the provenance review recoverable when private storage is unavailable", async () => {
    window.history.pushState({}, "", "/documentos/novo?type=ProvenanceDocument&birdId=bird-a");
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o documento" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
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

  it("lists only supported document emissions and filters them by type", async () => {
    window.history.pushState({}, "", "/documentos?view=history&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Documentos" })).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText("Crachá").length).toBeGreaterThan(0));
    expect(screen.getByText("certificado-aurora")).toBeTruthy();
    expect(screen.queryByText("internal-record")).toBeNull();
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/api/birds/bird-a/documents");

    fireEvent.change(screen.getByLabelText("Filtrar por tipo"), { target: { value: "GenealogyCertificate" } });

    expect(screen.getByText("certificado-aurora")).toBeTruthy();
    expect(screen.getByText(/Institucional Claro/)).toBeTruthy();
    expect(screen.queryByText("cracha-aurora")).toBeNull();
    expect(screen.getByRole("link", { name: "Baixar original" }).getAttribute("href"))
      .toContain("/api/birds/bird-a/documents/document-history-certificate/content");
  });

  it("opens an authenticated PDF preview and offers the original download", async () => {
    window.history.pushState({}, "", "/documentos?view=history&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse())
      .mockResolvedValueOnce(new Response(new Blob(["%PDF-1.7"]), { headers: { "content-type": "application/pdf" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:document-preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL, writable: true });

    try {
      render(<DocumentsPage />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: "Visualizar documento" })).not.toHaveLength(0));
      fireEvent.click(screen.getAllByRole("button", { name: "Visualizar documento" })[0]);

      await waitFor(() => expect(screen.getByTitle("Prévia de cracha-aurora")).toBeTruthy());
      expect(fetchMock.mock.calls[3]?.[0]).toContain("/api/birds/bird-a/documents/document-history-badge/content");
      expect(screen.getByRole("link", { name: "Baixar documento original" }).getAttribute("href")).toBe("blob:document-preview");
      fireEvent.click(screen.getByRole("button", { name: "Fechar prévia do documento" }));
      expect(screen.queryByRole("dialog", { name: "Prévia do documento" })).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:document-preview");
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL, writable: true });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL, writable: true });
    }
  });

  it("reissues a badge with the optional allowed configuration and keeps the original", async () => {
    window.history.pushState({}, "", "/documentos?view=history&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(reissuedDocumentResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Reemitir" })).not.toHaveLength(0));
    fireEvent.click(screen.getAllByRole("button", { name: "Reemitir" })[0]);
    expect(screen.getByRole("dialog", { name: "Reemitir documento" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Alterar configuração do crachá/ }));
    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "Photographic" } });
    fireEvent.change(screen.getByLabelText("Tamanho"), { target: { value: "Large" } });
    fireEvent.click(screen.getByRole("button", { name: "Reemitir documento" }));

    await waitFor(() => expect(screen.getByText("cracha-aurora-reemitido")).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/birds/bird-a/documents/document-history-badge/reissue");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      modelId: "Photographic",
      printSize: "Large",
      selectedFields: ["Name", "RingNumber", "Species", "Sex"]
    });
    expect(screen.getByText("cracha-aurora")).toBeTruthy();
    expect(screen.getByText(/versão original continua no histórico/)).toBeTruthy();
  });

  it("reissues a genealogy certificate with a different model when requested", async () => {
    window.history.pushState({}, "", "/documentos?view=history&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(documentHistoryResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(reissuedCertificateResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Reemitir" })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "Reemitir" })[1]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Alterar modelo do certificado/ }));
    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "Modern" } });
    fireEvent.click(screen.getByRole("button", { name: "Reemitir documento" }));

    await waitFor(() => expect(screen.getByText("certificado-aurora-reemitido")).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/birds/bird-a/documents/document-history-certificate/reissue");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ modelId: "Modern" });
  });

  it("shows a recoverable permission error when the document history is forbidden", async () => {
    window.history.pushState({}, "", "/documentos?view=history&birdId=bird-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Forbidden" }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentsPage />);

    await waitFor(() => expect(screen.getByText("Não foi possível consultar o histórico")).toBeTruthy());
    expect(screen.getByText("Sua conta não tem permissão para consultar os documentos deste criatório.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
