import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SpeciesSelectionPage from "./page";

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

function speciesResponse(species = [{
  popularName: "Sabiá-laranjeira",
  scientificName: "Turdus rufiventris",
  speciesId: "species-a"
}, {
  popularName: "Canário-da-terra",
  scientificName: "Sicalis flaveola",
  speciesId: "species-b"
}]): Response {
  return new Response(JSON.stringify(species), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("SpeciesSelectionPage", () => {
  it("keeps the species catalog private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SpeciesSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para continuar" })).toBeTruthy());
    expect(screen.queryByLabelText("Pesquisar espécie")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads active species, searches by text and requires an existing selection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(speciesResponse([{
        popularName: "Sabiá-laranjeira",
        scientificName: "Turdus rufiventris",
        speciesId: "species-a"
      }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<SpeciesSelectionPage />);

    await waitFor(() => expect(screen.getByRole("radio", { name: /Sabiá-laranjeira/ })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Confirmar espécie" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Pesquisar espécie"), { target: { value: "sabia" } });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Turdus rufiventris/ })).toBeTruthy());
    expect(fetchMock.mock.calls[2][0]).toContain("/api/species?search=sabia");

    fireEvent.click(screen.getByRole("radio", { name: /Sabiá-laranjeira/ }));
    expect((screen.getByRole("button", { name: "Confirmar espécie" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar espécie" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Espécie pronta para o próximo passo." })).toBeTruthy());
    expect(screen.getByText(/Sabiá-laranjeira/)).toBeTruthy();
  });

  it("shows the empty state when the search has no matches", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(speciesResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<SpeciesSelectionPage />);

    await waitFor(() => expect(screen.getByRole("radio", { name: /Sabiá-laranjeira/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Pesquisar espécie"), { target: { value: "inexistente" } });

    await waitFor(() => expect(screen.getByText("Nenhuma espécie encontrada.")).toBeTruthy());
    expect(screen.queryByRole("radio", { name: /Sabiá-laranjeira/ })).toBeNull();
  });

  it("recovers from a catalog failure with retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(speciesResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<SpeciesSelectionPage />);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("indisponível"));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Sabiá-laranjeira/ })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows the blocked catalog state when the API returns forbidden", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SpeciesSelectionPage />);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("não tem permissão"));
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
