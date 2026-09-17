import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReproductionPage from "./page";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ refresh, session: { email: "owner@example.com" }, status: "authenticated" })
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

function selectedFarmResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: true, name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId: "farm-a"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function bird(overrides: Partial<{
  birdId: string;
  imageUrl: string | null;
  name: string;
  ringNumber: string | null;
  sex: "Female" | "Male" | "Unknown";
}> = {}) {
  return {
    birthDate: "2024-02-14",
    birdId: "bird-male",
    identificationPending: false,
    imageUrl: null,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Male" as const,
    speciesPopularName: "Canário-do-reino",
    ...overrides
  };
}

function birdsResponse(items: ReturnType<typeof bird>[]): Response {
  return new Response(JSON.stringify({ items, totalCount: items.length }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function reproductionResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    createdAtUtc: "2026-09-15T12:00:00Z",
    endDate: null,
    femaleBirdId: "bird-female",
    maleBirdId: "bird-male",
    notes: "Acompanhamento do viveiro 2.",
    reproductionId: "reproduction-a",
    startDate: "2026-09-10",
    status: "Active",
    updatedAtUtc: "2026-09-15T12:00:00Z"
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

function successfulLoad(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock
    .mockResolvedValueOnce(selectedFarmResponse())
    .mockResolvedValueOnce(birdsResponse([bird()]))
    .mockResolvedValueOnce(birdsResponse([bird({ birdId: "bird-female", name: "Brisa", sex: "Female" })]));
}

async function reachReview(fetchMock: ReturnType<typeof vi.fn>) {
  render(<ReproductionPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o casal" })).toBeTruthy());
  fireEvent.click(screen.getByRole("option", { name: /Aurora/ }));
  fireEvent.click(screen.getByRole("option", { name: /Brisa/ }));
  expect(screen.queryByText(/API/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Defina o período" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/Data de início/), { target: { value: "2026-09-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Dados da reprodução" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/Observações/), { target: { value: "Acompanhamento do viveiro 2." } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Revise os dados" })).toBeTruthy());
  expect(screen.getByText("Aurora").closest(".reproduction-review-bird")?.querySelector("img")).toBeTruthy();
  expect(screen.getByText("Brisa").closest(".reproduction-review-bird")?.querySelector("img")).toBeTruthy();
  expect(screen.queryByText(/API|servidor/i)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(3);
}

describe("ReproductionPage", () => {
  it("completes the flow and sends the backend contract", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }));
    fetchMock.mockResolvedValueOnce(reproductionResponse());
    vi.stubGlobal("fetch", fetchMock);

    await reachReview(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Salvar reprodução" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Reprodução registrada com sucesso" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Ver detalhes" }).getAttribute("href")).toBe("/reproducao/reproduction-a");
    expect(screen.getByRole("link", { name: "Ver todas as reproduções" }).getAttribute("href")).toBe("/reproducao");
    expect(screen.queryByText("Identificador")).toBeNull();
    expect(screen.queryByText("reproduction-a")).toBeNull();
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/reproductions");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      maleBirdId: "bird-male",
      femaleBirdId: "bird-female",
      startDate: "2026-09-10",
      endDate: null,
      notes: "Acompanhamento do viveiro 2."
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).not.toHaveProperty("status");
  });

  it("validates the required period before advancing", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o casal" })).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Aurora/ }));
    fireEvent.click(screen.getByRole("option", { name: /Brisa/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Defina o período" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Informe a data de início.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Defina o período" })).toBeTruthy();
  });

  it("surfaces server validation without moving the business rule to the client", async () => {
    const fetchMock = vi.fn();
    successfulLoad(fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "O casal não pode ser reproduzido.", errors: { birds: ["O macho e a fêmea não são compatíveis."] } }), {
        headers: { "content-type": "application/problem+json" },
        status: 400
      }));
    vi.stubGlobal("fetch", fetchMock);

    await reachReview(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Salvar reprodução" }));

    await waitFor(() => expect(screen.getByText("O casal não pode ser reproduzido.")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Escolha o casal" })).toBeTruthy();
    expect(screen.getByText("O macho e a fêmea não são compatíveis.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("blocks the flow when one sex has no eligible birds", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird()]))
      .mockResolvedValueOnce(birdsResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Nenhum casal disponível" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Cadastrar ave" }).getAttribute("href")).toBe("/plantel/aves/novo");
  });

  it("refreshes an expired session while loading the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdsResponse([bird()]))
      .mockResolvedValueOnce(birdsResponse([bird({ birdId: "bird-female", name: "Brisa", sex: "Female" })]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha o casal" })).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("offers retry feedback when the bird lists fail", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar as aves" })).toBeTruthy());
    expect(screen.getByText("O serviço está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
