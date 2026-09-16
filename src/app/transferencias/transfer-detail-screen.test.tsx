import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransferDetailScreen } from "./transfer-detail-screen";

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

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-b"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [
      { breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" },
      { breedingFarmId: "farm-b", isSelected: selectedBreedingFarmId === "farm-b", name: "Criatório Santos", responsibleName: "Carlos Santos" }
    ],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function details(overrides: Record<string, unknown> = {}) {
  return {
    transferRequestId: "transfer-a",
    bird: { birdId: "bird-a", name: "Canário Belga", sex: "Male", ringNumber: "123456", status: "Transferred" },
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

function detailResponse(value: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

describe("TransferDetailScreen", () => {
  it("does not request details without an authenticated session", () => {
    const fetchMock = vi.fn();
    authState.status = "unauthenticated";
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);

    expect(screen.getByRole("heading", { name: "Entre para consultar esta transferência" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows only transfer-scoped bird fields without opening a private bird profile", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailResponse(details()));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);

    await screen.findByRole("heading", { name: "Detalhes da transferência" });
    expect(screen.getByText("Canário Belga")).toBeTruthy();
    expect(screen.getByText("Anilha").parentElement?.textContent).toContain("123456");
    expect(screen.getByText("Origem").parentElement?.textContent).toContain("Criatório Aurora");
    expect(screen.getByText("Destino").parentElement?.textContent).toContain("Criatório Santos");
    expect(screen.getByText(/ficha completa da ave não é aberta/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /perfil da ave|ficha da ave/i })).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/api/birds/"))).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/internal-transfers/transfer-a");
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe("include");
  });

  it("offers acceptance only to the selected recipient for a pending transfer", async () => {
    const sourceResponse = selectedFarmResponse("farm-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sourceResponse)
      .mockResolvedValueOnce(detailResponse(details()));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);

    await screen.findByRole("heading", { name: "Detalhes da transferência" });
    expect(screen.queryByRole("button", { name: "Aceitar transferência" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rejeitar transferência" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar transferência" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Aguardando decisão do criatório de destino");
  });

  it("offers rejection only to the selected recipient for a pending transfer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse("farm-b"))
      .mockResolvedValueOnce(detailResponse(details()));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);

    await screen.findByRole("heading", { name: "Detalhes da transferência" });
    expect(screen.getByRole("button", { name: "Aceitar transferência" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rejeitar transferência" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar transferência" })).toBeNull();
  });

  it.each([
    {
      action: "reject" as const,
      selectedFarmId: "farm-b",
      confirmation: "Confirmar rejeição",
      group: "Confirmar rejeição da transferência",
      progress: "Rejeitando…",
      resultStatus: "Rejected",
      notice: "A transferência foi rejeitada",
      otherAction: "Cancelar transferência"
    },
    {
      action: "cancel" as const,
      selectedFarmId: "farm-a",
      confirmation: "Confirmar cancelamento",
      group: "Confirmar cancelamento da transferência",
      progress: "Cancelando…",
      resultStatus: "Cancelled",
      notice: "A transferência foi cancelada",
      otherAction: "Rejeitar transferência"
    }
  ])("confirms and submits $action with antiforgery protection, then reloads the updated state", async ({ action, selectedFarmId, confirmation, group, resultStatus, notice, otherAction }) => {
    const updatedDetails = details({ status: resultStatus, bird: { birdId: "bird-a", name: "Canário Belga", sex: "Male", ringNumber: "123456", status: "Active" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse(selectedFarmId))
      .mockResolvedValueOnce(detailResponse(details()))
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-test" }, status: 200 }))
      .mockResolvedValueOnce(detailResponse({ transferRequestId: "transfer-a", birdId: "bird-a", sourceBreedingFarmId: "farm-a", destinationBreedingFarmId: "farm-b", status: resultStatus, createdAtUtc: "2026-09-10T12:00:00Z", updatedAtUtc: "2026-09-10T12:10:00Z" }))
      .mockResolvedValueOnce(detailResponse(updatedDetails));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);
    fireEvent.click(await screen.findByRole("button", { name: action === "reject" ? "Rejeitar transferência" : "Cancelar transferência" }));
    expect(screen.getByRole("group", { name: group })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: confirmation }));
    await screen.findByText(new RegExp(notice));

    const actionCall = fetchMock.mock.calls[3];
    expect(String(actionCall[0])).toContain(`/api/internal-transfers/transfer-a/${action}`);
    expect(actionCall[1]?.method).toBe("POST");
    expect(new Headers(actionCall[1]?.headers).get("X-XSRF-TOKEN")).toBe("csrf-test");
    expect(actionCall[1]?.credentials).toBe("include");
    expect(String(fetchMock.mock.calls[4][0])).toContain("/api/internal-transfers/transfer-a");
    expect(screen.getByText(action === "reject" ? "Rejeitada" : "Cancelada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rejeitar transferência" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar transferência" })).toBeNull();
    expect(screen.queryByRole("button", { name: otherAction })).toBeNull();
  });

  it("requires confirmation and posts acceptance with an antiforgery token", async () => {
    const accepted = details({ status: "Accepted", bird: { birdId: "bird-a", name: "Canário Belga", sex: "Male", ringNumber: "123456", status: "Active" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailResponse(details()))
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-test" }, status: 200 }))
      .mockResolvedValueOnce(detailResponse({ transferRequestId: "transfer-a", birdId: "bird-a", sourceBreedingFarmId: "farm-a", destinationBreedingFarmId: "farm-b", status: "Accepted", createdAtUtc: "2026-09-10T12:00:00Z", updatedAtUtc: "2026-09-10T12:10:00Z" }))
      .mockResolvedValueOnce(detailResponse(accepted));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar transferência" }));
    expect(screen.getByRole("group", { name: "Confirmar aceite da transferência" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aceite" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("A transferência foi aceita"));

    const acceptCall = fetchMock.mock.calls[3];
    expect(String(acceptCall[0])).toContain("/api/internal-transfers/transfer-a/accept");
    expect(acceptCall[1]?.method).toBe("POST");
    expect(new Headers(acceptCall[1]?.headers).get("X-XSRF-TOKEN")).toBe("csrf-test");
    expect(acceptCall[1]?.credentials).toBe("include");
    expect(screen.getByText("Concluída")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar transferência" })).toBeNull();
  });

  it("handles a stale transfer state and reloads the authorized detail", async () => {
    const accepted = details({ status: "Accepted", bird: { birdId: "bird-a", name: "Canário Belga", sex: "Male", ringNumber: "123456", status: "Active" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailResponse(details()))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "X-XSRF-TOKEN": "csrf-test" } }))
      .mockResolvedValueOnce(detailResponse({ title: "The internal transfer is no longer pending." }, 409))
      .mockResolvedValueOnce(detailResponse(accepted));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar transferência" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aceite" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("A situação da transferência mudou"));
    expect(String(fetchMock.mock.calls[4][0])).toContain("/api/internal-transfers/transfer-a");
    expect(screen.getByText("Concluída")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar transferência" })).toBeNull();
  });

  it("refreshes a concurrently rejected transfer and removes its stale actions", async () => {
    const rejected = details({ status: "Rejected", bird: { birdId: "bird-a", name: "Canário Belga", sex: "Male", ringNumber: "123456", status: "Active" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse("farm-b"))
      .mockResolvedValueOnce(detailResponse(details()))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "X-XSRF-TOKEN": "csrf-test" } }))
      .mockResolvedValueOnce(detailResponse({ title: "The internal transfer is no longer pending." }, 409))
      .mockResolvedValueOnce(detailResponse(rejected));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Rejeitar transferência" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rejeição" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("A situação da transferência mudou");
    expect(String(fetchMock.mock.calls[4][0])).toContain("/api/internal-transfers/transfer-a");
    expect(screen.getByText("Rejeitada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rejeitar transferência" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar transferência" })).toBeNull();
  });

  it("keeps a rejected action retryable and reports a service failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse("farm-b"))
      .mockResolvedValueOnce(detailResponse(details()))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { "X-XSRF-TOKEN": "csrf-test" } }))
      .mockResolvedValueOnce(detailResponse({ title: "Service unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="transfer-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Rejeitar transferência" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rejeição" }));

    expect((await screen.findByRole("alert")).textContent).toContain("O serviço está indisponível");
    expect(screen.getByRole("group", { name: "Confirmar rejeição da transferência" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar rejeição" }).hasAttribute("disabled")).toBe(false);
  });

  it("returns to the list when the backend hides a transfer from another farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailResponse({ title: "The internal transfer was not found." }, 404));
    vi.stubGlobal("fetch", fetchMock);

    render(<TransferDetailScreen transferRequestId="foreign-transfer" />);

    await screen.findByRole("heading", { name: "Transferência não encontrada" });
    expect(screen.getByText("Esta solicitação não está disponível para o criatório selecionado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar às transferências" }).getAttribute("href")).toBe("/transferencias");
  });
});
