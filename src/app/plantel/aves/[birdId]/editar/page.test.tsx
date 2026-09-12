import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BirdEditPage from "./page";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/plantel/aves/bird-a/editar");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

function authenticatedSession(): Response {
  return new Response(JSON.stringify({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" }), { headers: { "content-type": "application/json" }, status: 200 });
}

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function birdResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    birthDate: "2021-06-15",
    birdId: "bird-a",
    breedingFarmId: "farm-a",
    deathDate: null,
    identificationPending: false,
    name: "Aurora",
    notes: "Ave acompanhada desde o primeiro cadastro.",
    ringNumber: "123456",
    sex: "Female",
    speciesId: "species-a",
    speciesPopularName: "Sabiá-laranjeira",
    speciesScientificName: "Turdus rufiventris",
    status: "Active",
    updatedAtUtc: "2025-02-03T13:30:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function tokenResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 200 });
}

async function openEditForm(fetchMock: ReturnType<typeof vi.fn>) {
  render(<BirdEditPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Editar dados da ave" })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(screen.getByDisplayValue("Aurora")).toBeTruthy();
  expect(screen.getAllByText("Sabiá-laranjeira").length).toBeGreaterThan(0);
  expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "Resumo da ficha" })).toBeTruthy();
}

describe("BirdEditPage", () => {
  it("keeps the edit form private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para editar a ave" })).toBeTruthy());
    expect(screen.queryByRole("form", { name: "Edição de dados da ave" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks editing until a breeding farm is selected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Edição indisponível" })).toBeTruthy());
    expect(screen.getByText("Selecione um criatório para editar os dados da ave.")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Edição de dados da ave" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads the selected tenant and preserves the bird values in the form", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => Promise.resolve(authenticatedSession()))
      .mockImplementationOnce(() => Promise.resolve(selectedFarmResponse()))
      .mockImplementationOnce(() => Promise.resolve(birdResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await openEditForm(fetchMock);

    expect(screen.getByDisplayValue("2021-06-15")).toBeTruthy();
    expect(screen.getByDisplayValue("123456")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Fêmea" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByDisplayValue("Ave acompanhada desde o primeiro cadastro.")).toBeTruthy();
    expect(screen.getAllByText("Criatório Aurora").length).toBeGreaterThan(0);
  });

  it("blocks all edits for a transferred bird", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse({ status: "Transferred" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Edição bloqueada" })).toBeTruthy());
    expect(screen.getByText(/Esta ave está transferida/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Edição de dados da ave" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows a not-found state when the bird is outside the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The bird was not found." }), { headers: { "content-type": "application/problem+json" }, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Ave não encontrada" })).toBeTruthy());
    expect(screen.getByText("Não foi possível localizar esta ave no criatório selecionado.")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Edição de dados da ave" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("offers retry when loading the bird temporarily fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Service unavailable" }), { headers: { "content-type": "application/problem+json" }, status: 503 }))
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar a ave" })).toBeTruthy());
    expect(screen.getByText("O serviço está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar dados da ave" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("shows client validation and does not call the update endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openEditForm(fetchMock);
    fireEvent.change(screen.getByLabelText("Nome da ave"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Informe o nome da ave.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("updates the bird with the exact backend contract and shows success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(birdResponse({ name: "Aurora Atualizada", notes: "Atualizada" }));
    vi.stubGlobal("fetch", fetchMock);

    await openEditForm(fetchMock);
    fireEvent.change(screen.getByLabelText("Nome da ave"), { target: { value: "Aurora Atualizada" } });
    fireEvent.change(screen.getByLabelText("Observações sobre a ave"), { target: { value: "Atualizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Dados da ave atualizados com sucesso.")).toBeTruthy();
    const updateRequest = fetchMock.mock.calls[4][1] as RequestInit;
    expect(updateRequest.method).toBe("PUT");
    expect(new Headers(updateRequest.headers).get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(JSON.parse(updateRequest.body as string)).toEqual({
      birthDate: "2021-06-15",
      name: "Aurora Atualizada",
      notes: "Atualizada",
      ringNumber: "123456",
      sex: "Female",
      speciesId: "species-a"
    });
  });

  it("preserves edited values and maps API validation errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: { Name: ["A name is required."], BirthDate: ["Birth date cannot be in the future."] },
        status: 400,
        title: "Bird data is invalid."
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await openEditForm(fetchMock);
    fireEvent.change(screen.getByLabelText("Nome da ave"), { target: { value: "Nome temporário" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Confira os dados"));
    expect(screen.getByText("Informe o nome da ave.")).toBeTruthy();
    expect(screen.getByText("A data de nascimento não pode ser futura.")).toBeTruthy();
    expect(screen.getByDisplayValue("Nome temporário")).toBeTruthy();
    expect(screen.queryByText("Dados da ave atualizados com sucesso.")).toBeNull();
  });

  it("shows a specific duplicate ring error without leaving a success state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 409,
        title: "The ring number is already in use."
      }), { headers: { "content-type": "application/problem+json" }, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await openEditForm(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("Já existe uma ave com esta anilha. Confira o número e tente novamente.")).toBeTruthy());
    expect(screen.getByText("Esta anilha já está cadastrada neste criatório.")).toBeTruthy();
    expect(screen.queryByText("Dados da ave atualizados com sucesso.")).toBeNull();
  });

  it("keeps the form available when the update request fails on the network", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(birdResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(new TypeError("Network request failed"));
    vi.stubGlobal("fetch", fetchMock);

    await openEditForm(fetchMock);
    fireEvent.change(screen.getByLabelText("Nome da ave"), { target: { value: "Nome preservado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Verifique sua conexão"));
    expect(screen.getByDisplayValue("Nome preservado")).toBeTruthy();
    expect(screen.queryByText("Dados da ave atualizados com sucesso.")).toBeNull();
  });
});
