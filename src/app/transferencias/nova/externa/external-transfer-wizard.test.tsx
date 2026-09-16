import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalTransferWizard } from "./external-transfer-wizard";

const refresh = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("../../../../lib/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ refresh, session: { email: "owner@example.com" }, status: "authenticated" })
}));

vi.mock("../../../components/authenticated-shell", () => ({
  AuthenticatedShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  window.history.pushState({}, "", "/transferencias/nova/externa");
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

function selectedFarmResponse(): Response {
  return jsonResponse({
    breedingFarms: [{ breedingFarmId: "farm-source", isSelected: true, name: "Criatório Aurora" }],
    selectedBreedingFarmId: "farm-source"
  });
}

function bird(): Record<string, unknown> {
  return {
    ageInYears: 4,
    birthDate: "2022-04-01",
    birdId: "bird-aurora",
    identificationPending: false,
    imageUrl: null,
    name: "Aurora",
    ringNumber: "123456",
    sex: "Female",
    speciesPopularName: "Canário-do-reino",
    status: "Active"
  };
}

function birdListResponse(items: unknown[] = [bird()]): Response {
  return jsonResponse({ items, page: 1, pageSize: 10, totalCount: items.length, totalPages: items.length ? 1 : 0 });
}

function eligibilityResponse(isEligible = true): Response {
  return jsonResponse({
    birdId: "bird-aurora",
    identificationPending: !isEligible,
    isEligible,
    issues: isEligible ? [] : [{ code: "MissingRingNumber", message: "Anilha inválida." }]
  });
}

function completedExternalTransferResponse(): Response {
  return jsonResponse({
    externalTransferId: "external-transfer-a",
    birdId: "bird-aurora",
    breedingFarmId: "farm-source",
    recipientName: "Joana Externa",
    notes: "Entrega agendada",
    status: "Transferred",
    completedAtUtc: "2026-09-16T12:00:00Z"
  }, 201);
}

function apiFetch(options: { eligibility?: boolean; postResponse?: Response; birdsResponse?: Response } = {}): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/breeding-farms")) return selectedFarmResponse();
    if (url.pathname.endsWith("/api/birds") && init?.method !== "POST") return options.birdsResponse ?? birdListResponse();
    if (url.pathname.endsWith("/api/birds/bird-aurora/eligibility")) return eligibilityResponse(options.eligibility ?? true);
    if (url.pathname.endsWith("/antiforgery/token")) return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
    if (url.pathname.endsWith("/api/external-transfers") && init?.method === "POST") return options.postResponse ?? completedExternalTransferResponse();
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url.pathname}`);
  });
}

async function selectBird(fetchMock: ReturnType<typeof apiFetch>, isEligible = true) {
  render(<ExternalTransferWizard />);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione a ave" })).toBeTruthy());

  fireEvent.change(screen.getByLabelText("Buscar por nome, anilha ou espécie"), { target: { value: "Au" } });
  await waitFor(() => expect(screen.getByRole("button", { name: /Aurora/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Aurora/ }));
  await waitFor(() => expect(screen.getByText(isEligible
    ? /critérios para transferência externa/
    : "Esta ave não pode ser transferida agora.")).toBeTruthy());
  return fetchMock;
}

async function fillRecipientAndReview() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Informe os dados da transferência" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/Nome do recebedor/), { target: { value: "  Joana Externa  " } });
  fireEvent.change(screen.getByLabelText(/Observações/), { target: { value: "  Entrega agendada  " } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Revise e confirme" })).toBeTruthy());
}

describe("ExternalTransferWizard", () => {
  it("validates the bird, reviews the recipient details, and completes the confirmed transfer", async () => {
    const fetchMock = apiFetch();
    vi.stubGlobal("fetch", fetchMock);

    await selectBird(fetchMock);
    await fillRecipientAndReview();
    expect(screen.queryByLabelText(/e-mail|telefone/i)).toBeNull();
    fireEvent.click(screen.getByLabelText("Confirmo que desejo concluir a transferência externa desta ave."));
    fireEvent.click(screen.getByRole("button", { name: "Concluir transferência" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "A transferência foi concluída" })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    expect(postCall).toBeTruthy();
    expect(String(postCall?.[0])).toContain("/api/external-transfers");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      birdId: "bird-aurora",
      recipientName: "Joana Externa",
      notes: "Entrega agendada",
      confirmed: true
    });
    expect(new Headers(postCall?.[1]?.headers).get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(screen.getByText("external-transfer-a")).toBeTruthy();
    expect(screen.getByText("Transferida")).toBeTruthy();
  });

  it("blocks an ineligible bird before allowing the user to enter recipient details", async () => {
    const fetchMock = apiFetch({ eligibility: false });
    vi.stubGlobal("fetch", fetchMock);

    await selectBird(fetchMock, false);
    expect(screen.getByRole("button", { name: "Continuar" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("A ave precisa ter uma anilha válida de seis dígitos.")).toBeTruthy();
  });

  it("shows the empty state when no active bird matches the search", async () => {
    const fetchMock = apiFetch({ birdsResponse: birdListResponse([]) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ExternalTransferWizard />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione a ave" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Buscar por nome, anilha ou espécie"), { target: { value: "xx" } });
    await waitFor(() => expect(screen.getByText("Nenhuma ave ativa corresponde à busca.")).toBeTruthy());
  });

  it("explains a pending internal transfer conflict and keeps the review available", async () => {
    const fetchMock = apiFetch({ postResponse: jsonResponse({ status: 409, title: "The bird has a pending internal transfer." }, 409) });
    vi.stubGlobal("fetch", fetchMock);

    await selectBird(fetchMock);
    await fillRecipientAndReview();
    fireEvent.click(screen.getByLabelText("Confirmo que desejo concluir a transferência externa desta ave."));
    fireEvent.click(screen.getByRole("button", { name: "Concluir transferência" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("transferência interna pendente"));
    expect(screen.getByRole("heading", { name: "Revise e confirme" })).toBeTruthy();
  });
});
