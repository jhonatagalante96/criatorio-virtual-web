import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BirdDetailPage from "./page";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/plantel/aves/bird-a");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

function authenticatedSession(): Response {
  return new Response(JSON.stringify({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" }), { headers: { "content-type": "application/json" }, status: 200 });
}

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function detailsResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    ageInYears: 4,
    birthDate: "2021-06-15",
    birdId: "bird-a",
    breedingFarmId: "farm-a",
    createdAtUtc: "2025-01-02T12:00:00Z",
    deathDate: null,
    externalFatherName: null,
    externalFatherSex: null,
    father: { birdId: "father-a", birthDate: "2018-04-10", name: "Pai Azul", ringNumber: "111111", sex: "Male", status: "Active" },
    fatherBirdId: "father-a",
    genealogyRootId: "root-a",
    identificationPending: false,
    mother: null,
    motherBirdId: null,
    name: "Aurora",
    notes: "Ave acompanhada desde o primeiro cadastro.",
    ringNumber: "123456",
    sex: "Female",
    speciesId: "species-a",
    speciesPopularName: "Sabiá-laranjeira",
    speciesScientificName: "Turdus rufiventris",
    status: "Active",
    updatedAtUtc: "2025-02-03T13:30:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function genealogyResponse(): Response {
  return new Response(JSON.stringify({
    edges: [{ childNodeKey: "bird:bird-a", parentNodeKey: "bird:father-a", position: "father" }],
    isTruncated: false,
    maxGenerations: 2,
    nodes: [
      { birthDate: "2021-06-15", birdId: "bird-a", canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
      { birthDate: "2018-04-10", birdId: "father-a", canNavigate: true, generation: 1, isAccessible: true, isSnapshot: false, name: "Pai Azul", nodeKey: "bird:father-a", position: "father", ringNumber: "111111", sex: "Male", source: "Private", status: "Active" }
    ],
    rootBirdId: "bird-a"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

async function openDetail(fetchMock: ReturnType<typeof vi.fn>) {
  render(<BirdDetailPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Aurora" })).toBeTruthy());
  await waitFor(() => expect(screen.getAllByText("Pai Azul").length).toBeGreaterThan(0));
  expect(fetchMock).toHaveBeenCalledTimes(4);
}

describe("BirdDetailPage", () => {
  it("keeps the private bird detail behind authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para consultar a ficha" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Aurora" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks the detail until a breeding farm is selected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByText("Selecione um criatório para consultar a ficha da ave.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads the selected tenant, detail and genealogy with navigable parent data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByText(/Plantel · Criatório Aurora/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dados cadastrais" })).toBeTruthy();
    expect(screen.getByText("Ave acompanhada desde o primeiro cadastro.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Pai Azul/ }).some((link) => link.getAttribute("href") === "/plantel/aves/father-a")).toBe(true);
    expect(screen.getByText("Árvore consultada")).toBeTruthy();

    const detailRequest = fetchMock.mock.calls[2];
    expect(String(detailRequest[0])).toContain("/api/birds/bird-a");
  });

  it("renders external parents and honest empty related sections", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({
        externalFatherName: "Pai não cadastrado",
        externalFatherSex: "Male",
        father: null,
        fatherBirdId: null,
        identificationPending: true,
        notes: null
      }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByText("Pai não cadastrado")).toBeTruthy();
    expect(screen.getByText("Identificação pendente")).toBeTruthy();
    expect(screen.getByText("Nenhuma observação foi registrada para esta ave.")).toBeTruthy();
    expect(screen.getAllByText("Nenhum registro disponível")).toHaveLength(6);
  });

  it("does not expose a bird outside the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The bird was not found." }), { headers: { "content-type": "application/problem+json" }, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível abrir a ficha" })).toBeTruthy());
    expect(screen.getByText("A ave não foi encontrada no criatório selecionado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar para o plantel" }).getAttribute("href")).toBe("/plantel/aves");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("offers retry when genealogy is temporarily unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Service unavailable" }), { headers: { "content-type": "application/problem+json" }, status: 503 }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar os demais ancestrais");
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getAllByText("Árvore consultada")).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
});
