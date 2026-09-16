import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReproductionDetailScreen } from "./reproduction-detail-screen";

const authState = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue({ ok: true }),
  session: { email: "owner@example.com", emailConfirmed: true, userId: "user-id" },
  status: "authenticated"
}));

vi.mock("../../lib/auth/auth-context", () => ({
  useAuth: () => authState
}));

afterEach(() => {
  cleanup();
  authState.status = "authenticated";
  authState.refresh.mockClear();
  vi.unstubAllGlobals();
});

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function detailsResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    createdAtUtc: "2026-09-10T12:00:00Z",
    endDate: null,
    femaleBird: { birthDate: null, birdId: "bird-female", name: "Brisa na origem", ringNumber: "234567", sex: "Female", status: "Active" },
    maleBird: { birthDate: "2021-06-15", birdId: "bird-male", name: "Aurora na origem", ringNumber: "123456", sex: "Male", status: "Transferred" },
    notes: "Histórico mantido no criatório de origem.",
    reproductionId: "reproduction-a",
    startDate: "2026-09-05",
    status: "Active",
    updatedAtUtc: "2026-09-12T12:00:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("ReproductionDetailScreen", () => {
  it("renders origin bird snapshots and never requests current bird profiles", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Detalhes da reprodução" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Aurora na origem" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Brisa na origem" })).toBeTruthy();
    expect(screen.getByText("Transferida")).toBeTruthy();
    expect(screen.getByText("Histórico mantido no criatório de origem.")).toBeTruthy();
    expect(screen.getByText(/não consulta fichas atuais de aves transferidas/i)).toBeTruthy();
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/reproductions/reproduction-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/api/birds/"))).toBe(true);
  });

  it("does not reveal whether a reproduction exists outside the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 404, title: "Not Found" }), {
        headers: { "content-type": "application/problem+json" },
        status: 404
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="private-reproduction" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível consultar esta reprodução" })).toBeTruthy());
    expect(screen.getByText("Esta reprodução não existe ou não está disponível no criatório selecionado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar às reproduções" }).getAttribute("href")).toBe("/reproducao");
  });

  it("refreshes an expired session once before retrying the detail request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(detailsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Detalhes da reprodução" })).toBeTruthy());
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("blocks detail access until the user selects a breeding farm", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("directs the user to reselect the farm when the backend reports a stale selection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 409, title: "Conflict" }), {
        headers: { "content-type": "application/problem+json" },
        status: 409
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível consultar esta reprodução" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
  });
});
