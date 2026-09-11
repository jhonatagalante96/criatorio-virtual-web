import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/dashboard");
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

function dashboardResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    activities: [
      {
        activityType: "BirdRegistered",
        occurredAtUtc: "2026-09-10T15:30:00Z",
        resourceId: "bird-a",
        resourceType: "bird",
        title: "Aurora"
      },
      {
        activityType: "ReproductionRegistered",
        occurredAtUtc: "2026-09-09T12:00:00Z",
        resourceId: "reproduction-a",
        resourceType: "reproduction",
        title: "Reprodução de setembro"
      }
    ],
    breedingFarmId: "farm-a",
    indicators: {
      activeBirdCount: 3,
      activeReproductionCount: 1,
      pendingIdentificationCount: 1
    },
    pending: [{
      code: "BirdIdentificationPending",
      count: 1,
      resourceType: "bird",
      title: "Aves aguardando identificação"
    }],
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function responseWithStatus(status: number): Response {
  return new Response(null, { status });
}

describe("DashboardPage", () => {
  it("keeps the dashboard private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(401));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para consultar o dashboard" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Olá, criador." })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for a farm before loading dashboard data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offers the creation flow when the account has no farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(JSON.stringify({ breedingFarms: [], selectedBreedingFarmId: null }), {
        headers: { "content-type": "application/json" },
        status: 200
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crie seu primeiro criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Criar meu criatório" }).getAttribute("href")).toBe("/onboarding/criatorio");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders real indicators, pending work, recent activities, and available navigation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Olá, criador." })).toBeTruthy());
    expect(screen.getByText(/resumo do que está acontecendo no Criatório Aurora/)).toBeTruthy();

    const activeBirdMetric = screen.getByText("Aves ativas").parentElement;
    if (!activeBirdMetric) throw new Error("Indicador de aves ativas não encontrado.");
    expect(within(activeBirdMetric).getByText("3")).toBeTruthy();

    const pendingMetric = screen.getByText("Identificação pendente").parentElement;
    if (!pendingMetric) throw new Error("Indicador de identificação não encontrado.");
    expect(within(pendingMetric).getByText("1")).toBeTruthy();
    expect(screen.getByText("Aves aguardando identificação")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Aves aguardando identificação/ }).getAttribute("href"))
      .toBe("/plantel/aves?identificationPending=true");

    expect(screen.getByText("Reprodução de setembro")).toBeTruthy();
    expect(screen.getByText(/Ave cadastrada/)).toBeTruthy();
    expect(document.querySelector('a[href="/plantel/aves/bird-a"]')).toBeTruthy();
    expect(document.querySelector('a[href*="reproduction"]')).toBeNull();

    expect(screen.getAllByRole("link", { name: /^Dashboard$/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /^Plantel de aves$/ })).toHaveLength(2);
    expect(screen.queryByText("Relatórios")).toBeNull();
    expect(String(fetchMock.mock.calls[2][0])).toContain("api/dashboard");
  });

  it("renders a useful empty state for a dashboard with no records", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse({
        activities: [],
        indicators: { activeBirdCount: 0, activeReproductionCount: 0, pendingIdentificationCount: 0 },
        pending: []
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Indicadores principais" })).toBeTruthy());
    expect(screen.getByText("Tudo em dia por aqui.")).toBeTruthy();
    expect(screen.getByText("Seu histórico começa aqui.")).toBeTruthy();
    expect(screen.queryByText("Aves aguardando identificação")).toBeNull();
  });

  it("keeps the page usable when optional dashboard sections are missing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse({
        activities: undefined,
        pending: undefined
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Alguns dados do painel"));
    expect(screen.getByText("Tudo em dia por aqui.")).toBeTruthy();
    expect(screen.getByText("Seu histórico começa aqui.")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows a recoverable failure and reloads the dashboard", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(responseWithStatus(503))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar o dashboard" })).toBeTruthy());
    expect(screen.getByText(/dashboard está indisponível/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Olá, criador." })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("recovers once when the dashboard session expires", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Olá, criador." })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("maps a selected-farm conflict to the farm selection flow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(responseWithStatus(409));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
  });

  it("does not expose dashboard data when the API forbids access", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(responseWithStatus(403));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Acesso bloqueado" })).toBeTruthy());
    expect(screen.getByText(/não tem permissão para consultar este dashboard/)).toBeTruthy();
    expect(screen.queryByText("Indicadores principais")).toBeNull();
  });

  it("does not render a payload that belongs to another farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse({ breedingFarmId: "foreign-farm" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar o dashboard" })).toBeTruthy());
    expect(screen.getByText(/criatório selecionado mudou/)).toBeTruthy();
    expect(screen.queryByText("Indicadores principais")).toBeNull();
  });
});
