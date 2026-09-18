import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StatisticsPage from "./page";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/estatisticas");
  window.sessionStorage.clear();
  routerReplace.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

function selectedFarmResponse(): Response {
  return jsonResponse({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: true, name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId: "farm-a"
  });
}

function statisticsResponse(from = "2026-08-19", to = "2026-09-17", empty = false): Response {
  return jsonResponse({
    breedingFarmId: "farm-a",
    from,
    to,
    birdsByStatus: empty ? [] : [{ status: "Active", count: 3 }, { status: "Archived", count: 1 }],
    birdsBySex: empty ? [] : [{ sex: "Male", count: 2 }, { sex: "Female", count: 2 }],
    birdsBySpecies: empty ? [] : [{ speciesId: "species-a", popularName: "Canário-da-terra", scientificName: "Sicalis flaveola", count: 3 }],
    daily: empty ? [{ date: to, birdsRegisteredCount: 0, birthsRecordedCount: 0 }] : [
      { date: "2026-09-16", birdsRegisteredCount: 1, birthsRecordedCount: 2, reproductionsStartedCount: 1, reproductionsCompletedCount: 0, internalTransfersInCount: 0, internalTransfersOutCount: 1, externalTransfersOutCount: 0 },
      { date: to, birdsRegisteredCount: 2, birthsRecordedCount: 1, reproductionsStartedCount: 0, reproductionsCompletedCount: 1, internalTransfersInCount: 1, internalTransfersOutCount: 0, externalTransfersOutCount: 1 }
    ],
    transfers: empty ? {
      internalTransfersInCount: 0,
      internalTransfersOutCount: 0,
      externalTransfersOutCount: 0,
      incomingRequestsByStatus: [],
      outgoingRequestsByStatus: []
    } : {
      internalTransfersInCount: 1,
      internalTransfersOutCount: 1,
      externalTransfersOutCount: 1,
      incomingRequestsByStatus: [{ status: "Pending", count: 1 }],
      outgoingRequestsByStatus: [{ status: "Accepted", count: 1 }]
    }
  });
}

function createFetchMock(options: { empty?: boolean; failStatistics?: number } = {}) {
  let statisticsFailures = options.failStatistics ?? 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/auth/session") return jsonResponse({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" });
    if (url.pathname === "/api/breeding-farms") return selectedFarmResponse();
    if (url.pathname === "/api/breeding-farms/current/statistics") {
      if (statisticsFailures > 0) {
        statisticsFailures -= 1;
        return new Response(null, { status: 503 });
      }
      return statisticsResponse(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "", options.empty);
    }
    return new Response(null, { status: 404 });
  });
  return fetchMock;
}

describe("StatisticsPage", () => {
  it("keeps the page behind the authenticated session and shows loading navigation", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<StatisticsPage />);

    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Carregando estatísticas");
  });

  it("renders aggregated indicators, distributions, the date filter, and the accessible daily chart", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    render(<StatisticsPage />);

    await screen.findByRole("heading", { name: "Estatísticas" });
    expect(screen.getAllByText("Criatório Aurora").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Aves no plantel/ })[0].getAttribute("href")).toBe("/plantel/aves");
    expect(screen.getByText("Nascimentos", { selector: ".statistics-metric small" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Plantel por situação" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Solicitações de transferência recebidas" })).toBeTruthy();
    expect(screen.getByRole("group", { name: /Aves cadastradas e nascimentos/ })).toBeTruthy();
    const chartPoint = screen.getByRole("button", { name: /16 de setembro de 2026: 1 ave cadastrada, 2 nascimentos/ });
    fireEvent.pointerEnter(chartPoint);
    expect(screen.getByText("16 de set.", { selector: ".statistics-chart-tooltip strong" })).toBeTruthy();
    expect(screen.getByText("1 ave cadastrada")).toBeTruthy();
    expect(screen.getByText("2 nascimentos")).toBeTruthy();
    fireEvent.focus(chartPoint);
    expect(document.querySelector(".statistics-chart-focus-line")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Estatísticas" }).every((link) => link.getAttribute("href") === "/estatisticas")).toBe(true);
    expect(String(fetchMock.mock.calls.find(([input]) => String(input).includes("current/statistics"))?.[0]))
      .toMatch(/current\/statistics\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });

  it("applies a preset and custom date range, rejecting invalid ranges before the API call", async () => {
    vi.setSystemTime(new Date("2026-09-18T12:00:00.000Z"));
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    render(<StatisticsPage />);
    await screen.findByRole("heading", { name: "Estatísticas" });

    fireEvent.click(screen.getByLabelText("90 dias"));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar período" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("current/statistics"))).toHaveLength(2));
    const presetRequest = new URL(String(fetchMock.mock.calls.filter(([input]) => String(input).includes("current/statistics"))[1][0]));
    expect(presetRequest.searchParams.get("from")).toBe("2026-06-21");
    expect(presetRequest.searchParams.get("to")).toBe("2026-09-18");

    fireEvent.click(screen.getByLabelText("Personalizado"));
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar período" }));
    expect((await screen.findByRole("alert")).textContent).toContain("A data inicial deve ser anterior ou igual à data final.");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("current/statistics"))).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-09-17" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar período" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("current/statistics"))).toHaveLength(3));
    expect(String(fetchMock.mock.calls.filter(([input]) => String(input).includes("current/statistics"))[2][0]))
      .toContain("from=2026-09-10&to=2026-09-17");
  });

  it("shows a truthful empty state and recovers from an API failure with retry", async () => {
    const emptyFetch = createFetchMock({ empty: true });
    vi.stubGlobal("fetch", emptyFetch);
    const view = render(<StatisticsPage />);
    await screen.findByText("Não há movimentações registradas neste período. Os zeros são mantidos para mostrar que a consulta foi concluída.");
    expect(screen.getByText("Ainda não há aves por situação.")).toBeTruthy();

    view.unmount();
    const retryFetch = createFetchMock({ failStatistics: 1 });
    vi.stubGlobal("fetch", retryFetch);
    render(<StatisticsPage />);
    await screen.findByRole("heading", { name: "Não foi possível carregar as estatísticas" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("heading", { name: "Estatísticas" });
    expect(retryFetch.mock.calls.filter(([input]) => String(input).includes("current/statistics"))).toHaveLength(2);
  });

  it("does not expose another tenant's payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/auth/session") return jsonResponse({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" });
      if (url.pathname === "/api/breeding-farms") return selectedFarmResponse();
      if (url.pathname === "/api/breeding-farms/current/statistics") {
        const response = await statisticsResponse().json() as Record<string, unknown>;
        return jsonResponse({ ...response, breedingFarmId: "foreign-farm" });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<StatisticsPage />);

    await screen.findByRole("heading", { name: "Não foi possível carregar as estatísticas" });
    expect(screen.queryByText("Canário-da-terra")).toBeNull();
  });
});
