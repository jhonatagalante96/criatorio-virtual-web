import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitionsListScreen } from "./competitions-list-screen";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../lib/auth/auth-context", () => ({
  useAuth: () => ({ refresh, session: { email: "owner@example.com" }, status: "authenticated" })
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

function farmResponse(selectedBreedingFarmId: string | null = "farm-1"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [
      { breedingFarmId: "farm-1", isSelected: selectedBreedingFarmId === "farm-1", name: "Criatório Aurora", responsibleName: "Ana Souza" },
      { breedingFarmId: "farm-2", isSelected: selectedBreedingFarmId === "farm-2", name: "Criatório Horizonte", responsibleName: "Carlos Lima" }
    ],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function birdsApiResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-1",
    items: [
      { birdId: "bird-1", name: "Valente", ringNumber: "BR-001" },
      { birdId: "bird-2", name: "Canário Dourado", ringNumber: null }
    ]
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function competitionsApiResponse(items: unknown[] = [], page = 1, pageSize = 20, totalCount = items.length, totalPages = 1): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-1",
    items,
    page,
    pageSize,
    totalCount,
    totalPages
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

const sampleItem = {
  bird: {
    birdId: "bird-1",
    name: "Valente",
    ringNumber: "BR-001"
  },
  breedingFarmId: "farm-1",
  category: "Canto Clássico",
  competitionId: "comp-1",
  createdAtUtc: "2026-09-15T12:00:00Z",
  date: "2026-09-10",
  location: "Curitiba - PR",
  name: "Torneio Nacional de Canto",
  notes: "Excelente desempenho.",
  placement: 1,
  updatedAtUtc: "2026-09-15T12:00:00Z"
};

const sampleItemNoPlacement = {
  bird: {
    birdId: "bird-2",
    name: "Canário Dourado",
    ringNumber: null
  },
  breedingFarmId: "farm-1",
  category: null,
  competitionId: "comp-2",
  createdAtUtc: "2026-09-12T10:00:00Z",
  date: null,
  location: null,
  name: "Exposição Regional",
  notes: null,
  placement: null,
  updatedAtUtc: "2026-09-12T10:00:00Z"
};

describe("CompetitionsListScreen", () => {
  it("renders the list of competitions with bird summary, placement, and links", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        return competitionsApiResponse([sampleItem, sampleItemNoPlacement], 1, 20, 2, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Torneio Nacional de Canto")).not.toBeNull();
    });

    // Placement badge
    expect(screen.getByText("1º lugar")).not.toBeNull();

    // Bird summary for item 1
    expect(screen.getAllByText(/Valente/).length).toBeGreaterThan(0);
    expect(screen.getByText(/anilha BR-001/)).not.toBeNull();

    // Item 2 without placement or ring number
    expect(screen.getByText("Exposição Regional")).not.toBeNull();
    expect(screen.getAllByText(/Canário Dourado/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sem anilha informada/)).not.toBeNull();

    // Link to details
    const detailLink = screen.getByRole("link", {
      name: "Ver detalhes da competição Torneio Nacional de Canto da ave Valente"
    });
    expect(detailLink.getAttribute("href")).toBe("/plantel/aves/bird-1/competicoes/comp-1");

    // Header CTA
    const createLink = screen.getByRole("link", { name: "Registrar competição" });
    expect(createLink.getAttribute("href")).toBe("/competicoes/nova");
  });

  it("renders empty state when there are no competitions registered", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) return competitionsApiResponse([], 1, 20, 0, 0);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma competição registrada")).not.toBeNull();
    });

    const firstRegLink = screen.getByRole("link", { name: "Registrar primeira competição" });
    expect(firstRegLink.getAttribute("href")).toBe("/competicoes/nova");
  });

  it("filters competitions and handles pagination reset", async () => {
    let lastQuery = "";
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        lastQuery = url;
        return competitionsApiResponse([sampleItem], 1, 20, 1, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Torneio Nacional de Canto")).not.toBeNull();
    });

    // Fill filter form
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "Torneio" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "Canto" } });
    fireEvent.change(screen.getByLabelText("Ave"), { target: { value: "bird-1" } });
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-09-30" } });

    // Submit filter
    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => {
      expect(lastQuery).toContain("search=Torneio");
      expect(lastQuery).toContain("category=Canto");
      expect(lastQuery).toContain("birdId=bird-1");
      expect(lastQuery).toContain("fromDate=2026-09-01");
      expect(lastQuery).toContain("toDate=2026-09-30");
      expect(lastQuery).toContain("page=1");
    });
  });

  it("validates date range when fromDate > toDate without sending invalid query", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) return competitionsApiResponse([], 1, 20, 0, 0);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma competição registrada")).not.toBeNull();
    });

    const callCountBefore = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-09-10" } });

    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(screen.getByRole("alert").textContent).toContain("A data final deve ser igual ou posterior à data inicial.");
    // No new query sent
    expect(fetchMock.mock.calls.length).toBe(callCountBefore);
  });

  it("clears filters and reloads full list", async () => {
    let lastQuery = "";
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        lastQuery = url;
        return competitionsApiResponse([sampleItem], 1, 20, 1, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen initialFilters={{ search: "Antigo" }} />);

    await waitFor(() => {
      expect(screen.getByText("Torneio Nacional de Canto")).not.toBeNull();
    });

    expect(lastQuery).toContain("search=Antigo");

    // Click Limpar filtros
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => {
      expect(lastQuery).not.toContain("search=Antigo");
      expect((screen.getByLabelText("Buscar") as HTMLInputElement).value).toBe("");
    });
  });

  it("navigates pages when multiple pages exist", async () => {
    let pageQueried = 1;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        const match = url.match(/page=(\d+)/);
        pageQueried = match ? Number(match[1]) : 1;
        return competitionsApiResponse([sampleItem], pageQueried, 20, 25, 2);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Página 1 de 2 · 25 registros")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    await waitFor(() => {
      expect(pageQueried).toBe(2);
      expect(screen.getByText("Página 2 de 2 · 25 registros")).not.toBeNull();
    });
  });

  it("renders error state when api fails and allows retry", async () => {
    let shouldFail = true;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        if (shouldFail) {
          return new Response(JSON.stringify({ title: "Erro de servidor", status: 500 }), {
            headers: { "content-type": "application/json" },
            status: 500
          });
        }
        return competitionsApiResponse([sampleItem], 1, 20, 1, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Não foi possível consultar as competições")).not.toBeNull();
    });

    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => {
      expect(screen.getByText("Torneio Nacional de Canto")).not.toBeNull();
    });
  });

  it("renders blocked state when no farm is selected", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse(null);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Selecione um criatório")).not.toBeNull();
    });

    const selectLink = screen.getByRole("link", { name: "Selecionar criatório" });
    expect(selectLink.getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
  });

  it("searches birds with autocomplete, selects an option, and clears the selection", async () => {
    let birdSearchQuery = "";
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) {
        birdSearchQuery = url;
        if (url.includes("search=Campe")) {
          return new Response(JSON.stringify({
            breedingFarmId: "farm-1",
            items: [
              { birdId: "bird-99", name: "Campeão das Américas", ringNumber: "BR-999" }
            ]
          }), { headers: { "content-type": "application/json" }, status: 200 });
        }
        return birdsApiResponse();
      }
      if (url.includes("api/competitions")) {
        return competitionsApiResponse([sampleItem], 1, 20, 1, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Torneio Nacional de Canto")).not.toBeNull();
    });

    const birdInput = screen.getByLabelText("Ave");
    fireEvent.focus(birdInput);

    // Initial birds should be visible in dropdown
    await waitFor(() => {
      expect(screen.getByText("Todas as aves")).not.toBeNull();
    });

    // Type query to trigger debounced bird search
    fireEvent.change(birdInput, { target: { value: "Campeão" } });

    await waitFor(() => {
      expect(birdSearchQuery).toContain("search=Campe");
      expect(screen.getByText("Campeão das Américas")).not.toBeNull();
    });

    // Select the option from dropdown
    fireEvent.click(screen.getByRole("option", { name: /Campeão das Américas/ }));

    // Input should now display the selected bird name
    expect((birdInput as HTMLInputElement).value).toContain("Campeão das Américas");

    // Clear selection
    const clearBtn = screen.getByLabelText("Limpar seleção de ave");
    fireEvent.click(clearBtn);

    expect((birdInput as HTMLInputElement).value).toBe("");
  });

  it("discards in-flight competition response from previous tenant when tenant changes", async () => {
    let resolveFarm1Competitions!: (res: Response) => void;
    const farm1Promise = new Promise<Response>((resolve) => {
      resolveFarm1Competitions = resolve;
    });

    let notifyFarm1Started!: () => void;
    const farm1StartedPromise = new Promise<void>((resolve) => {
      notifyFarm1Started = resolve;
    });

    const farm2Item = {
      ...sampleItem,
      breedingFarmId: "farm-2",
      competitionId: "comp-farm-2",
      name: "Torneio Fazenda Horizonte"
    };

    let compRequests = 0;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        compRequests += 1;
        if (compRequests === 1) {
          notifyFarm1Started();
          return farm1Promise;
        }
        return competitionsApiResponse([farm2Item], 1, 20, 1, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<CompetitionsListScreen tenantId="farm-1" />);

    // Wait until farm-1 competitions request is actually in-flight
    await farm1StartedPromise;

    // Switch tenant while farm-1 is in-flight
    rerender(<CompetitionsListScreen tenantId="farm-2" />);

    await waitFor(() => {
      expect(screen.getByText("Torneio Fazenda Horizonte")).not.toBeNull();
    });

    // Resolve delayed farm-1 response
    resolveFarm1Competitions(competitionsApiResponse([sampleItem], 1, 20, 1, 1));

    // Farm-1 competition should not overwrite farm-2
    expect(screen.queryByText("Torneio Nacional de Canto")).toBeNull();
    expect(screen.getByText("Torneio Fazenda Horizonte")).not.toBeNull();
  });

  it("ignores stale response when component unmounts while request is in flight", async () => {
    let resolveFirstFarm!: (res: Response) => void;
    const firstFarmPromise = new Promise<Response>((resolve) => {
      resolveFirstFarm = resolve;
    });

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        return firstFarmPromise;
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<CompetitionsListScreen />);

    // Unmount before request resolves
    unmount();

    // Late resolution must not throw or crash
    resolveFirstFarm(competitionsApiResponse([sampleItem], 1, 20, 1, 1));
  });

  it("refreshes an expired session before retrying the list request", async () => {
    let attempts = 0;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/breeding-farms")) return farmResponse("farm-1");
      if (url.includes("api/birds")) return birdsApiResponse();
      if (url.includes("api/competitions")) {
        attempts += 1;
        if (attempts === 1) {
          return new Response(JSON.stringify({ title: "Sessão expirada", status: 401 }), {
            headers: { "content-type": "application/json" },
            status: 401
          });
        }
        return competitionsApiResponse([sampleItem], 1, 20, 1, 1);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsListScreen />);

    await waitFor(() => {
      expect(screen.getByText("Torneio Nacional de Canto")).not.toBeNull();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
