import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BirdRegistrationPage from "./page";

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

function speciesResponse(): Response {
  return new Response(JSON.stringify([{
    popularName: "Sabiá-laranjeira",
    scientificName: "Turdus rufiventris",
    speciesId: "species-a"
  }]), { headers: { "content-type": "application/json" }, status: 200 });
}

function tokenResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 200 });
}

function createdBirdResponse(identificationPending = false): Response {
  return new Response(JSON.stringify({
    birdId: "bird-a",
    identificationPending,
    name: "Aurora",
    ringNumber: identificationPending ? null : "123456",
    status: "Active"
  }), { headers: { "content-type": "application/json" }, status: 201 });
}

async function openForm(fetchMock: ReturnType<typeof vi.fn>) {
  render(<BirdRegistrationPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Cadastrar ave" })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledTimes(2);
}

async function chooseSpecies() {
  fireEvent.change(screen.getByLabelText("Pesquisar espécie"), { target: { value: "sa" } });
  await waitFor(() => expect(screen.getByRole("radio", { name: /Sabiá-laranjeira/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("radio", { name: /Sabiá-laranjeira/ }));
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Nome da ave"), { target: { value: "Aurora" } });
  fireEvent.click(screen.getByRole("radio", { name: "Fêmea" }));
  fireEvent.change(screen.getByLabelText(/Data de nascimento/), { target: { value: "2020-09-07" } });
  fireEvent.change(screen.getByLabelText(/Anilha/), { target: { value: "123456" } });
}

describe("BirdRegistrationPage", () => {
  it("keeps bird registration private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdRegistrationPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para cadastrar uma ave" })).toBeTruthy());
    expect(screen.queryByRole("form", { name: "Cadastro de ave" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks registration until a breeding farm is selected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdRegistrationPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByText("Selecione um criatório para continuar o cadastro.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar para o início" }).getAttribute("href")).toBe("/");
  });

  it("shows client validation and does not call the create endpoint for incomplete data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openForm(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar ave" }));

    expect(await screen.findByText("Informe o nome da ave.")).toBeTruthy();
    expect(screen.getByText("Selecione o sexo da ave.")).toBeTruthy();
    expect(screen.getByText("Escolha uma espécie do catálogo.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a bird with a linked parent and shows the completed state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        breedingFarmId: "farm-a",
        items: [{ birdId: "father-a", name: "Pai Azul", ringNumber: "930001", sex: "Male", birthDate: "2018-06-01" }]
      }), { headers: { "content-type": "application/json" }, status: 200 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(createdBirdResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openForm(fetchMock);
    fillRequiredFields();
    await chooseSpecies();

    fireEvent.change(screen.getByPlaceholderText(/Pai Azul ou 930001/), { target: { value: "Pai Azul" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Pai Azul/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Pai Azul/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar ave" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Aurora foi cadastrada." })).toBeTruthy());
    const createRequest = fetchMock.mock.calls[5][1] as RequestInit;
    expect(JSON.parse(createRequest.body as string)).toMatchObject({
      fatherBirdId: "father-a",
      motherBirdId: null,
      name: "Aurora",
      ringNumber: "123456",
      sex: "Female",
      speciesId: "species-a"
    });
    expect(screen.queryByText("Identificação pendente")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cadastrar outra ave" }));
    expect(screen.getByRole("heading", { name: "Cadastrar ave" })).toBeTruthy();
    expect(screen.queryByText("Espécie selecionada")).toBeNull();
  });

  it("accepts an external parent name and reports identification pending", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(createdBirdResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    await openForm(fetchMock);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/Anilha/), { target: { value: "" } });
    await chooseSpecies();
    fireEvent.click(screen.getByRole("button", { name: "Informar nome do pai sem cadastro" }));
    fireEvent.change(screen.getByLabelText("Nome do pai"), { target: { value: "Pai externo" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar ave" }));

    await waitFor(() => expect(screen.getByText("Identificação pendente")).toBeTruthy());
    const createRequest = fetchMock.mock.calls[4][1] as RequestInit;
    expect(JSON.parse(createRequest.body as string)).toMatchObject({
      externalFatherName: "Pai externo",
      externalFatherSex: "Male",
      ringNumber: null
    });
  });

  it("keeps the form available when the API rejects invalid data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: { RingNumber: ["The ring number must contain exactly six digits."] },
        status: 400,
        title: "Bird data is invalid."
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await openForm(fetchMock);
    fillRequiredFields();
    await chooseSpecies();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar ave" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Confira os dados"));
    expect(screen.getByText("A anilha deve ter exatamente seis dígitos.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cadastrar ave" })).toBeTruthy();
  });

  it("shows a specific duplicate ring message without leaving a success state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 409,
        title: "The ring number is already in use."
      }), { headers: { "content-type": "application/problem+json" }, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await openForm(fetchMock);
    fillRequiredFields();
    await chooseSpecies();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar ave" }));

    await waitFor(() => expect(screen.getByText("Já existe uma ave com esta anilha. Confira o número e tente novamente.")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Aurora foi cadastrada." })).toBeNull();
  });
});
