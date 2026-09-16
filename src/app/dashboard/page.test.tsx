import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));

const browserDescriptors = {
  credentials: Object.getOwnPropertyDescriptor(navigator, "credentials"),
  isSecureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  publicKeyCredential: Object.getOwnPropertyDescriptor(window, "PublicKeyCredential")
};

afterEach(() => {
  cleanup();
  if (browserDescriptors.credentials) Object.defineProperty(navigator, "credentials", browserDescriptors.credentials);
  else delete (navigator as { credentials?: CredentialsContainer }).credentials;
  if (browserDescriptors.isSecureContext) Object.defineProperty(window, "isSecureContext", browserDescriptors.isSecureContext);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
  if (browserDescriptors.publicKeyCredential) Object.defineProperty(window, "PublicKeyCredential", browserDescriptors.publicKeyCredential);
  else delete (window as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
  window.history.replaceState({}, "", "/dashboard");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  routerReplace.mockReset();
});

function setBrowserSupport() {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: function PublicKeyCredentialMock() {} });
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { create: vi.fn(), get: vi.fn() } });
}

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

function birdImagesResponse(items: Array<{ birdId: string; imageUrl: string | null }> = [{
  birdId: "bird-a",
  imageUrl: "/species-images/0001.jpg"
}]): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    items,
    page: 1,
    pageSize: items.length,
    totalCount: items.length,
    totalPages: items.length > 0 ? 1 : 0
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function responseWithStatus(status: number): Response {
  return new Response(null, { status });
}

function passkeyCredential(): PublicKeyCredential {
  return {
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    id: "credential-id",
    rawId: new Uint8Array([1]).buffer,
    response: {
      authenticatorData: new Uint8Array([2]).buffer,
      clientDataJSON: new Uint8Array([3]).buffer,
      signature: new Uint8Array([4]).buffer,
      userHandle: null
    },
    toJSON: () => ({
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      id: "credential-id",
      rawId: "AQ",
      response: { authenticatorData: "Ag", clientDataJSON: "Aw", signature: "BA", userHandle: null },
      type: "public-key"
    }),
    type: "public-key"
  } as unknown as PublicKeyCredential;
}

describe("DashboardPage", () => {
  it("does not show the session recovery screen while the dashboard is initializing", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<DashboardPage />);

    expect(screen.queryByRole("heading", { name: "Restaurando sua sessão" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Carregando painel");
    expect(screen.getByRole("status").textContent).not.toContain("Restaurando sua sessão");
  });

  it("keeps the dashboard private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(401));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("heading", { name: "Entre para consultar o painel" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restores an expired session with the device biometric before loading the dashboard", async () => {
    setBrowserSupport();
    const credential = passkeyCredential();
    const credentials = navigator.credentials as CredentialsContainer;
    vi.spyOn(credentials, "get").mockResolvedValue(credential);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: "AQ", userVerification: "required" }), { headers: { "content-type": "application/json" }, status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(birdImagesResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy());
    expect(credentials.get).toHaveBeenCalledOnce();
    expect(routerReplace).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(birdImagesResponse([{
        birdId: "bird-pending",
        imageUrl: "/api/birds/bird-pending/attachments/photo-a/content"
      }]));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy());
    expect(screen.getByText("Visão geral do seu criatório. Acompanhe suas aves, reproduções, transferências e muito mais.")).toBeTruthy();

    const activeBirdMetric = screen.getByText("Aves cadastradas").closest("article");
    if (!activeBirdMetric) throw new Error("Indicador de aves cadastradas não encontrado.");
    expect(within(activeBirdMetric).getByText("3")).toBeTruthy();
    expect(document.querySelectorAll(".dashboard-metric-trend")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Ver aves cadastradas" }).getAttribute("href")).toBe("/plantel/aves");

    const pendingMetric = screen.getByText("Pendências", { selector: ".dashboard-metric-label" }).parentElement;
    if (!pendingMetric) throw new Error("Indicador de pendências não encontrado.");
    expect(within(pendingMetric).getByText("1")).toBeTruthy();
    expect(screen.getByText("Aves aguardando identificação")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Aves aguardando identificação/ }).getAttribute("href"))
      .toBe("/plantel/aves?identificationPending=true");

    expect(screen.getByText("Reprodução de setembro")).toBeTruthy();
    expect(screen.getByText(/Ave cadastrada/)).toBeTruthy();
    expect(document.querySelector('a[href="/plantel/aves/bird-a"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: /Registrar reprodução/ }).getAttribute("href")).toBe("/reproducao/novo");

    expect(screen.getByRole("heading", { name: "Atalhos rápidos" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Cadastrar ave/ }).getAttribute("href")).toBe("/plantel/aves/novo");
    expect(screen.getByText("Registrar reprodução")).toBeTruthy();
    expect(screen.getByText("Nova transferência")).toBeTruthy();
    expect(screen.getByText("Registrar competição")).toBeTruthy();
    expect(screen.getByText("Personalizar atalhos")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Atividades recentes" })).toBeTruthy();
    expect(screen.getByText("Que tal fazer hoje um grande dia para o seu criatório?")).toBeTruthy();
    expect(document.querySelector('img[src="https://localhost:58016/species-images/0001.jpg"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://localhost:58016/api/birds/bird-pending/attachments/photo-a/content"]')).toBeTruthy();
    expect(String(fetchMock.mock.calls[3][0])).toContain("api/birds?sortBy=createdAt&sortDirection=desc&page=1&pageSize=10");
    expect(String(fetchMock.mock.calls[4][0])).toContain("api/birds?identificationPending=true&sortBy=createdAt&sortDirection=desc&page=1&pageSize=1");
    fireEvent.click(screen.getAllByLabelText("Abrir menu de Owner")[0]);
    expect(screen.getAllByRole("link", { name: "Meu Criatório" }).filter((element) => element.closest("details[open]"))).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Configurações" }).filter((element) => element.closest("details[open]"))).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Gerenciar sessão" }).filter((element) => element.closest("details[open]"))).toHaveLength(1);

    expect(screen.getAllByRole("link", { name: /^Painel$/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /^Aves$/ })).toHaveLength(2);
    expect(screen.getAllByText("Reprodução")).toHaveLength(2);
    expect(screen.getAllByText("Transferências").filter((element) => element.closest(".authenticated-nav-link"))).toHaveLength(2);
    expect(screen.getAllByText("Competições")).toHaveLength(2);
    expect(screen.getAllByText("Documentos")).toHaveLength(2);
    expect(screen.queryByLabelText("Notificações")).toBeNull();
    expect(screen.queryByText("Relatórios")).toBeNull();
    expect(String(fetchMock.mock.calls[2][0])).toContain("api/dashboard");
  });

  it("offers passkey activation after the authenticated dashboard confirms an empty account", async () => {
    setBrowserSupport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ passkeys: [] }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Ativar login rápido" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Ative o login rápido" })).toBeTruthy();
    expect(String(fetchMock.mock.calls[5][0])).toContain("api/auth/passkeys");
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

  it("keeps the dashboard usable when bird images cannot be loaded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(responseWithStatus(503))
      .mockResolvedValueOnce(responseWithStatus(503));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Atividades recentes" })).toBeTruthy();
    expect(document.querySelector(".dashboard-activity-icon-green .dashboard-icon")).toBeTruthy();
    expect(screen.getByText("Aves aguardando identificação")).toBeTruthy();
  });

  it("shows a recoverable failure and reloads the dashboard", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(responseWithStatus(503))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(birdImagesResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar o painel" })).toBeTruthy());
    expect(screen.getByText(/painel está indisponível/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("recovers once when the dashboard session expires", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(birdImagesResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(7);
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
    expect(screen.getByText(/não tem permissão para consultar este painel/)).toBeTruthy();
    expect(screen.queryByText("Indicadores principais")).toBeNull();
  });

  it("retries a transient tenant mismatch without showing the access error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse({ breedingFarmId: "foreign-farm" }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse())
      .mockResolvedValueOnce(birdImagesResponse())
      .mockResolvedValueOnce(birdImagesResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Não foi possível carregar o painel" })).toBeNull();
  });

  it("does not render a payload that belongs to another farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse({ breedingFarmId: "foreign-farm" }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(dashboardResponse({ breedingFarmId: "foreign-farm" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar o painel" })).toBeTruthy());
    expect(screen.getByText(/criatório selecionado mudou/)).toBeTruthy();
    expect(screen.queryByText("Indicadores principais")).toBeNull();
  });
});
