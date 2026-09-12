import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BirdListPage from "./page";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/plantel/aves");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

function authenticatedSession(): Response {
  return new Response(JSON.stringify({
    email: "owner@example.com",
    emailConfirmed: true,
    userId: "user-id"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{
      breedingFarmId: "farm-a",
      isSelected: selectedBreedingFarmId === "farm-a",
      name: "Criatório Aurora",
      responsibleName: "Ana Souza"
    }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function bird(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ageInYears: 4,
    birthDate: "2021-06-15",
    birdId: "bird-a",
    identificationPending: false,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Female",
    speciesId: "species-a",
    speciesPopularName: "Sabiá-laranjeira",
    speciesScientificName: "Turdus rufiventris",
    status: "Active",
    ...overrides
  };
}

function listResponse(items: Record<string, unknown>[], overrides: Partial<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function speciesResponse(): Response {
  return new Response(JSON.stringify([{
    popularName: "Sabiá-laranjeira",
    scientificName: "Turdus rufiventris",
    speciesId: "species-a"
  }]), { headers: { "content-type": "application/json" }, status: 200 });
}

async function openList(fetchMock: ReturnType<typeof vi.fn>, waitForBird = true) {
  render(<BirdListPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Aves" })).toBeTruthy());
  if (waitForBird) {
    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy());
  } else {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
}

function listUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  return String(fetchMock.mock.calls[callIndex][0]);
}

describe("BirdListPage", () => {
  it("keeps the authenticated shell visible while the plantel session is loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<BirdListPage />);

    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Carregando plantel");
    expect(screen.queryByRole("heading", { name: "Restaurando sua sessão" })).toBeNull();
  });

  it("keeps the plantel private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdListPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para consultar o plantel" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Aves do criatório" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks access until a breeding farm is selected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdListPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByText("Selecione um criatório para consultar o plantel.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the selected farm plantel with pending identification feedback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([
        bird(),
        bird({ birdId: "bird-b", name: "Sem Anilha", identificationPending: true, ringNumber: null, sex: "Unknown" })
      ]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);

    expect(screen.getByRole("navigation", { name: "Módulos disponíveis" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Módulos disponíveis" })).getByRole("link", { name: "Aves" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("complementary", { name: "Resumo do plantel" }).textContent).toContain("aves cadastradas");
    expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Ave Sem Anilha" })).toBeTruthy();
    expect(screen.getByText("Identificação pendente")).toBeTruthy();
    expect(screen.getByText("2 aves encontradas")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cadastrar ave" }).getAttribute("href")).toBe("/plantel/aves/novo");
    expect(screen.getByRole("link", { name: "Abrir ficha de Aurora" }).getAttribute("href")).toBe("/plantel/aves/bird-a");

    const birdRow = screen.getByRole("article", { name: "Ave Aurora" });
    expect(birdRow.querySelector(".bird-list-card-name a")?.getAttribute("href")).toBe("/plantel/aves/bird-a");
    expect(birdRow.querySelector(".bird-list-card-arrow")?.getAttribute("href")).toBe("/plantel/aves/bird-a");
    expect(birdRow.querySelector(".bird-list-card-photo img")?.getAttribute("src")).toBe("/assets/imagery/birds/great-tit-header-hd.webp");
    expect(birdRow.querySelector(".bird-list-card-sex")?.getAttribute("aria-label")).toBe("Sexo: Fêmea");
    fireEvent.click(within(birdRow).getByRole("button", { name: "Abrir ações de Aurora" }));
    const actionMenu = birdRow.querySelector(".bird-row-actions-menu");
    if (!(actionMenu instanceof HTMLElement)) throw new Error("Menu de ações não encontrado.");
    expect(within(actionMenu).getByRole("link", { name: "Ver detalhes de Aurora" }).getAttribute("href")).toBe("/plantel/aves/bird-a");
    expect(within(actionMenu).getByRole("link", { name: "Editar Aurora" }).getAttribute("href")).toBe("/plantel/aves/bird-a/editar");
    expect(within(actionMenu).getByRole("button", { name: "Iniciar transferência" }).hasAttribute("disabled")).toBe(true);
    expect(within(actionMenu).getByRole("button", { name: "Registrar competição" }).hasAttribute("disabled")).toBe(true);
    expect(within(actionMenu).getByRole("button", { name: "Inativar" }).hasAttribute("disabled")).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(birdRow.querySelector(".bird-row-actions")?.hasAttribute("open")).toBe(false);
  });

  it("submits a search and keeps the query represented in the URL and API request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(listResponse([bird({ name: "Aurora Filtrada" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.change(screen.getByLabelText("Buscar ave"), { target: { value: "  Aurora  " } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora Filtrada" })).toBeTruthy());
    expect(window.location.search).toBe("?search=Aurora");
    expect(listUrl(fetchMock, 3)).toContain("search=Aurora");
  });

  it("applies status and identification filters without exposing another tenant", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(listResponse([bird({ status: "Archived", name: "Ave Arquivada" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(document.getElementById("bird-status-filter") as HTMLSelectElement, { target: { value: "Archived" } });

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave Arquivada" })).toBeTruthy());
    expect(window.location.search).toContain("status=Archived");
    expect(listUrl(fetchMock, 3)).toContain("status=Archived");
    expect(screen.queryByText("Outra conta")).toBeNull();
  });

  it("filters by species through the catalog and includes the selected species in the URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(listResponse([bird({ name: "Ave da Espécie" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Espécie" }), { target: { value: "sa" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Sabiá-laranjeira/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Sabiá-laranjeira/ }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave da Espécie" })).toBeTruthy());
    expect(window.location.search).toContain("speciesId=species-a");
    expect(window.location.search).toContain("speciesName=Sabi%C3%A1-laranjeira");
    expect(listUrl(fetchMock, 4)).toContain("speciesId=species-a");
  });

  it("closes the species options when the user clicks outside the filter", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(speciesResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Espécie" }), { target: { value: "sa" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Sabiá-laranjeira/ })).toBeTruthy());

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole("option", { name: /Sabiá-laranjeira/ })).toBeNull());
    expect((screen.getByRole("searchbox", { name: "Espécie" }) as HTMLInputElement).value).toBe("");
  });

  it("explains when the species catalog is forbidden", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Forbidden" }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Espécie" }), { target: { value: "sa" } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("não tem permissão"));
  });

  it("shows a recoverable empty state and restores the list after clearing filters", async () => {
    window.history.pushState({}, "", "/plantel/aves?search=inexistente");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdListPage />);
    await waitFor(() => expect(screen.getByText("Nenhuma ave encontrada")).toBeTruthy());
    const emptyState = screen.getByText("Nenhuma ave encontrada").parentElement;
    if (!emptyState) throw new Error("Estado vazio não encontrado.");
    fireEvent.click(within(emptyState).getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy());
    expect(window.location.search).toBe("");
    expect(listUrl(fetchMock, 3)).not.toContain("search=");
  });

  it("paginates through the API result and represents the current page in the URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()], { totalCount: 21, totalPages: 2 }))
      .mockResolvedValueOnce(listResponse([bird({ birdId: "bird-b", name: "Segunda Página" })], { page: 2, totalCount: 21, totalPages: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Segunda Página" })).toBeTruthy());
    expect(window.location.search).toBe("?page=2");
    expect(listUrl(fetchMock, 3)).toContain("page=2");
    expect(screen.getByRole("button", { name: "Página anterior" }).hasAttribute("disabled")).toBe(false);
  });

  it("offers mobile load more only when more than five birds are available", async () => {
    const mediaQuery = {
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
    const birds = Array.from({ length: 6 }, (_, index) => bird({
      birdId: `bird-${index}`,
      name: `Ave ${index + 1}`
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse(birds));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock, false);

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave 5" })).toBeTruthy());
    expect(screen.queryByRole("article", { name: "Ave Ave 6" })).toBeNull();
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave 6" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(screen.getByText("Mostrando 6 de 6 aves")).toBeTruthy();
  });

  it("shows a retry state when the listing request fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Service unavailable" }), { headers: { "content-type": "application/problem+json" }, status: 503 }))
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock, false);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("serviço está indisponível"));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
