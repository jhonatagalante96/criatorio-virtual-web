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

function eligibilityResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    birdId: "bird-a",
    identificationPending: false,
    isEligible: true,
    issues: [],
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function genealogyResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    edges: [{ childNodeKey: "bird:bird-a", parentNodeKey: "bird:father-a", position: "father" }],
    isTruncated: false,
    maxGenerations: 2,
    nodes: [
      { birthDate: "2021-06-15", birdId: "bird-a", canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
      { birthDate: "2018-04-10", birdId: "father-a", canNavigate: true, generation: 1, isAccessible: true, isSnapshot: false, name: "Pai Azul", nodeKey: "bird:father-a", position: "father", ringNumber: "111111", sex: "Male", source: "Private", status: "Active" }
    ],
    rootBirdId: "bird-a",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

async function openDetail(fetchMock: ReturnType<typeof vi.fn>) {
  render(<BirdDetailPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Aurora" })).toBeTruthy());
  await waitFor(() => expect(screen.getAllByText("Pai Azul").length).toBeGreaterThan(0));
  expect(fetchMock).toHaveBeenCalledTimes(5);
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
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByText(/Ficha privada · Criatório Aurora/)).toBeTruthy();
    expect(screen.getByLabelText("Navegação principal")).toBeTruthy();
    expect(screen.getByLabelText("Foto da ave não cadastrada")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Informações da ave" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Linhagem (Genealogia)" })).toBeTruthy();
    expect(screen.getByText("Nenhuma pendência encontrada")).toBeTruthy();
    expect(screen.getByText("Ave acompanhada desde o primeiro cadastro.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Pai Azul/ }).some((link) => link.getAttribute("href") === "/plantel/aves/father-a")).toBe(true);
    expect(screen.getByRole("link", { name: "Editar dados" }).getAttribute("href")).toBe("/plantel/aves/bird-a/editar");
    expect(screen.getByText("Árvore consultada")).toBeTruthy();

    const detailRequest = fetchMock.mock.calls[2];
    expect(String(detailRequest[0])).toContain("/api/birds/bird-a");
    const eligibilityRequest = fetchMock.mock.calls[3];
    expect(String(eligibilityRequest[0])).toContain("/api/birds/bird-a/eligibility");
  });

  it("renders the genealogy relationships and withholds private snapshot navigation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse({
        edges: [
          { childNodeKey: "bird:bird-a", parentNodeKey: "bird:father-a", position: "father" },
          { childNodeKey: "bird:bird-a", parentNodeKey: "external:bird-a:mother", position: "mother" },
          { childNodeKey: "bird:father-a", parentNodeKey: "snapshot:father-a:father", position: "father" }
        ],
        nodes: [
          { birthDate: "2021-06-15", birdId: "bird-a", canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
          { birthDate: "2018-04-10", birdId: "father-a", canNavigate: true, generation: 1, isAccessible: true, isSnapshot: false, name: "Pai Azul", nodeKey: "bird:father-a", position: "father", ringNumber: "111111", sex: "Male", source: "Private", status: "Active" },
          { birthDate: null, birdId: null, canNavigate: false, generation: 1, isAccessible: false, isSnapshot: true, name: "Mãe sem cadastro", nodeKey: "external:bird-a:mother", position: "mother", ringNumber: null, sex: "Female", source: "External", status: null },
          { birthDate: "2015-01-01", birdId: null, canNavigate: false, generation: 2, isAccessible: false, isSnapshot: true, name: "Avô Azul", nodeKey: "snapshot:father-a:father", position: "father", ringNumber: "999999", sex: "Male", source: "Snapshot", status: "Archived" }
        ]
      }));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    const tree = screen.getByLabelText("Árvore genealógica navegável");
    expect(within(tree).getByRole("link", { name: /Pai Azul/ }).getAttribute("href")).toBe("/plantel/aves/father-a");
    expect(within(tree).getByText("Ancestral externo · sem cadastro")).toBeTruthy();
    expect(within(tree).getByText("Registro preservado · acesso restrito")).toBeTruthy();
    expect(within(tree).queryByRole("link", { name: /Avô Azul/ })).toBeNull();
    expect(within(tree).getByRole("list", { name: "Pais de Pai Azul" })).toBeTruthy();
  });

  it("changes the requested genealogy depth without reloading the bird detail", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse())
      .mockResolvedValueOnce(genealogyResponse({ isTruncated: true, maxGenerations: 5 }));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.change(screen.getByLabelText("Gerações exibidas"), { target: { value: "5" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    await waitFor(() => expect(screen.getByLabelText("Gerações exibidas")).toHaveProperty("value", "5"));
    expect(String(fetchMock.mock.calls[5][0])).toContain("/api/birds/bird-a/genealogy?maxGenerations=5");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/birds/bird-a")).length).toBe(1);
  });

  it("renders API eligibility and offers contextual identification action", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({ identificationPending: true, ringNumber: null }))
      .mockResolvedValueOnce(eligibilityResponse({
        identificationPending: true,
        isEligible: false,
        issues: [{ code: "MissingRingNumber", message: "A valid six-digit ring number is required for this action." }]
      }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByRole("heading", { name: "Elegibilidade da ave" })).toBeTruthy();
    expect(screen.getByText("Requer atenção")).toBeTruthy();
    expect(screen.getByText("Anilha não informada")).toBeTruthy();
    expect(screen.getByText("Informe uma anilha válida de seis dígitos para liberar as ações que exigem identificação.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Completar identificação" }).getAttribute("href")).toBe("/plantel/aves/bird-a/editar");
  });

  it("keeps a terminal bird available for historical consultation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({ deathDate: "2025-02-01", status: "Deceased" }))
      .mockResolvedValueOnce(eligibilityResponse({ isEligible: false, issues: [{ code: "InactiveStatus", message: "Only active birds are eligible for this action." }] }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByRole("status").textContent).toContain("marcada como falecida");
    expect(screen.getByRole("row", { name: /Falecimento/ }).textContent).toContain("01/02/2025");
    const actionSummary = document.querySelector(".bird-detail-action-menu > summary");
    expect(actionSummary).not.toBeNull();
    fireEvent.click(actionSummary as HTMLElement);
    expect(screen.queryByRole("button", { name: "Inativar" })).toBeNull();
  });

  it("shows the transfer-pending block while keeping the bird readable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({ status: "Transferred" }))
      .mockResolvedValueOnce(eligibilityResponse({ isEligible: false, issues: [{ code: "InactiveStatus", message: "Only active birds are eligible for this action." }] }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByRole("status").textContent).toContain("transferência pendente");
    expect(screen.getByRole("heading", { name: "Aurora" })).toBeTruthy();
  });

  it("renders external parents and honest empty profile resources", async () => {
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
      .mockResolvedValueOnce(eligibilityResponse({ identificationPending: true, isEligible: false, issues: [{ code: "MissingRingNumber", message: "A valid six-digit ring number is required for this action." }] }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByText("Pai não cadastrado")).toBeTruthy();
    expect(screen.getByText("Identificação pendente")).toBeTruthy();
    expect(screen.getByText("Nenhuma observação registrada.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fotos" })).toBeTruthy();
    expect(screen.getByText("Nenhuma foto cadastrada.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "QR Code da ave" })).toBeTruthy();
    expect(screen.getByText(/geração de documentos for liberada/)).toBeTruthy();
  });

  it("offers retry when eligibility is temporarily unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Service unavailable" }), { headers: { "content-type": "application/problem+json" }, status: 503 }))
      .mockResolvedValueOnce(genealogyResponse())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Elegibilidade da ave" })).toBeTruthy());
    const eligibilityPanel = screen.getByRole("heading", { name: "Elegibilidade da ave" }).closest("section");
    expect(eligibilityPanel).not.toBeNull();
    expect(within(eligibilityPanel as HTMLElement).getByRole("alert").textContent).toContain("Não foi possível consultar a elegibilidade");

    fireEvent.click(within(eligibilityPanel as HTMLElement).getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByText("Nenhuma pendência encontrada")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("keeps the detail readable when eligibility is blocked by the selected tenant", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "A breeding farm must be selected before consulting bird eligibility." }), { headers: { "content-type": "application/problem+json" }, status: 409 }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Elegibilidade da ave" })).toBeTruthy());
    const eligibilityPanel = screen.getByRole("heading", { name: "Elegibilidade da ave" }).closest("section");
    expect(eligibilityPanel).not.toBeNull();
    expect(within(eligibilityPanel as HTMLElement).getByRole("alert").textContent).toContain("Selecione novamente um criatório");
    expect(screen.getByRole("heading", { name: "Informações da ave" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(5);
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
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Service unavailable" }), { headers: { "content-type": "application/problem+json" }, status: 503 }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByRole("alert").textContent).toContain("O serviço está indisponível no momento");
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByText("Ave cadastrada no criatório")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
