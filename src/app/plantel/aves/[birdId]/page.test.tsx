import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BirdDetailPage from "./page";

vi.mock("./bird-media-section", () => ({
  BirdMediaSection: () => React.createElement("section", null,
    React.createElement("h2", null, "Arquivos da ave"),
    React.createElement("p", null, "Nenhuma foto ou anexo cadastrado.")
  )
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/plantel/aves/bird-a");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
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

const editableAncestorId = "10000000-0000-4000-8000-000000000143";

function editableExternalGenealogyResponse(
  parents: Array<{
    birdId: string | null;
    name: string;
    nodeKey: string;
    position: "father" | "mother";
    ringNumber?: string | null;
    source: "External" | "Private" | "Snapshot";
  }> = [],
  canEdit = true,
  maxGenerations = 2,
  isTruncated = false
): Response {
  const externalNodeKey = `external:${editableAncestorId}`;
  const nodes = [
    { birthDate: "2021-06-15", birdId: "bird-a", canEdit: false, canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
    { birthDate: null, birdId: null, canEdit, canNavigate: false, generation: 1, isAccessible: false, isSnapshot: true, name: "Avô Externo", nodeKey: externalNodeKey, position: "father", ringNumber: null, sex: "Male", source: "External", status: null },
    ...parents.map((parent) => ({
      birthDate: "2014-04-10",
      birdId: parent.birdId,
      canEdit: false,
      canNavigate: parent.source === "Private" && Boolean(parent.birdId),
      generation: 2,
      isAccessible: parent.source === "Private",
      isSnapshot: parent.source !== "Private",
      name: parent.name,
      nodeKey: parent.nodeKey,
      position: parent.position,
      ringNumber: parent.ringNumber ?? null,
      sex: parent.position === "father" ? "Male" : "Female",
      source: parent.source,
      status: parent.source === "Private" ? "Active" : null
    }))
  ];
  const edges = [
    { childNodeKey: "bird:bird-a", parentNodeKey: externalNodeKey, position: "father" },
    ...parents.map((parent) => ({ childNodeKey: externalNodeKey, parentNodeKey: parent.nodeKey, position: parent.position }))
  ];
  return genealogyResponse({ edges, isTruncated, maxGenerations, nodes });
}

function recursiveGenealogyResponse(): Response {
  const externalAncestors = [
    { generation: 2, id: editableAncestorId, name: "Avô Externo" },
    { generation: 3, id: "20000000-0000-4000-8000-000000000001", name: "Bisavô Externo" },
    { generation: 4, id: "20000000-0000-4000-8000-000000000002", name: "Trisavô Externo" },
    { generation: 5, id: "20000000-0000-4000-8000-000000000003", name: "Tetravô Externo" },
    { generation: 6, id: "20000000-0000-4000-8000-000000000004", name: "Pentavô Externo" }
  ];
  const nodes = [
    { birthDate: "2021-06-15", birdId: "bird-a", canEdit: false, canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
    { birthDate: "2018-04-10", birdId: "father-a", canEdit: false, canNavigate: true, generation: 1, isAccessible: true, isSnapshot: false, name: "Pai Azul", nodeKey: "bird:father-a", position: "father", ringNumber: "111111", sex: "Male", source: "Private", status: "Active" },
    { birthDate: "2017-05-10", birdId: "mother-snapshot", canEdit: false, canNavigate: true, generation: 1, isAccessible: true, isSnapshot: true, name: "Mãe Vinculada", nodeKey: "snapshot:mother", position: "mother", ringNumber: "222222", sex: "Female", source: "Snapshot", status: "Archived" },
    ...externalAncestors.map((ancestor) => ({
      birthDate: null,
      birdId: null,
      canEdit: ancestor.id === editableAncestorId,
      canNavigate: false,
      generation: ancestor.generation,
      isAccessible: false,
      isSnapshot: true,
      name: ancestor.name,
      nodeKey: `external:${ancestor.id}`,
      position: "father",
      ringNumber: null,
      sex: "Male",
      source: "External",
      status: null
    }))
  ];
  const edges = [
    { childNodeKey: "bird:bird-a", parentNodeKey: "snapshot:mother", position: "mother" },
    { childNodeKey: "bird:bird-a", parentNodeKey: "bird:father-a", position: "father" },
    { childNodeKey: "bird:father-a", parentNodeKey: `external:${externalAncestors[0].id}`, position: "father" },
    ...externalAncestors.slice(0, -1).map((ancestor, index) => ({
      childNodeKey: `external:${ancestor.id}`,
      parentNodeKey: `external:${externalAncestors[index + 1].id}`,
      position: "father"
    }))
  ];
  return genealogyResponse({ edges, isTruncated: true, maxGenerations: 6, nodes });
}

function antiforgeryTokenResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "test-csrf-token" }, status: 204 });
}

function parentOptionsResponse(sex: "Female" | "Male" = "Male"): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    items: [sex === "Male"
      ? { birthDate: "2014-04-10", birdId: "bird-new-father", name: "Pai Cadastrado", ringNumber: "654321", sex }
      : { birthDate: "2014-04-10", birdId: "bird-new-mother", name: "Mãe Cadastrada", ringNumber: "654322", sex }]
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function genealogyUpdateResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    externalFatherName: null,
    externalFatherSex: null,
    externalMotherName: null,
    externalMotherSex: null,
    fatherBirdId: "father-a",
    motherBirdId: null,
    updatedAtUtc: "2025-02-04T13:30:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

async function openDetail(fetchMock: ReturnType<typeof vi.fn>, expectedParentName = "Pai Azul") {
  render(<BirdDetailPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Aurora" })).toBeTruthy());
  if (expectedParentName) await waitFor(() => expect(screen.getAllByText(expectedParentName).length).toBeGreaterThan(0));
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
    const transferLinks = screen.getAllByRole("link", { name: /Iniciar transferência/ });
    expect(transferLinks.length).toBeGreaterThan(0);
    expect(transferLinks.every((link) => link.getAttribute("href") === "/transferencias/nova?birdId=bird-a")).toBe(true);
    expect(screen.getByRole("link", { name: "Ver competições" }).getAttribute("href")).toBe("/plantel/aves/bird-a/competicoes");
    expect(screen.getByText("Árvore consultada")).toBeTruthy();

    const detailRequest = fetchMock.mock.calls[2];
    expect(String(detailRequest[0])).toContain("/api/birds/bird-a");
    const eligibilityRequest = fetchMock.mock.calls[3];
    expect(String(eligibilityRequest[0])).toContain("/api/birds/bird-a/eligibility");
  });

  it("renders the species default image when the bird has no primary photo", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({ imageUrl: "/species-images/0001.jpg", isDefaultImage: true }))
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    const photo = screen.getByRole("img", { name: "Imagem padrão da espécie: Sabiá-laranjeira" });
    expect(photo.querySelector("img")?.getAttribute("src")).toBe("https://localhost:58016/species-images/0001.jpg");
    expect(screen.getByText("Imagem padrão da espécie · foto própria não cadastrada")).toBeTruthy();
  });

  it("renders the bird primary photo when the API returns a non-default image", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({ imageUrl: "/api/birds/bird-a/attachments/photo-a/content", isDefaultImage: false }))
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    const photo = screen.getByRole("img", { name: "Foto de perfil de Aurora" });
    expect(photo.querySelector("img")?.getAttribute("src")).toBe("https://localhost:58016/api/birds/bird-a/attachments/photo-a/content");
    expect(screen.getByText("Foto de perfil")).toBeTruthy();
  });

  it("scrolls to genealogy without reloading the bird detail", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    const genealogySection = document.getElementById("genealogia");
    expect(genealogySection).not.toBeNull();
    const scrollIntoView = vi.fn();
    Object.defineProperty(genealogySection, "scrollIntoView", { configurable: true, value: scrollIntoView });

    fireEvent.click(screen.getByRole("link", { name: "Genealogia" }));

    expect(window.location.hash).toBe("#genealogia");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("heading", { name: "Linhagem (Genealogia)" })).toBeTruthy();

    const completeTreeSection = document.getElementById("arvore-genealogica");
    expect(completeTreeSection).not.toBeNull();
    const completeTreeScrollIntoView = vi.fn();
    Object.defineProperty(completeTreeSection, "scrollIntoView", { configurable: true, value: completeTreeScrollIntoView });

    fireEvent.click(screen.getByRole("link", { name: "Ver árvore completa" }));

    expect(window.location.hash).toBe("#arvore-genealogica");
    expect(completeTreeScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
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
          { childNodeKey: "bird:father-a", parentNodeKey: "snapshot:father-a:father", position: "father" },
          { childNodeKey: "external:bird-a:mother", parentNodeKey: "snapshot:mother-a:mother", position: "mother" }
        ],
        nodes: [
          { birthDate: "2021-06-15", birdId: "bird-a", canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
          { birthDate: "2018-04-10", birdId: "father-a", canNavigate: true, generation: 1, isAccessible: true, isSnapshot: false, name: "Pai Azul", nodeKey: "bird:father-a", position: "father", ringNumber: "111111", sex: "Male", source: "Private", status: "Active" },
          { birthDate: null, birdId: null, canNavigate: false, generation: 1, isAccessible: false, isSnapshot: true, name: "Mãe sem cadastro", nodeKey: "external:bird-a:mother", position: "mother", ringNumber: null, sex: "Female", source: "External", status: null },
          { birthDate: "2015-01-01", birdId: null, canNavigate: false, generation: 2, isAccessible: false, isSnapshot: true, name: "Avô Azul", nodeKey: "snapshot:father-a:father", position: "father", ringNumber: "999999", sex: "Male", source: "Snapshot", status: "Archived" },
          { birthDate: "2014-01-01", birdId: null, canNavigate: false, generation: 2, isAccessible: false, isSnapshot: true, name: "Avó Azul", nodeKey: "snapshot:mother-a:mother", position: "mother", ringNumber: null, sex: "Female", source: "Snapshot", status: "Archived" }
        ]
      }));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    const tree = screen.getByLabelText("Árvore genealógica");
    expect(within(tree).getByRole("link", { name: /Pai Azul/ }).getAttribute("href")).toBe("/plantel/aves/father-a");
    expect(within(tree).getByText("Ancestral externo · sem cadastro")).toBeTruthy();
    expect(within(tree).getAllByText("Registro preservado · acesso restrito")).toHaveLength(2);
    expect(within(tree).queryByRole("link", { name: /Avô Azul/ })).toBeNull();
    expect(within(tree).getByRole("list", { name: "Pais de Pai Azul" })).toBeTruthy();
    expect(within(tree).getByText("Pai")).toBeTruthy();
    expect(within(tree).getByText("Mãe")).toBeTruthy();
    expect(within(tree).getByText("Avô paterno")).toBeTruthy();
    expect(within(tree).getByText("Avó materna")).toBeTruthy();
  });

  it("shows recursive mixed ancestry through generation six with accessible branch expansion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse())
      .mockResolvedValueOnce(recursiveGenealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.change(screen.getByLabelText("Gerações exibidas"), { target: { value: "6" } });

    await waitFor(() => expect(screen.getByText("Mãe Vinculada")).toBeTruthy());
    const tree = screen.getByRole("region", { name: "Árvore genealógica" });
    expect(tree.getAttribute("tabindex")).toBe("0");
    expect(String(fetchMock.mock.calls[5][0])).toContain("/api/birds/bird-a/genealogy?maxGenerations=6");

    const rootParents = within(tree).getByRole("list", { name: "Pais de Aurora" });
    const rootParentNames = Array.from(rootParents.children).map((item) =>
      within(item as HTMLElement).getByText(/Pai Azul|Mãe Vinculada/).textContent
    );
    expect(rootParentNames).toEqual(["Pai Azul", "Mãe Vinculada"]);
    expect(within(tree).getByRole("link", { name: /Pai Azul/ }).className).toContain("is-private");
    expect(within(tree).getByRole("link", { name: /Mãe Vinculada/ }).getAttribute("href")).toBe("/plantel/aves/mother-snapshot");
    expect(within(tree).getByRole("link", { name: /Mãe Vinculada/ }).className).toContain("is-snapshot");
    expect(within(tree).queryByRole("link", { name: /Avô Externo/ })).toBeNull();
    expect(within(tree).getByRole("button", { name: "Editar ascendência" })).toBeTruthy();
    expect(within(tree).getAllByText("Ancestral externo · sem cadastro")).toHaveLength(5);
    expect(within(tree).getByText("Registro preservado · disponível para consulta")).toBeTruthy();
    expect(within(tree).getByText("Bisavô paterno")).toBeTruthy();
    expect(within(tree).getByText("Trisavô paterno")).toBeTruthy();
    expect(within(tree).getByText("Tetravô paterno")).toBeTruthy();
    expect(within(tree).getByText("Pentavô paterno")).toBeTruthy();
    expect(screen.getByText("A árvore foi limitada a 6 gerações para manter a consulta rápida.")).toBeTruthy();

    for (const [ancestorName, parentName] of [
      ["Avô Externo", "Bisavô Externo"],
      ["Bisavô Externo", "Trisavô Externo"],
      ["Trisavô Externo", "Tetravô Externo"],
      ["Tetravô Externo", "Pentavô Externo"]
    ]) {
      fireEvent.click(within(tree).getByLabelText(`Expandir pais de ${ancestorName}`));
      await waitFor(() => expect(within(tree).getByText(parentName)).toBeTruthy());
    }
  });

  it("keeps ancestry editing hidden unless the API authorizes the external node", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse([], false));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.getByText("Ascendência ainda não informada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar ascendência" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adicionar ascendência de Avô Externo" })).toBeNull();
  });

  it("does not claim ancestry is missing beyond a truncated query depth", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse([], true, 1, true));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    expect(screen.queryByText("Ascendência ainda não informada")).toBeNull();
    expect(screen.queryByRole("button", { name: "Adicionar ascendência" })).toBeNull();
  });

  it("adds an external parent to an empty root directly from the tree", async () => {
    const emptyDetails = detailsResponse({
      externalFatherName: null,
      externalFatherSex: null,
      father: null,
      fatherBirdId: null,
      externalMotherName: null,
      externalMotherSex: null,
      mother: null,
      motherBirdId: null
    });
    const rootOnlyTree = genealogyResponse({
      edges: [],
      nodes: [
        { birthDate: "2021-06-15", birdId: "bird-a", canEdit: false, canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" }
      ]
    });
    const updatedBird = genealogyUpdateResponse({ externalFatherName: "Pai Externo", externalFatherSex: "Male", fatherBirdId: null });
    const updatedTree = genealogyResponse({
      edges: [{ childNodeKey: "bird:bird-a", parentNodeKey: `external:${editableAncestorId}`, position: "father" }],
      nodes: [
        { birthDate: "2021-06-15", birdId: "bird-a", canEdit: false, canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
        { birthDate: null, birdId: null, canEdit: true, canNavigate: false, generation: 1, isAccessible: false, isSnapshot: true, name: "Pai Externo", nodeKey: `external:${editableAncestorId}`, position: "father", ringNumber: null, sex: "Male", source: "External", status: null }
      ]
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(emptyDetails)
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(rootOnlyTree)
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(updatedBird)
      .mockResolvedValueOnce(updatedTree);
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock, "");
    const tree = screen.getByRole("region", { name: "Árvore genealógica" });
    fireEvent.click(within(tree).getByRole("button", { name: "Adicionar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "father" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ancestral externo" }));
    fireEvent.change(within(dialog).getByLabelText(/Nome do ancestral externo/), { target: { value: " Pai Externo " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar e salvar ascendência" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    const mutationUrl = String(fetchMock.mock.calls[6][0]);
    const mutationOptions = fetchMock.mock.calls[6][1] as RequestInit;
    expect(mutationUrl).toContain("/api/birds/bird-a/genealogy");
    expect(mutationOptions.method).toBe("PUT");
    expect(JSON.parse(String(mutationOptions.body))).toEqual({
      fatherBirdId: null,
      externalFatherName: "Pai Externo",
      externalFatherSex: "Male",
      motherBirdId: null,
      externalMotherName: null,
      externalMotherSex: null
    });
    expect(new Headers(mutationOptions.headers).get("X-XSRF-TOKEN")).toBe("test-csrf-token");
    expect(String(fetchMock.mock.calls[7][0])).toContain("/api/birds/bird-a/genealogy?maxGenerations=2");
    await waitFor(() => expect(screen.getAllByText("Pai Externo").length).toBeGreaterThan(1));
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("adds a registered bird as the missing root parent and preserves the other parent", async () => {
    const updatedBird = genealogyUpdateResponse({
      motherBirdId: "bird-new-mother"
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse())
      .mockResolvedValueOnce(parentOptionsResponse("Female"))
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(updatedBird)
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    const tree = screen.getByRole("region", { name: "Árvore genealógica" });
    fireEvent.click(within(tree).getByRole("button", { name: "Completar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar ascendência" });
    const position = within(dialog).getByLabelText("Posição") as HTMLSelectElement;
    expect(Array.from(position.options).map((option) => option.value)).toEqual(["", "mother"]);
    fireEvent.change(position, { target: { value: "mother" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ave cadastrada" }));
    fireEvent.change(within(dialog).getByLabelText(/Buscar mãe cadastrada/), { target: { value: "Mãe Cadastrada" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(String(fetchMock.mock.calls[5][0])).toContain("/api/birds/parent-options?search=M%C3%A3e%20Cadastrada&sex=Female&limit=5");
    fireEvent.click(await within(dialog).findByRole("option", { name: /Mãe Cadastrada/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar e salvar ascendência" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(9));
    const mutationUrl = String(fetchMock.mock.calls[7][0]);
    const mutationOptions = fetchMock.mock.calls[7][1] as RequestInit;
    expect(mutationUrl).toContain("/api/birds/bird-a/genealogy");
    expect(mutationOptions.method).toBe("PUT");
    expect(JSON.parse(String(mutationOptions.body))).toEqual({
      fatherBirdId: "father-a",
      externalFatherName: null,
      externalFatherSex: null,
      motherBirdId: "bird-new-mother",
      externalMotherName: null,
      externalMotherSex: null
    });
    expect(String(fetchMock.mock.calls[8][0])).toContain("/api/birds/bird-a/genealogy?maxGenerations=2");
    await waitFor(() => expect(screen.getAllByText("Mãe Cadastrada").length).toBeGreaterThan(0));
  });

  it("does not offer root editing when both direct parents are already informed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({
        mother: { birdId: "mother-a", birthDate: "2017-05-10", name: "Mãe Rubi", ringNumber: "222222", sex: "Female", status: "Active" },
        motherBirdId: "mother-a"
      }))
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    const tree = screen.getByRole("region", { name: "Árvore genealógica" });
    expect(within(tree).queryByRole("button", { name: "Completar ascendência" })).toBeNull();
    expect(within(tree).queryByRole("button", { name: "Adicionar ascendência" })).toBeNull();
  });

  it("scrolls to genealogy when opened from the registration completion link", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    window.history.pushState({}, "", "/plantel/aves/bird-a#genealogia");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
  });

  it("adds an external grandparent through the official mutation and reloads the current tree depth", async () => {
    const updatedTree = genealogyResponse({
      edges: [
        { childNodeKey: "bird:bird-a", parentNodeKey: `external:${editableAncestorId}`, position: "father" },
        { childNodeKey: `external:${editableAncestorId}`, parentNodeKey: "external:20000000-0000-4000-8000-000000000001", position: "father" }
      ],
      nodes: [
        { birthDate: "2021-06-15", birdId: "bird-a", canEdit: false, canNavigate: true, generation: 0, isAccessible: true, isSnapshot: false, name: "Aurora", nodeKey: "bird:bird-a", position: "root", ringNumber: "123456", sex: "Female", source: "Private", status: "Active" },
        { birthDate: null, birdId: null, canEdit: true, canNavigate: false, generation: 1, isAccessible: false, isSnapshot: true, name: "Avô Externo", nodeKey: `external:${editableAncestorId}`, position: "father", ringNumber: null, sex: "Male", source: "External", status: null },
        { birthDate: null, birdId: null, canEdit: false, canNavigate: false, generation: 2, isAccessible: false, isSnapshot: true, name: "Avô Azul", nodeKey: "external:20000000-0000-4000-8000-000000000001", position: "father", ringNumber: null, sex: "Male", source: "External", status: null }
      ]
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse())
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(updatedTree);
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    expect(screen.getByText("Ascendência ainda não informada")).toBeTruthy();
    const initialTree = screen.getByRole("region", { name: "Árvore genealógica" });
    Object.defineProperty(initialTree, "scrollLeft", { configurable: true, value: 180, writable: true });
    fireEvent.scroll(initialTree);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "father" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ancestral externo" }));
    fireEvent.change(within(dialog).getByLabelText(/Nome do ancestral externo/), { target: { value: " Avô Azul " } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar e salvar ascendência" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    const mutationUrl = String(fetchMock.mock.calls[6][0]);
    const mutationOptions = fetchMock.mock.calls[6][1] as RequestInit;
    expect(mutationUrl).toContain(`/api/birds/bird-a/genealogy/ancestors/${editableAncestorId}/parents/father`);
    expect(mutationOptions.method).toBe("PUT");
    expect(JSON.parse(String(mutationOptions.body))).toEqual({ name: "Avô Azul" });
    expect(new Headers(mutationOptions.headers).get("X-XSRF-TOKEN")).toBe("test-csrf-token");
    expect(String(fetchMock.mock.calls[7][0])).toContain("/api/birds/bird-a/genealogy?maxGenerations=2");
    await waitFor(() => expect(screen.getByText("Avô Azul")).toBeTruthy());
    const updatedAncestor = screen.getByText("Avô Externo").closest(".bird-genealogy-node") as HTMLElement | null;
    const addedAncestor = screen.getByText("Avô Azul").closest(".bird-genealogy-node") as HTMLElement | null;
    expect(updatedAncestor).toBeTruthy();
    expect(addedAncestor).toBeTruthy();
    if (!(updatedAncestor instanceof HTMLElement) || !(addedAncestor instanceof HTMLElement)) throw new Error("Nós da árvore genealógica não encontrados.");
    expect(within(updatedAncestor).queryByText("Ascendência ainda não informada")).toBeNull();
    expect(within(addedAncestor).getByText("Ascendência ainda não informada")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("region", { name: "Árvore genealógica" }).scrollLeft).toBe(180));
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("searches tenant parent options by the selected position and confirms before replacing a parent", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse([
        { birdId: null, name: "Pai Antigo", nodeKey: "external:20000000-0000-4000-8000-000000000002", position: "father", source: "External" }
      ]))
      .mockResolvedValueOnce(parentOptionsResponse())
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(genealogyResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Editar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "father" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ave cadastrada" }));
    fireEvent.change(within(dialog).getByLabelText(/Buscar pai cadastrado/), { target: { value: "Pai Cadastrado" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(String(fetchMock.mock.calls[5][0])).toContain("/api/birds/parent-options?search=Pai%20Cadastrado&sex=Male&limit=5");
    fireEvent.click(await within(dialog).findByRole("option", { name: /Pai Cadastrado/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar e salvar ascendência" }));

    expect(within(dialog).getByRole("group", { name: "Confirmar substituição" }).textContent).toContain("Pai Antigo");
    expect(within(dialog).getByRole("group", { name: "Confirmar substituição" }).textContent).toContain("Pai Cadastrado");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar substituição" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(9));
    const mutationOptions = fetchMock.mock.calls[7][1] as RequestInit;
    expect(mutationOptions.method).toBe("PUT");
    expect(JSON.parse(String(mutationOptions.body))).toEqual({ linkedBirdId: "bird-new-father" });
    expect(String(fetchMock.mock.calls[8][0])).toContain("/api/birds/bird-a/genealogy?maxGenerations=2");
  });

  it("retries a forbidden parent search and reports an empty result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Only the owner can search birds." }), { headers: { "content-type": "application/problem+json" }, status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ breedingFarmId: "farm-a", items: [] }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "mother" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ave cadastrada" }));
    fireEvent.change(within(dialog).getByLabelText(/Buscar mãe cadastrada/), { target: { value: "Mãe" } });

    expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Sua conta não tem permissão para buscar aves deste criatório.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Tentar novamente" }));

    expect(await within(dialog).findByText("Nenhuma ave ativa encontrada para essa busca.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(String(fetchMock.mock.calls[5][0])).toContain("sex=Female&limit=5");
    expect(String(fetchMock.mock.calls[6][0])).toBe(String(fetchMock.mock.calls[5][0]));
  });

  it("confirms unlinking only the selected position and preserves the other branch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse([
        { birdId: null, name: "Pai Preservado", nodeKey: "external:20000000-0000-4000-8000-000000000003", position: "father", source: "External" },
        { birdId: null, name: "Mãe Removida", nodeKey: "external:20000000-0000-4000-8000-000000000004", position: "mother", source: "External" }
      ]))
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(editableExternalGenealogyResponse([
        { birdId: null, name: "Pai Preservado", nodeKey: "external:20000000-0000-4000-8000-000000000003", position: "father", source: "External" }
      ]));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Editar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "mother" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desvincular Mãe" }));
    expect(within(dialog).getByText(/removerá somente o vínculo de Mãe/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar desvínculo de Mãe" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    const unlinkUrl = String(fetchMock.mock.calls[6][0]);
    const unlinkOptions = fetchMock.mock.calls[6][1] as RequestInit;
    expect(unlinkUrl).toContain(`/api/birds/bird-a/genealogy/ancestors/${editableAncestorId}/parents/mother`);
    expect(unlinkOptions.method).toBe("DELETE");
    expect(unlinkOptions.body).toBeUndefined();
    const tree = screen.getByLabelText("Árvore genealógica");
    expect(within(tree).getByText("Pai Preservado")).toBeTruthy();
    expect(within(tree).queryByText("Mãe Removida")).toBeNull();
  });

  it("explains a genealogy conflict without applying client-side cycle rules", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse())
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The genealogy change conflicts with the current genealogy state." }), { headers: { "content-type": "application/problem+json" }, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "father" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ancestral externo" }));
    fireEvent.change(within(dialog).getByLabelText(/Nome do ancestral externo/), { target: { value: "Avô de Teste" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar e salvar ascendência" }));

    expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "A alteração não é compatível com o estado atual da árvore. Confira os vínculos e tente novamente.");
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it.each([
    [403, "The breeding farm owner is required.", "Somente o responsável pelo criatório pode editar esta ascendência."],
    [404, "The genealogy node was not found.", "O ancestral ou o vínculo selecionado não está mais disponível. Atualize a árvore e tente novamente."]
  ])("explains an API rejection with status %i", async (status, title, expectedMessage) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(eligibilityResponse())
      .mockResolvedValueOnce(editableExternalGenealogyResponse())
      .mockResolvedValueOnce(antiforgeryTokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title }), { headers: { "content-type": "application/problem+json" }, status }));
    vi.stubGlobal("fetch", fetchMock);

    await openDetail(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ascendência" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar ascendência" });
    fireEvent.change(within(dialog).getByLabelText("Posição"), { target: { value: "father" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Ancestral externo" }));
    fireEvent.change(within(dialog).getByLabelText(/Nome do ancestral externo/), { target: { value: "Avô de Teste" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar e salvar ascendência" }));

    expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", expectedMessage);
    expect(fetchMock).toHaveBeenCalledTimes(7);
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

  it("shows bird information checks and offers a contextual identification action", async () => {
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

    expect(screen.getByRole("heading", { name: "Confira as informações desta ave" })).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "Arquivos da ave" })).toBeTruthy();
    expect(screen.getByText("Nenhuma foto ou anexo cadastrado.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Código de identificação da ave" })).toBeTruthy();
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira as informações desta ave" })).toBeTruthy());
    const eligibilityPanel = screen.getByRole("heading", { name: "Confira as informações desta ave" }).closest("section");
    expect(eligibilityPanel).not.toBeNull();
    expect(within(eligibilityPanel as HTMLElement).getByRole("alert").textContent).toContain("Não foi possível conferir as informações");

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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confira as informações desta ave" })).toBeTruthy());
    const eligibilityPanel = screen.getByRole("heading", { name: "Confira as informações desta ave" }).closest("section");
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
