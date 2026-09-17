import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReproductionListPage from "./page";

const authState = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue({ ok: true }),
  session: { email: "owner@example.com", emailConfirmed: true, userId: "user-id" },
  status: "authenticated"
}));

vi.mock("../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

function reproduction(overrides: Record<string, unknown> = {}) {
  return {
    breedingFarmId: "farm-a",
    createdAtUtc: "2026-09-10T12:00:00Z",
    endDate: null,
    femaleBird: { birthDate: "2022-03-11", birdId: "bird-female", name: "Brisa", ringNumber: "234567", sex: "Female", status: "Active" },
    maleBird: { birthDate: "2021-06-15", birdId: "bird-male", name: "Aurora", ringNumber: "123456", sex: "Male", status: "Active" },
    reproductionId: "reproduction-a",
    startDate: "2026-09-05",
    status: "Active",
    updatedAtUtc: "2026-09-10T12:00:00Z",
    ...overrides
  };
}

function listResponse(items: Record<string, unknown>[], overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: 1,
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("ReproductionListPage", () => {
  beforeEach(() => {
    authState.status = "authenticated";
  });

  it("keeps reproduction data private when the session is missing", () => {
    const fetchMock = vi.fn();
    authState.status = "unauthenticated";
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);

    expect(screen.getByRole("heading", { name: "Entre para consultar as reproduções" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks listing until a breeding farm is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lists origin history using the reproduction contract without requesting current bird profiles", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([reproduction()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Ver detalhes da reprodução de Aurora e Brisa" })).toBeTruthy());
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(1);
    expect(screen.getByText(/Início em/).textContent).toContain("05/09/2026");
    expect(screen.getByRole("link", { name: "Ver detalhes da reprodução de Aurora e Brisa" }).getAttribute("href")).toBe("/reproducao/reproduction-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/reproductions?page=1&pageSize=20");
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/api/birds/"))).toBe(true);
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe("include");
  });

  it("applies status filters on the server and preserves them while paging", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([reproduction()]))
      .mockResolvedValueOnce(listResponse([reproduction({ reproductionId: "reproduction-finished", status: "Finished", endDate: "2026-09-08" })], { totalCount: 21, totalPages: 2 }))
      .mockResolvedValueOnce(listResponse([reproduction({ reproductionId: "reproduction-page-two", status: "Finished", endDate: "2026-09-08" })], { page: 2, totalCount: 21, totalPages: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Ver detalhes da reprodução de Aurora e Brisa" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Filtrar por situação"), { target: { value: "Finished" } });

    await waitFor(() => expect(String(fetchMock.mock.calls[2][0])).toContain("status=Finished"));
    expect(screen.getByText("Encerrada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    await waitFor(() => expect(String(fetchMock.mock.calls[3][0])).toContain("page=2&pageSize=20&status=Finished"));
    expect(screen.getByText("Página 2 de 2 · 21 registros")).toBeTruthy();
  });

  it("offers a first-registration action when no reproduction exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);

    await waitFor(() => expect(screen.getByText("Nenhuma reprodução registrada")).toBeTruthy());
    const firstRegistrationLink = screen.getByRole("link", { name: "Registrar primeira reprodução" });
    expect(firstRegistrationLink.getAttribute("href")).toBe("/reproducao/novo");
    expect(firstRegistrationLink.className).toContain("auth-primary-action");
  });

  it("refreshes an expired session once while loading reproduction history", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(listResponse([reproduction()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Ver detalhes da reprodução de Aurora e Brisa" })).toBeTruthy());
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows a recoverable service error and retries the list request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(listResponse([reproduction()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionListPage />);
    await waitFor(() => expect(screen.getByText("Não foi possível consultar as reproduções")).toBeTruthy());
    expect(screen.getByText("O serviço está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByRole("link", { name: "Ver detalhes da reprodução de Aurora e Brisa" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
