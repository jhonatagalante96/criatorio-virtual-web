import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewInternalTransferPage from "./page";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ refresh, session: { email: "owner@example.com" }, status: "authenticated" })
}));

vi.mock("../../components/authenticated-shell", () => ({
  AuthenticatedShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  window.history.pushState({}, "", "/transferencias/nova");
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

function selectedFarmResponse(): Response {
  return jsonResponse({
    breedingFarms: [{ breedingFarmId: "farm-source", isSelected: true, name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId: "farm-source"
  });
}

function birdListResponse(): Response {
  return jsonResponse({
    items: [{
      ageInYears: 4,
      birthDate: "2022-04-01",
      birdId: "bird-aurora",
      identificationPending: false,
      imageUrl: null,
      name: "Aurora",
      ringNumber: "123456",
      sex: "Female",
      speciesPopularName: "Canário-do-reino",
      status: "Active"
    }],
    page: 1,
    pageSize: 10,
    totalCount: 1,
    totalPages: 1
  });
}

function eligibilityResponse(isEligible = true): Response {
  return jsonResponse({
    birdId: "bird-aurora",
    identificationPending: !isEligible,
    isEligible,
    issues: isEligible ? [] : [{ code: "MissingRingNumber", message: "Anilha inválida." }]
  });
}

function destinationResponse(): Response {
  return jsonResponse({
    items: [{ breedingFarmId: "farm-destination", name: "Criatório Cedro", responsibleName: "Bruno Lima" }],
    page: 1,
    pageSize: 10,
    sourceBreedingFarmId: "farm-source",
    totalCount: 1,
    totalPages: 1
  });
}

function createdTransferResponse(): Response {
  return jsonResponse({
    birdId: "bird-aurora",
    createdAtUtc: "2026-09-16T12:00:00Z",
    destinationBreedingFarmId: "farm-destination",
    sourceBreedingFarmId: "farm-source",
    status: "Pending",
    transferRequestId: "transfer-a",
    updatedAtUtc: "2026-09-16T12:00:00Z"
  }, 201);
}

function apiFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/breeding-farms")) return selectedFarmResponse();
    if (url.pathname.endsWith("/api/birds") && init?.method !== "POST") return birdListResponse();
    if (url.pathname.endsWith("/api/birds/bird-aurora/eligibility")) return eligibilityResponse();
    if (url.pathname.endsWith("/api/internal-transfers/destinations")) return destinationResponse();
    if (url.pathname.endsWith("/antiforgery/token")) return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
    if (url.pathname.endsWith("/api/internal-transfers") && init?.method === "POST") return createdTransferResponse();
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url.pathname}`);
  });
}

async function selectBird(fetchMock: ReturnType<typeof apiFetch>, isEligible = true) {
  render(<NewInternalTransferPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione a ave" })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const birdSearch = screen.getByLabelText("Buscar por nome, anilha ou espécie");
  fireEvent.change(birdSearch, { target: { value: "A" } });
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fireEvent.change(birdSearch, { target: { value: "Au" } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/api/birds"))).toBe(true));
  await waitFor(() => expect(screen.getByRole("button", { name: /Aurora/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Aurora/ }));
  await waitFor(() => expect(screen.getByText(isEligible
    ? "Esta ave atende aos critérios para solicitar uma transferência."
    : "Esta ave não pode ser transferida agora.")).toBeTruthy());
}

describe("NewInternalTransferPage", () => {
  it("searches destinations by bounded pages and creates the confirmed request", async () => {
    const fetchMock = apiFetch();
    vi.stubGlobal("fetch", fetchMock);

    await selectBird(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o criatório de destino" })).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Buscar criatório ou responsável"), { target: { value: "Cedro" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Criatório Cedro/ })).toBeTruthy());
    const destinationRequest = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/api/internal-transfers/destinations"));
    const destinationUrl = new URL(String(destinationRequest?.[0]));
    expect(destinationUrl.searchParams.get("search")).toBe("Cedro");
    expect(destinationUrl.searchParams.get("pageSize")).toBe("10");

    fireEvent.click(screen.getByRole("button", { name: /Criatório Cedro/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Revise a solicitação" })).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Confirmo que desejo solicitar a transferência desta ave para o criatório de destino."));
    fireEvent.click(screen.getByRole("button", { name: "Solicitar transferência" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Transferência solicitada com sucesso" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/internal-transfers");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      birdId: "bird-aurora",
      destinationBreedingFarmId: "farm-destination",
      confirmed: true
    });
    expect(new Headers(postCall?.[1]?.headers).get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(screen.getByText("transfer-a")).toBeTruthy();
  });

  it("blocks an ineligible bird before destination selection", async () => {
    const fetchMock = apiFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/api/birds/bird-aurora/eligibility")) return eligibilityResponse(false);
      if (url.pathname.endsWith("/api/breeding-farms")) return selectedFarmResponse();
      if (url.pathname.endsWith("/api/birds") && init?.method !== "POST") return birdListResponse();
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await selectBird(fetchMock, false);
    expect(screen.getByRole("button", { name: "Continuar" }).hasAttribute("disabled")).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/api/internal-transfers/destinations"))).toBe(false);
  });

  it("loads a bird linked from its plantel entry", async () => {
    window.history.pushState({}, "", "/transferencias/nova?birdId=bird-aurora");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/api/breeding-farms")) return selectedFarmResponse();
      if (url.pathname.endsWith("/api/birds/bird-aurora/eligibility")) return eligibilityResponse();
      if (url.pathname.endsWith("/api/birds/bird-aurora")) return jsonResponse({
        ageInYears: 4,
        birthDate: "2022-04-01",
        birdId: "bird-aurora",
        identificationPending: false,
        imageUrl: null,
        name: "Aurora",
        ringNumber: "123456",
        sex: "Female",
        speciesPopularName: "Canário-do-reino",
        status: "Active"
      });
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewInternalTransferPage />);

    await waitFor(() => expect(screen.getByText("Esta ave atende aos critérios para solicitar uma transferência.")).toBeTruthy());
    expect(screen.getAllByText("Aurora").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Buscar por nome, anilha ou espécie")).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/api/birds/bird-aurora"))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/api/birds/bird-aurora/eligibility"))).toBe(true);
  });
});
