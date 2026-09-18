import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitionHistoryScreen } from "./competition-history-screen";

const authState = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue({ ok: true }),
  session: { email: "owner@example.com", emailConfirmed: true, userId: "user-id" },
  status: "authenticated"
}));

vi.mock("../../../../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState
}));

afterEach(() => {
  cleanup();
  authState.status = "authenticated";
  authState.refresh.mockClear();
  vi.unstubAllGlobals();
});

beforeEach(() => { authState.status = "authenticated"; });

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" }, status });
}

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "test-token" } });
}

function farmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return response({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  });
}

function birdResponse() {
  return { birdId: "bird-a", name: "Aurora", ringNumber: "123456", speciesPopularName: "Canário-do-reino" };
}

function competition(overrides: Record<string, unknown> = {}) {
  return {
    birdId: "bird-a",
    category: "Canário individual",
    competitionId: "competition-a",
    createdAtUtc: "2026-09-15T12:00:00Z",
    date: "2026-09-14",
    location: "São Paulo, SP",
    name: "Exposição Estadual",
    notes: "Porte e plumagem avaliados.",
    placement: 1,
    updatedAtUtc: "2026-09-15T12:00:00Z",
    ...overrides
  };
}

function listResponse(items: ReturnType<typeof competition>[]) {
  return { breedingFarmId: "farm-a", birdId: "bird-a", items };
}

describe("CompetitionHistoryScreen", () => {
  it("does not request history without an authenticated session", () => {
    const fetchMock = vi.fn();
    authState.status = "unauthenticated";
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" />);

    expect(screen.getByText("Entre para consultar as competições")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks access until a farm is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(farmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" />);

    await screen.findByText("Selecione um criatório");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads the scoped competition history and links each entry to its detail", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(listResponse([competition()])));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" />);

    const detailLink = await screen.findByRole("link", { name: /Exposição Estadual/ });
    expect(detailLink.getAttribute("href")).toBe("/plantel/aves/bird-a/competicoes/competition-a");
    expect(screen.getByText("Aurora · Canário-do-reino · Anilha 123456")).toBeTruthy();
    expect(String(fetchMock.mock.calls[2][0])).toContain("/api/birds/bird-a/competitions");
    expect(fetchMock.mock.calls[2][1]?.credentials).toBe("include");
  });

  it("shows an empty state with a registration action", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(listResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" />);

    await screen.findByText("Nenhuma competição registrada");
    expect(screen.getByRole("link", { name: "Registrar primeira competição" }).getAttribute("href")).toBe("/competicoes/nova?birdId=bird-a");
  });

  it("renders the authorized competition detail fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(competition()));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" competitionId="competition-a" />);

    await screen.findByRole("heading", { name: "Exposição Estadual" });
    expect(screen.getByText("1º lugar")).toBeTruthy();
    expect(screen.getByText("Porte e plumagem avaliados.")).toBeTruthy();
    expect(String(fetchMock.mock.calls[2][0])).toContain("/api/birds/bird-a/competitions/competition-a");
  });

  it("shows a recoverable failure when the history endpoint fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response({ title: "Unexpected error" }, 500))
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(listResponse([competition()])));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" />);

    await screen.findByText("Não foi possível consultar o histórico");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("link", { name: /Exposição Estadual/ });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  });

  it("refreshes an expired session before retrying the history", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response({ title: "Unauthorized" }, 401))
      .mockResolvedValueOnce(response(listResponse([competition()])))
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(listResponse([competition()])));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" />);

    await screen.findByRole("link", { name: /Exposição Estadual/ });
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("edits the approved fields with the antiforgery token and renders the saved response", async () => {
    const updated = competition({ name: "Copa Nacional", date: "2026-09-16", updatedAtUtc: "2026-09-16T12:00:00Z" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(competition()))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(response(updated));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" competitionId="competition-a" />);
    await screen.findByRole("heading", { name: "Exposição Estadual" });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Nome da competição/ }), { target: { value: "Copa Nacional" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await screen.findByText("Competição atualizada com sucesso.");
    expect(screen.getByRole("heading", { name: "Copa Nacional" })).toBeTruthy();
    const [url, options] = fetchMock.mock.calls[4];
    expect(String(url)).toContain("/api/birds/bird-a/competitions/competition-a");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(String(options.body))).toEqual({
      name: "Copa Nacional",
      date: "2026-09-14",
      category: "Canário individual",
      placement: 1,
      location: "São Paulo, SP",
      notes: "Porte e plumagem avaliados."
    });
    expect(new Headers(options.headers).get("x-xsrf-token")).toBe("test-token");
    expect(options.credentials).toBe("include");
  });

  it("shows API validation errors inline and lets the user correct the field", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(competition()))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(response({ title: "Competition update data is invalid.", errors: { Name: ["A competition name is required."] } }, 400));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" competitionId="competition-a" />);
    await screen.findByRole("heading", { name: "Exposição Estadual" });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Revise os campos destacados e tente novamente.")).toBeTruthy();
    expect(screen.getByText("Informe um nome com até 200 caracteres.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Nome da competição/ }).getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("requires explicit confirmation before deleting and removes the item from the detail view", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(farmResponse())
      .mockResolvedValueOnce(response(birdResponse()))
      .mockResolvedValueOnce(response(competition()))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionHistoryScreen birdId="bird-a" competitionId="competition-a" />);
    await screen.findByRole("heading", { name: "Exposição Estadual" });
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/será removido do histórico desta ave/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir competição" }));

    expect(await screen.findByRole("heading", { name: "Competição excluída" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Exposição Estadual" })).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar ao histórico" }).getAttribute("href")).toBe("/plantel/aves/bird-a/competicoes");
    const [url, options] = fetchMock.mock.calls[4];
    expect(String(url)).toContain("/api/birds/bird-a/competitions/competition-a");
    expect(options.method).toBe("DELETE");
    expect(JSON.parse(String(options.body))).toEqual({ confirmed: true });
    expect(new Headers(options.headers).get("x-xsrf-token")).toBe("test-token");
    expect(options.credentials).toBe("include");
  });
});
