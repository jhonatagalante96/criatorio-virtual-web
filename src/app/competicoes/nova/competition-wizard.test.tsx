import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompetitionWizard } from "./competition-wizard";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../../lib/auth/auth-context", () => ({
  useAuth: () => ({ refresh, session: { email: "owner@example.com" }, status: "authenticated" })
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function bird(overrides: Partial<{
  birdId: string;
  name: string;
  ringNumber: string | null;
}> = {}) {
  return {
    ageInYears: 3,
    birdId: "bird-a",
    breedingFarmId: "farm-a",
    identificationPending: false,
    imageUrl: null,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Female" as const,
    speciesPopularName: "Canário-do-reino",
    status: "Active" as const,
    ...overrides
  };
}

function birdsResponse(items: ReturnType<typeof bird>[], totalPages = 1, page = 1): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    items,
    page,
    pageSize: 50,
    totalCount: items.length,
    totalPages
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function competitionResponse(): Response {
  return new Response(JSON.stringify({
    birdId: "bird-a",
    category: "Canário individual",
    competitionId: "competition-a",
    createdAtUtc: "2026-09-15T12:00:00Z",
    date: "2000-01-02",
    location: "São Paulo, SP",
    name: "Exposição Estadual",
    notes: "Porte e plumagem avaliados.",
    placement: 1,
    updatedAtUtc: "2026-09-15T12:00:00Z"
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

function successfulLoad(fetchMock: ReturnType<typeof vi.fn>, items = [bird()]) {
  fetchMock.mockResolvedValueOnce(selectedFarmResponse()).mockResolvedValueOnce(birdsResponse(items));
}

async function reachReview() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione a ave" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Dados da competição" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/Nome da competição/), { target: { value: "Exposição Estadual" } });
  fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: "2000-01-02" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Resultado e detalhes" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/Categoria/), { target: { value: "Canário individual" } });
  fireEvent.change(screen.getByLabelText(/Colocação/), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/Local/), { target: { value: "São Paulo, SP" } });
  fireEvent.change(screen.getByLabelText(/Notas/), { target: { value: "Porte e plumagem avaliados." } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Revise as informações" })).toBeTruthy());
}

describe("CompetitionWizard", () => {
  it("creates a competition using the backend request contract", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(competitionResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionWizard initialBirdId="bird-a" />);
    await reachReview();
    expect(screen.getByText("Aurora")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar competição" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Competição registrada com sucesso" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Voltar à ficha da ave" }).getAttribute("href")).toBe("/plantel/aves/bird-a");
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/birds/bird-a/competitions");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      name: "Exposição Estadual",
      date: "2000-01-02",
      category: "Canário individual",
      placement: 1,
      location: "São Paulo, SP",
      notes: "Porte e plumagem avaliados."
    });
  });

  it("requires a bird and validates the required name and future date", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock, [bird()]);
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionWizard />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione a ave" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Selecione uma ave para continuar.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Dados da competição" })).toBeTruthy());
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: tomorrow } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Informe o nome da competição.")).toBeTruthy();
    expect(screen.getByText("A data da competição não pode estar no futuro.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dados da competição" })).toBeTruthy();
  });

  it("shows the empty state when the selected farm has no birds", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock, []);
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionWizard />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhuma ave disponível" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Cadastrar ave" }).getAttribute("href")).toBe("/plantel/aves/novo");
  });

  it("maps backend validation errors back to the relevant field", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: "Competition data is invalid.",
        errors: { Category: ["A categoria não está disponível."] },
        status: 400
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionWizard initialBirdId="bird-a" />);
    await reachReview();
    fireEvent.click(screen.getByRole("button", { name: "Salvar competição" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Resultado e detalhes" })).toBeTruthy());
    expect(screen.getByText("A categoria não está disponível.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("servidor pediu");
  });

  it("validates placement against the backend integer range", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionWizard initialBirdId="bird-a" />);
    await reachReview();
    fireEvent.click(screen.getAllByRole("button", { name: "Alterar" })[2]);
    fireEvent.change(screen.getByLabelText(/Colocação/), { target: { value: "2147483648" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Informe uma colocação inteira entre 1 e 2.147.483.647.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Resultado e detalhes" })).toBeTruthy();
  });
});
