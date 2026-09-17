import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BadgeBatchPage from "./page";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ refresh, session: { email: "owner@example.com" } })
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL, writable: true });
});

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function selectedFarmResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: true, name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId: "farm-a"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function bird(overrides: Partial<{
  birthDate: string | null;
  birdId: string;
  identificationPending: boolean;
  imageUrl: string | null;
  name: string;
  ringNumber: string | null;
  sex: "Female" | "Male" | "Unknown";
  speciesPopularName: string;
}> = {}) {
  return {
    birthDate: "2024-02-14",
    birdId: "bird-a",
    identificationPending: false,
    imageUrl: null,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Female" as const,
    speciesPopularName: "Canário-do-reino",
    ...overrides
  };
}

function birdsResponse(items = [bird(), bird({ birdId: "bird-b", name: "Brisa", ringNumber: null, identificationPending: true })]): Response {
  return new Response(JSON.stringify({ items, totalCount: items.length }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function batchResponse(status: 200 | 422 = 200): Response {
  return new Response(JSON.stringify({
    aggregatePdf: status === 200 ? {
      contentBase64: btoa("%PDF-1.7"),
      contentType: "application/pdf",
      fileName: "crachas-lote.pdf",
      heightMillimeters: 594,
      length: 7,
      pageCount: 1,
      widthMillimeters: 841
    } : null,
    breedingFarmId: "farm-a",
    items: [
      { birdId: "bird-a", status: status === 200 ? "Generated" : "MissingRingNumber", errorCode: status === 200 ? null : "missing_ring_number", document: status === 200 ? { documentId: "document-a", fileName: "cracha-aurora.pdf", length: 1024, pageCount: 1, widthMillimeters: 125, heightMillimeters: 88 } : null },
      { birdId: "bird-b", status: "MissingRingNumber", errorCode: "missing_ring_number", document: null }
    ],
    status: status === 200 ? "Generated" : "NoDocumentsGenerated"
  }), { headers: { "content-type": "application/json" }, status });
}

async function reachReview(fetchMock: ReturnType<typeof vi.fn>) {
  render(<BadgeBatchPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha as aves" })).toBeTruthy());
  fireEvent.click(screen.getByRole("checkbox", { name: /Aurora/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Brisa/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o modelo" })).toBeTruthy());
  fireEvent.click(screen.getByRole("radio", { name: /Fotográfico/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Defina os campos e o tamanho" })).toBeTruthy());
  fireEvent.click(screen.getByRole("checkbox", { name: /Endereço do criatório/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Confira a prévia" })).toBeTruthy());
  expect(screen.getByLabelText("Prévia dos crachás do lote")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e gere" })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledTimes(2);
}

describe("BadgeBatchPage", () => {
  it("completes the batch flow and sends the backend contract", async () => {
    const createObjectURL = vi.fn(() => "blob:batch-pdf");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL, writable: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(batchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await reachReview(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Gerar crachás" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crachás gerados com sucesso" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/birds/documents/batch");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      birdIds: ["bird-a", "bird-b"],
      modelId: "Photographic",
      printSize: "Medium",
      selectedFields: ["Name", "RingNumber", "Species", "Sex", "BreedingFarmAddress"]
    });
    await waitFor(() => expect(screen.getByRole("link", { name: "Baixar arquivo completo" }).getAttribute("href")).toBe("blob:batch-pdf"));
    expect(screen.getAllByText("Não gerado: anilha ausente")).toHaveLength(1);
  });

  it("keeps the partial failure details when the API returns 422", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(batchResponse(422));
    vi.stubGlobal("fetch", fetchMock);

    await reachReview(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Gerar crachás" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhum crachá foi gerado" })).toBeTruthy());
    expect(screen.getByText("Brisa")).toBeTruthy();
    expect(screen.getAllByText("Não gerado: anilha ausente")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Baixar arquivo completo" })).toBeNull();
  });

  it("shows an empty state when the selected farm has no active birds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<BadgeBatchPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhuma ave disponível" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Cadastrar ave" }).getAttribute("href")).toBe("/plantel/aves/novo");
  });

  it("blocks the flow when no breeding farm is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ breedingFarms: [], selectedBreedingFarmId: null }), {
      headers: { "content-type": "application/json" },
      status: 200
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BadgeBatchPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the expired session before loading the batch data", async () => {
    refresh.mockResolvedValueOnce({ ok: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird({ birdId: "bird-a", name: "Aurora" })]));
    vi.stubGlobal("fetch", fetchMock);

    render(<BadgeBatchPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha as aves" })).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("offers retry feedback when the active bird list fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BadgeBatchPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar as aves" })).toBeTruthy());
    expect(screen.getByText("O serviço está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
