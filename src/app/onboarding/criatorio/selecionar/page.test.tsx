import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BreedingFarmSelectionPage from "./page";

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

function selectionResponse(selectedBreedingFarmId: string | null = null): Response {
  return new Response(JSON.stringify({
    breedingFarms: [
      {
        breedingFarmId: "farm-a",
        isSelected: selectedBreedingFarmId === "farm-a",
        name: "Sítio Aurora",
        responsibleName: "Ana Souza"
      },
      {
        breedingFarmId: "farm-b",
        isSelected: selectedBreedingFarmId === "farm-b",
        name: "Criatório Horizonte",
        responsibleName: "Bruno Lima"
      }
    ],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function singleSelectionResponse(selectedBreedingFarmId: string | null = null): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{
      breedingFarmId: "farm-a",
      isSelected: selectedBreedingFarmId === "farm-a",
      name: "Sítio Aurora",
      responsibleName: "Ana Souza"
    }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("BreedingFarmSelectionPage", () => {
  it("keeps the selection private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para continuar" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Continuar com este criatório" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers the creation step when the account has no breeding farms", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(JSON.stringify({ breedingFarms: [], selectedBreedingFarmId: null }), {
        headers: { "content-type": "application/json" },
        status: 200
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crie seu primeiro criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Criar meu criatório" }).getAttribute("href")).toBe("/onboarding/criatorio");
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preselects the persisted farm and saves a new selection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse("farm-a"))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(selectionResponse("farm-b"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha onde continuar" })).toBeTruthy());
    expect((screen.getByRole("radio", { name: /Sítio Aurora/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Criatório Horizonte/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar com este criatório" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Você está em Criatório Horizonte." })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, request] = fetchMock.mock.calls[3];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({ breedingFarmId: "farm-b" });
    expect(screen.getByRole("link", { name: "Continuar" }).getAttribute("href")).toBe("/");
  });

  it("preselects the only farm so the onboarding can be resumed directly", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(singleSelectionResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha onde continuar" })).toBeTruthy());
    expect((screen.getByRole("radio", { name: /Sítio Aurora/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Encontramos um criatório vinculado à sua conta/)).toBeTruthy();
  });

  it("shows a recoverable loading failure and retries the list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(selectionResponse("farm-a"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível carregar seus criatórios" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha onde continuar" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the selection available when the API rejects the chosen farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha onde continuar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /Sítio Aurora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar com este criatório" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("não está mais disponível"));
    expect(screen.getByRole("radio", { name: /Sítio Aurora/ })).toBeTruthy();
  });

  it("shows a blocked state for a forbidden farm list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Acesso bloqueado" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Verificar novamente" })).toBeTruthy();
  });
});
