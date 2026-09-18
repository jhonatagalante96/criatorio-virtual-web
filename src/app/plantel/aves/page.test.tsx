import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BirdListPage from "./page";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/plantel/aves");
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

function bird(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ageInYears: 4,
    birthDate: "2021-06-15",
    birdId: "bird-a",
    identificationPending: false,
    imageUrl: "/species-images/0001.jpg",
    isDefaultImage: true,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Female",
    speciesId: "species-a",
    speciesPopularName: "Sabiá-laranjeira",
    speciesScientificName: "Turdus rufiventris",
    status: "Active",
    ...overrides
  };
}

function listResponse(items: Record<string, unknown>[], overrides: Partial<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides
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
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

function pdfResponse(): Response {
  return new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" }, status: 200 });
}

function statusResponse(status = "Deceased"): Response {
  return new Response(JSON.stringify({
    deathDate: status === "Deceased" ? "2025-02-01" : null,
    notes: status === "Deceased" ? "Falecimento registrado." : null,
    status
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

async function openList(fetchMock: ReturnType<typeof vi.fn>, waitForBird = true) {
  render(<BirdListPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Aves" })).toBeTruthy());
  if (waitForBird) {
    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy());
  } else {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
}

function listUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  return String(fetchMock.mock.calls[callIndex][0]);
}

describe("BirdListPage", () => {
  it("keeps the authenticated shell visible while the plantel session is loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<BirdListPage />);

    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Carregando plantel");
    expect(screen.queryByRole("heading", { name: "Restaurando sua sessão" })).toBeNull();
  });

  it("keeps the plantel private without an authenticated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdListPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para consultar o plantel" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Aves do criatório" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks access until a breeding farm is selected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdListPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByText("Selecione um criatório para consultar o plantel.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the selected farm plantel with pending identification feedback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([
        bird(),
        bird({ birdId: "bird-b", name: "Sem Anilha", identificationPending: true, ringNumber: null, sex: "Unknown" })
      ]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);

    expect(screen.getByRole("navigation", { name: "Módulos disponíveis" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Módulos disponíveis" })).getByRole("link", { name: "Aves" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("complementary", { name: "Resumo do plantel" }).textContent).toContain("aves cadastradas");
    expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Ave Sem Anilha" })).toBeTruthy();
    expect(screen.getByText("Identificação pendente")).toBeTruthy();
    expect(screen.getByText("2 aves encontradas")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cadastrar ave" }).getAttribute("href")).toBe("/plantel/aves/novo");
    expect(screen.getByRole("link", { name: "Abrir ficha de Aurora" }).getAttribute("href")).toBe("/plantel/aves/bird-a");

    const birdRow = screen.getByRole("article", { name: "Ave Aurora" });
    expect(birdRow.querySelector(".bird-list-card-name a")?.getAttribute("href")).toBe("/plantel/aves/bird-a");
    expect(birdRow.querySelector(".bird-list-card-arrow")?.getAttribute("href")).toBe("/plantel/aves/bird-a");
    expect(birdRow.querySelector(".bird-list-card-photo img")?.getAttribute("src")).toBe("https://localhost:58016/species-images/0001.jpg");
    expect(birdRow.querySelector(".bird-list-card-sex")?.getAttribute("aria-label")).toBe("Sexo: Fêmea");
    fireEvent.click(within(birdRow).getByRole("button", { name: "Abrir ações de Aurora" }));
    const actionMenu = birdRow.querySelector(".bird-row-actions-menu");
    if (!(actionMenu instanceof HTMLElement)) throw new Error("Menu de ações não encontrado.");
    expect(within(actionMenu).getByRole("link", { name: "Ver detalhes de Aurora" }).getAttribute("href")).toBe("/plantel/aves/bird-a");
    expect(within(actionMenu).getByRole("link", { name: "Editar Aurora" }).getAttribute("href")).toBe("/plantel/aves/bird-a/editar");
    expect(within(actionMenu).getByRole("link", { name: "Iniciar transferência" }).getAttribute("href")).toBe("/transferencias/nova?birdId=bird-a");
    expect(within(actionMenu).getByRole("link", { name: "Registrar competição para Aurora" }).getAttribute("href")).toBe("/competicoes/nova?birdId=bird-a");
    expect(within(actionMenu).getByRole("button", { name: "Inativar" }).hasAttribute("disabled")).toBe(false);
    fireEvent.pointerDown(document.body);
    expect(birdRow.querySelector(".bird-row-actions")?.hasAttribute("open")).toBe(false);
  });

  it("defaults the listing to active birds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);

    expect((document.getElementById("bird-status-filter") as HTMLSelectElement).value).toBe("Active");
    expect(listUrl(fetchMock, 2)).toContain("status=Active");
  });

  it("prefers the bird primary photo when the API does not mark the image as default", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird({
        imageUrl: "/api/birds/bird-a/attachments/photo-a/content",
        isDefaultImage: false
      })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);

    const image = screen.getByRole("article", { name: "Ave Aurora" }).querySelector(".bird-list-card-photo img");
    expect(image?.getAttribute("src")).toBe("https://localhost:58016/api/birds/bird-a/attachments/photo-a/content");
  });

  it("keeps listing actions together and renders each filter name once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);

    const actionGroup = document.querySelector(".bird-list-header-side");
    expect(actionGroup?.children).toHaveLength(2);
    expect(actionGroup?.firstElementChild?.classList.contains("bird-list-report-action")).toBe(true);
    expect(actionGroup?.lastElementChild?.classList.contains("bird-list-register-action")).toBe(true);
    expect(document.querySelectorAll(".bird-filter-mobile-label")).toHaveLength(0);
    expect(document.querySelectorAll(".bird-filter-select > .bird-filter-label")).toHaveLength(5);
  });

  it("submits a search and keeps the query represented in the URL and API request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(listResponse([bird({ name: "Aurora Filtrada" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.change(screen.getByLabelText("Buscar ave"), { target: { value: "  Aurora  " } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora Filtrada" })).toBeTruthy());
    expect(window.location.search).toBe("?search=Aurora&status=Active");
    expect(listUrl(fetchMock, 3)).toContain("search=Aurora");
  });

  it("validates a death date before submitting a status change", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    const birdRow = screen.getByRole("article", { name: "Ave Aurora" });
    fireEvent.click(within(birdRow).getByRole("button", { name: "Abrir ações de Aurora" }));
    const inactivateButton = within(birdRow).getByRole("button", { name: "Inativar" });
    expect((inactivateButton as HTMLButtonElement).disabled).toBe(false);
    expect(inactivateButton.className).toContain("is-danger");
    fireEvent.click(inactivateButton);
    fireEvent.click(screen.getByRole("radio", { name: "Registrar falecimento" }));
    fireEvent.click(screen.getByRole("checkbox"));
    const confirmButton = screen.getByRole("button", { name: "Confirmar alteração" });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    expect(confirmButton.className).toContain("is-disabled");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("changes a bird status after explicit confirmation and refreshes the list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(statusResponse())
      .mockResolvedValueOnce(listResponse([bird({ status: "Deceased" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    const birdRow = screen.getByRole("article", { name: "Ave Aurora" });
    fireEvent.click(within(birdRow).getByRole("button", { name: "Abrir ações de Aurora" }));
    fireEvent.click(within(birdRow).getByRole("button", { name: "Inativar" }));
    fireEvent.click(screen.getByRole("radio", { name: "Registrar falecimento" }));
    const confirmButton = screen.getByRole("button", { name: "Confirmar alteração" });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    expect(confirmButton.className).toContain("is-disabled");
    fireEvent.change(screen.getByLabelText("Data do falecimento (obrigatória)"), { target: { value: "2025-02-01" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect((confirmButton as HTMLButtonElement).disabled).toBe(false);
    expect(confirmButton.className).toContain("is-ready");
    fireEvent.click(confirmButton);

    expect(await screen.findByText("Alteração concluída")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" }).textContent).toContain("Falecida"));
    expect(fetchMock.mock.calls[3][0]).toContain("antiforgery/token");
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(fetchMock.mock.calls[4][1].body))).toEqual({
      confirmed: true,
      deathDate: "2025-02-01",
      notes: null,
      status: "Deceased"
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("explains when a pending transfer blocks the status change", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Bird status changes are unavailable while a transfer is pending." }), { headers: { "content-type": "application/problem+json" }, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    const birdRow = screen.getByRole("article", { name: "Ave Aurora" });
    fireEvent.click(within(birdRow).getByRole("button", { name: "Abrir ações de Aurora" }));
    fireEvent.click(within(birdRow).getByRole("button", { name: "Inativar" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar alteração" }));

    expect((await screen.findByRole("alert")).textContent).toContain("transferência pendente");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("applies status and identification filters without exposing another tenant", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(listResponse([bird({ status: "Archived", name: "Ave Arquivada" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(document.getElementById("bird-status-filter") as HTMLSelectElement, { target: { value: "Archived" } });

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave Arquivada" })).toBeTruthy());
    expect(window.location.search).toContain("status=Archived");
    expect(listUrl(fetchMock, 3)).toContain("status=Archived");
    expect(screen.queryByText("Outra conta")).toBeNull();
  });

  it("filters by species through the catalog and includes the selected species in the URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(listResponse([bird({ name: "Ave da Espécie" })]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Espécie" }), { target: { value: "sa" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Sabiá-laranjeira/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /Sabiá-laranjeira/ }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave da Espécie" })).toBeTruthy());
    expect(window.location.search).toContain("speciesId=species-a");
    expect(window.location.search).toContain("speciesName=Sabi%C3%A1-laranjeira");
    expect(listUrl(fetchMock, 4)).toContain("speciesId=species-a");
  });

  it("closes the species options when the user clicks outside the filter", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(speciesResponse());
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Espécie" }), { target: { value: "sa" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Sabiá-laranjeira/ })).toBeTruthy());

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole("option", { name: /Sabiá-laranjeira/ })).toBeNull());
    expect((screen.getByRole("searchbox", { name: "Espécie" }) as HTMLInputElement).value).toBe("");
  });

  it("explains when the species catalog is forbidden", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Forbidden" }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByText("Filtros e ordenação"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Espécie" }), { target: { value: "sa" } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("não tem permissão"));
  });

  it("shows a recoverable empty state and restores the list after clearing filters", async () => {
    window.history.pushState({}, "", "/plantel/aves?search=inexistente");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirdListPage />);
    await waitFor(() => expect(screen.getByText("Nenhuma ave encontrada")).toBeTruthy());
    const emptyState = screen.getByText("Nenhuma ave encontrada").parentElement;
    if (!emptyState) throw new Error("Estado vazio não encontrado.");
    fireEvent.click(within(emptyState).getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy());
    expect(window.location.search).toBe("?status=Active");
    expect(listUrl(fetchMock, 3)).not.toContain("search=");
  });

  it("opens a temporary PDF preview with the active report filters and offers the same file for download", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(listResponse([bird({ status: "Deceased" })]))
      .mockResolvedValueOnce(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:birds-report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL, writable: true });

    try {
      await openList(fetchMock);
      fireEvent.change(document.getElementById("bird-status-filter") as HTMLSelectElement, { target: { value: "Deceased" } });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
      expect(screen.getByRole("dialog", { name: "Prévia do relatório de aves" })).toBeTruthy();
      expect(screen.getByText("Falecidas")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Gerar prévia do relatório" }));

      await waitFor(() => expect(screen.getByTitle("Prévia do relatório de aves cadastradas")).toBeTruthy());
      expect(listUrl(fetchMock, 4)).toContain("/api/reports/birds/pdf?status=Deceased");
      expect(screen.getByRole("link", { name: "Baixar relatório" }).getAttribute("href")).toBe("blob:birds-report");
      expect(screen.getByRole("link", { name: "Baixar relatório" }).getAttribute("download")).toBe("relatorio-aves-cadastradas.pdf");

      fireEvent.click(screen.getByRole("button", { name: "Fechar prévia" }));
      expect(screen.queryByRole("dialog", { name: "Prévia do relatório de aves" })).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:birds-report");
    } finally {
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL, writable: true });
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL, writable: true });
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });

  it("opens the PDF preview in a new tab on mobile browsers", async () => {
    const mediaQuery = {
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(pdfResponse());
    vi.stubGlobal("fetch", fetchMock);

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:birds-report-mobile");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL, writable: true });

    try {
      await openList(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
      fireEvent.click(screen.getByRole("button", { name: "Gerar prévia do relatório" }));

      await waitFor(() => expect(screen.getByRole("link", { name: "Abrir prévia do PDF" })).toBeTruthy());
      expect(screen.queryByTitle("Prévia do relatório de aves cadastradas")).toBeNull();
      const previewLink = screen.getByRole("link", { name: "Abrir prévia do PDF" });
      expect(previewLink.getAttribute("href")).toBe("blob:birds-report-mobile");
      expect(previewLink.getAttribute("target")).toBe("_blank");
      expect(previewLink.getAttribute("rel")).toContain("noreferrer");
      expect(screen.getByRole("link", { name: "Baixar relatório" }).getAttribute("href")).toBe("blob:birds-report-mobile");
      fireEvent.click(screen.getByRole("button", { name: "Fechar prévia" }));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:birds-report-mobile");
    } finally {
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL, writable: true });
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL, writable: true });
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });

  it("shows a permission error when the report PDF is forbidden", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()]))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar prévia do relatório" }));

    expect((await screen.findByRole("alert")).textContent).toContain("não tem permissão");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("paginates through the API result and represents the current page in the URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([bird()], { totalCount: 21, totalPages: 2 }))
      .mockResolvedValueOnce(listResponse([bird({ birdId: "bird-b", name: "Segunda Página" })], { page: 2, totalCount: 21, totalPages: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Segunda Página" })).toBeTruthy());
    expect(window.location.search).toBe("?status=Active&page=2");
    expect(listUrl(fetchMock, 3)).toContain("page=2");
    expect(screen.getByRole("button", { name: "Página anterior" }).hasAttribute("disabled")).toBe(false);
  });

  it("offers mobile load more only when more than five birds are available", async () => {
    const mediaQuery = {
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
    const birds = Array.from({ length: 6 }, (_, index) => bird({
      birdId: `bird-${index}`,
      name: `Ave ${index + 1}`
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse(birds));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock, false);

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave 5" })).toBeTruthy());
    expect(screen.queryByRole("article", { name: "Ave Ave 6" })).toBeNull();
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Ave 6" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(screen.getByText("Mostrando 6 de 6 aves")).toBeTruthy();
  });

  it("shows a retry state when the listing request fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Service unavailable" }), { headers: { "content-type": "application/problem+json" }, status: 503 }))
      .mockResolvedValueOnce(listResponse([bird()]));
    vi.stubGlobal("fetch", fetchMock);

    await openList(fetchMock, false);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("serviço está indisponível"));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByRole("article", { name: "Ave Aurora" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
