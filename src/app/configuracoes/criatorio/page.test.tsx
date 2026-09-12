import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BreedingFarmEditPage from "./page";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/configuracoes/criatorio");
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

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function settingsResponse(overrides: Partial<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    address: {
      city: "São Paulo",
      complement: null,
      neighborhood: "Centro",
      number: "10",
      postalCode: "01001-000",
      state: "SP",
      street: "Rua das Flores"
    },
    breedingFarmId: "farm-id",
    contactEmail: "owner@example.com",
    contactPhone: "+55 11 99999-0000",
    name: "Sítio Aurora",
    officialRegistrationNumber: "REG-001",
    responsibleName: "Ana Souza",
    updatedAtUtc: "2026-09-10T20:00:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function selectionResponse(selectedBreedingFarmId: string | null = "farm-id"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-id", isSelected: selectedBreedingFarmId === "farm-id", name: "Sítio Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function useFarmRoute() {
  window.history.pushState({}, "", "/configuracoes/criatorio?breedingFarmId=farm-id");
}

describe("BreedingFarmEditPage", () => {
  it("keeps the edit screen private without an authenticated session", async () => {
    useFarmRoute();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para editar seu criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks authenticated access when no farm identifier is provided", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the selected farm overview in the authenticated shell", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse())
      .mockResolvedValueOnce(settingsResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Meu Criatório" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Dados básicos" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Endereço" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Contato" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Editar criatório/ }).getAttribute("href")).toContain("breedingFarmId=farm-id");
    expect(screen.getAllByRole("link", { name: "Meu Criatório" }).length).toBeGreaterThan(0);
  });

  it("loads the selected farm settings into an editable form", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora");
    expect((screen.getByLabelText("Nome do responsável") as HTMLInputElement).value).toBe("Ana Souza");
    expect((screen.getByLabelText("Endereço") as HTMLInputElement).value).toBe("Rua das Flores");
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeTruthy();
  });

  it("updates settings with the contract payload and shows confirmation", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(settingsResponse({
        address: {
          city: "Rio de Janeiro",
          complement: "Casa 2",
          neighborhood: "Centro",
          number: "20",
          postalCode: "98765432",
          state: "RJ",
          street: "Avenida B"
        },
        name: "Sítio Aurora Atualizado",
        responsibleName: "Nova Responsável"
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: " Sítio Aurora Atualizado " } });
    fireEvent.change(screen.getByLabelText("Nome do responsável"), { target: { value: " Nova Responsável " } });
    fireEvent.change(screen.getByLabelText("UF"), { target: { value: "RJ" } });
    fireEvent.change(screen.getByLabelText("CEP"), { target: { value: "98765 432" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("atualizados com sucesso"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, updateRequest] = fetchMock.mock.calls[3];
    expect(new Headers(updateRequest.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(updateRequest.body as string)).toEqual({
      address: {
        city: "São Paulo",
        complement: null,
        neighborhood: "Centro",
        number: "10",
        postalCode: "98765 432",
        state: "RJ",
        street: "Rua das Flores"
      },
      contactEmail: "owner@example.com",
      contactPhone: "+55 11 99999-0000",
      name: "Sítio Aurora Atualizado",
      officialRegistrationNumber: "REG-001",
      responsibleName: "Nova Responsável"
    });
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora Atualizado");
  });

  it("validates required fields before making an update request", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(screen.getByText("Informe o nome do criatório.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps API validation errors while preserving the edited form", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: { name: ["The name is invalid."], "Address.State": ["The state is invalid."] },
        title: "Raw API title"
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Confira os dados informados"));
    expect(screen.getByText("Confira o nome do criatório.")).toBeTruthy();
    expect(screen.getByText("Informe a UF com duas letras.")).toBeTruthy();
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora");
  });

  it("shows a recoverable conflict without discarding the official registration", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The official registration number is already in use." }), {
        headers: { "content-type": "application/problem+json" },
        status: 409
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("já está em uso"));
    expect((screen.getByLabelText("Registro oficial (opcional)") as HTMLInputElement).value).toBe("REG-001");
  });

  it("ends the private flow when the update session expires", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para editar seu criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("preserves the form after a network failure", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: "Sítio Preservado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Verifique sua conexão"));
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Preservado");
  });
});
