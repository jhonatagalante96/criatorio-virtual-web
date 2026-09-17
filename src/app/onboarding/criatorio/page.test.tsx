import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BreedingFarmOnboardingPage from "./page";

afterEach(() => {
  cleanup();
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

function createdResponse(): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-id",
    ownerUserId: "user-id"
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

function viaCepResponse(): Response {
  return new Response(JSON.stringify({
    bairro: "",
    complemento: "",
    localidade: "São Paulo",
    logradouro: "Rua das Flores",
    uf: "SP"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: "Sítio Aurora" } });
  fireEvent.change(screen.getByLabelText("Nome do responsável"), { target: { value: "Ana Souza" } });
}

describe("BreedingFarmOnboardingPage", () => {
  it("keeps the creation form private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para criar seu criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar para o login" }).getAttribute("href")).toBe("/login");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates required fields before making a creation request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(authenticatedSession());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    expect(screen.getByText("Informe o nome do criatório.")).toBeTruthy();
    expect(screen.getByText("Informe o nome do responsável.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a farm with optional fields normalized and no address", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(createdResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("E-mail de contato (opcional)"), { target: { value: " owner@example.com " } });
    fireEvent.change(screen.getByLabelText("Telefone (opcional)"), { target: { value: " +55 11 99999-0000 " } });
    fireEvent.change(screen.getByLabelText("Registro oficial (opcional)"), { target: { value: " REG-001 " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Seu criatório foi criado." })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Continuar onboarding" }).getAttribute("href"))
      .toBe("/onboarding/criatorio/selecionar?identityFarmId=farm-id");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, createRequest] = fetchMock.mock.calls[2];
    expect(new Headers(createRequest.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(createRequest.body as string)).toEqual({
      address: null,
      contactEmail: "owner@example.com",
      contactPhone: "+55 11 99999-0000",
      name: "Sítio Aurora",
      officialRegistrationNumber: "REG-001",
      responsibleName: "Ana Souza"
    });
  });

  it("sends the optional address as a complete nullable contract", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(viaCepResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(createdResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    expect((screen.getByLabelText("Rua") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("CEP"), { target: { value: "01001-000" } });
    await waitFor(() => {
      expect((screen.getByLabelText("Rua") as HTMLInputElement).value).toBe("Rua das Flores");
      expect((screen.getByLabelText("Rua") as HTMLInputElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Seu criatório foi criado." })).toBeTruthy());
    const [, createRequest] = fetchMock.mock.calls[3];
    expect(JSON.parse(createRequest.body as string).address).toEqual({
      city: "São Paulo",
      complement: null,
      neighborhood: null,
      number: null,
      postalCode: "01001-000",
      state: "SP",
      street: "Rua das Flores"
    });
  });

  it("keeps address fields locked when the CEP is not found", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(JSON.stringify({ erro: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("CEP"), { target: { value: "99999-999" } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("CEP não encontrado"));
    expect((screen.getByLabelText("Rua") as HTMLInputElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps address fields locked when the CEP service is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("CEP"), { target: { value: "01001-000" } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Não foi possível consultar o CEP agora"));
    expect((screen.getByLabelText("Rua") as HTMLInputElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("locks the form while the creation request is pending", async () => {
    let resolveCreate: (response: Response) => void = () => undefined;
    const pendingCreate = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockReturnValueOnce(pendingCreate);
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect((screen.getByRole("button", { name: "Criando criatório…" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Nome do responsável") as HTMLInputElement).disabled).toBe(true);

    resolveCreate(createdResponse());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Seu criatório foi criado." })).toBeTruthy());
  });

  it("maps an API validation response to field feedback without exposing its payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: { name: ["The name is invalid."], "Address.State": ["The state is invalid."] },
        title: "Raw API title"
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.click(screen.getByText("Adicionar endereço", { exact: false }));
    fireEvent.change(screen.getByLabelText("UF"), { target: { value: "SP" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Confira os dados informados"));
    expect(screen.getByText("The name is invalid.")).toBeTruthy();
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora");
  });

  it("maps a duplicate official registration to a recoverable error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The official registration number is already in use." }), {
        headers: { "content-type": "application/problem+json" },
        status: 409
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Registro oficial (opcional)"), { target: { value: "REG-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("já está em uso"));
    expect((screen.getByLabelText("Registro oficial (opcional)") as HTMLInputElement).value).toBe("REG-001");
  });

  it("ends the private flow when the mutation session expires", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para criar seu criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the route blocked when creation is forbidden", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Acesso bloqueado" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
  });

  it("shows a recoverable network error and preserves the form", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmOnboardingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vamos criar seu criatório" })).toBeTruthy());
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Criar criatório" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Verifique sua conexão"));
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora");
  });
});
