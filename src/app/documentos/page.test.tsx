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
});
