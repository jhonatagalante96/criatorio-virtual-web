import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransferListScreen } from "./transfer-list-screen";

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

beforeEach(() => {
  authState.status = "authenticated";
});

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    transferRequestId: "transfer-a",
    birdId: "bird-a",
    birdName: "Canário Belga",
    ringNumber: "123456",
    sourceBreedingFarmId: "farm-a",
    sourceBreedingFarmName: "Criatório Aurora",
    destinationBreedingFarmId: "farm-b",
    destinationBreedingFarmName: "Criatório Santos",
    status: "Pending",
    createdAtUtc: "2026-09-10T12:00:00Z",
    updatedAtUtc: "2026-09-10T12:00:00Z",
    ...overrides
  };
}

function listResponse(items: Record<string, unknown>[], overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    direction: "Received",
    breedingFarmId: "farm-a",
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: 1,
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function birdDetailsResponse(imageUrl: string | null): Response {
  return new Response(JSON.stringify({ imageUrl }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("TransferListScreen", () => {
  it("does not request transfer data without an authenticated session", () => {
    const fetchMock = vi.fn();
    authState.status = "unauthenticated";
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);

    expect(screen.getByRole("heading", { name: "Entre para consultar as transferências" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks the list until the user selects a breeding farm", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads the received list with its scoped bird summary and no private bird request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([transfer()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);

    const detailLink = await screen.findByRole("link", { name: "Ver detalhes da transferência de Canário Belga" });
    expect(detailLink.getAttribute("href")).toBe("/transferencias/transfer-a");
    fireEvent.click(screen.getByText("Nova transferência"));
    expect(screen.getByRole("link", { name: "Transferência interna" }).getAttribute("href")).toBe("/transferencias/nova");
    expect(screen.getByRole("link", { name: "Transferência externa" }).getAttribute("href")).toBe("/transferencias/nova/externa");
    expect(screen.getByText("Origem: Criatório Aurora")).toBeTruthy();
    expect(screen.getByText(/Anilha 123456/)).toBeTruthy();
    expect(screen.getByText("Pendente")).toBeTruthy();
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/internal-transfers/received?page=1&pageSize=20");
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/api/birds/"))).toBe(true);
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe("include");
  });

  it("shows a source-owned bird photo for sent transfers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(listResponse([transfer()], { direction: "Sent" }))
      .mockResolvedValueOnce(birdDetailsResponse("/api/birds/bird-a/attachments/photo-a/content"));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);
    await screen.findByRole("tab", { name: "Enviadas" });
    fireEvent.click(screen.getByRole("tab", { name: "Enviadas" }));

    await waitFor(() => {
      const image = document.querySelector<HTMLImageElement>(".transfer-history-bird-photo");
      expect(image?.getAttribute("src")).toContain("/api/birds/bird-a/attachments/photo-a/content");
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/birds/bird-a"))).toBe(true);
  });

  it("supports arrow-key navigation between linked direction tabs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(listResponse([], { direction: "Sent" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);
    const receivedTab = await screen.findByRole("tab", { name: "Recebidas" });
    const sentTab = screen.getByRole("tab", { name: "Enviadas" });
    const panel = screen.getByRole("tabpanel");

    expect(receivedTab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(receivedTab.id);
    fireEvent.keyDown(receivedTab, { key: "ArrowRight" });

    await waitFor(() => expect(String(fetchMock.mock.calls[2][0])).toContain("/api/internal-transfers/sent?"));
    expect(document.activeElement).toBe(sentTab);
    expect(sentTab.getAttribute("aria-selected")).toBe("true");
    expect(sentTab.getAttribute("tabindex")).toBe("0");
  });

  it("applies status filters, preserves them while paging, and loads sent requests separately", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([transfer()], { totalCount: 25, totalPages: 2 }))
      .mockResolvedValueOnce(listResponse([transfer({ status: "Accepted" })], { totalCount: 21, totalPages: 2 }))
      .mockResolvedValueOnce(listResponse([transfer({ status: "Accepted" })], { page: 2, totalCount: 21, totalPages: 2 }))
      .mockResolvedValueOnce(listResponse([transfer({ status: "Cancelled" })], { direction: "Sent" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);
    await screen.findByRole("link", { name: "Ver detalhes da transferência de Canário Belga" });
    fireEvent.change(screen.getByLabelText("Filtrar por situação"), { target: { value: "Accepted" } });
    await waitFor(() => expect(String(fetchMock.mock.calls[2][0])).toContain("status=Accepted"));
    expect(screen.getByText("Concluída")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(String(fetchMock.mock.calls[3][0])).toContain("page=2&pageSize=20&status=Accepted"));
    expect(screen.getByText("Página 2 de 2 · 21 solicitações")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Enviadas" }));
    await waitFor(() => expect(String(fetchMock.mock.calls[4][0])).toContain("/api/internal-transfers/sent?page=1&pageSize=20&status=Accepted"));
    expect(screen.getByText("Transferências enviadas")).toBeTruthy();
  });

  it("shows a contextual empty state and can clear a filter", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(listResponse([], { totalCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);
    await screen.findByText("Nenhuma transferência recebida");
    fireEvent.change(screen.getByLabelText("Filtrar por situação"), { target: { value: "Pending" } });
    await waitFor(() => expect(screen.getByText("Nenhuma transferência encontrada")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtro" }));
    await screen.findByText("Nenhuma transferência recebida");
    expect((screen.getByLabelText("Filtrar por situação") as HTMLSelectElement).value).toBe("");
  });

  it("refreshes an expired session before retrying the list request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(listResponse([transfer()]));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferListScreen />);

    await screen.findByRole("link", { name: "Ver detalhes da transferência de Canário Belga" });
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
