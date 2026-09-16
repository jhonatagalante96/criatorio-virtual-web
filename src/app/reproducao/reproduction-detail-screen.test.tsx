import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReproductionDetailScreen } from "./reproduction-detail-screen";

const authState = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue({ ok: true }),
  session: { email: "owner@example.com", emailConfirmed: true, userId: "user-id" },
  status: "authenticated"
}));

vi.mock("../../lib/auth/auth-context", () => ({
  useAuth: () => authState
}));

afterEach(() => {
  cleanup();
  authState.status = "authenticated";
  authState.refresh.mockClear();
  vi.unstubAllGlobals();
});

function selectedFarmResponse(selectedBreedingFarmId: string | null = "farm-a"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-a", isSelected: selectedBreedingFarmId === "farm-a", name: "Criatório Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function detailsResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    breedingFarmId: "farm-a",
    createdAtUtc: "2026-09-10T12:00:00Z",
    endDate: null,
    femaleBird: { birthDate: null, birdId: "bird-female", name: "Brisa na origem", ringNumber: "234567", sex: "Female", status: "Active" },
    maleBird: { birthDate: "2021-06-15", birdId: "bird-male", name: "Aurora na origem", ringNumber: "123456", sex: "Male", status: "Transferred" },
    notes: "Histórico mantido no criatório de origem.",
    reproductionId: "reproduction-a",
    startDate: "2026-09-05",
    status: "Active",
    updatedAtUtc: "2026-09-12T12:00:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function mutationResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    endDate: null,
    notes: "Observações atualizadas.",
    startDate: "2026-09-05",
    status: "Active",
    updatedAtUtc: "2026-09-16T12:00:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("ReproductionDetailScreen", () => {
  it("renders origin bird snapshots and never requests current bird profiles", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Detalhes da reprodução" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Aurora na origem" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Brisa na origem" })).toBeTruthy();
    expect(screen.getByText("Transferida")).toBeTruthy();
    expect(screen.getByText("Histórico mantido no criatório de origem.")).toBeTruthy();
    expect(screen.getByText(/não consulta fichas atuais de aves transferidas/i)).toBeTruthy();
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/reproductions/reproduction-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/api/birds/"))).toBe(true);
  });

  it("does not reveal whether a reproduction exists outside the selected farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 404, title: "Not Found" }), {
        headers: { "content-type": "application/problem+json" },
        status: 404
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="private-reproduction" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível consultar esta reprodução" })).toBeTruthy());
    expect(screen.getByText("Esta reprodução não existe ou não está disponível no criatório selecionado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar às reproduções" }).getAttribute("href")).toBe("/reproducao");
  });

  it("refreshes an expired session once before retrying the detail request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(detailsResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Detalhes da reprodução" })).toBeTruthy());
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("blocks detail access until the user selects a breeding farm", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(selectedFarmResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("directs the user to reselect the farm when the backend reports a stale selection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 409, title: "Conflict" }), {
        headers: { "content-type": "application/problem+json" },
        status: 409
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível consultar esta reprodução" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Selecionar criatório" }).getAttribute("href")).toBe("/onboarding/criatorio/selecionar");
  });

  it("edits an active reproduction without changing its recorded pair", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(mutationResponse({ startDate: "2026-09-03", endDate: "2026-09-07" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Editar dados" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Editar dados" }));
    expect(screen.getByText("Aurora na origem × Brisa na origem")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Data de início *"), { target: { value: "2026-09-03" } });
    fireEvent.change(screen.getByLabelText(/Data de término/), { target: { value: "2026-09-07" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Observações/ }), { target: { value: "Período revisado." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("Reprodução atualizada.")).toBeTruthy());
    expect(fetchMock.mock.calls[2][1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      maleBirdId: "bird-male",
      femaleBirdId: "bird-female",
      startDate: "2026-09-03",
      endDate: "2026-09-07",
      notes: "Período revisado."
    });
  });

  it("requires explicit confirmation before finishing and then limits actions to note correction", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(mutationResponse({ endDate: "2026-09-08", status: "Finished" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Encerrar reprodução" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Encerrar reprodução" }));
    fireEvent.change(screen.getByLabelText("Data de término *"), { target: { value: "2026-09-08" } });
    const submit = screen.getByRole("button", { name: "Confirmar encerramento" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo o encerramento desta reprodução." }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByRole("button", { name: "Corrigir observações" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Editar dados" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar reprodução" })).toBeNull();
    expect(fetchMock.mock.calls[2][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      status: "Finished",
      confirmed: true,
      endDate: "2026-09-08"
    });
  });

  it("cancels with confirmation and does not send an end date", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(mutationResponse({ status: "Cancelled" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar reprodução" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar reprodução" }));
    const submit = screen.getByRole("button", { name: "Confirmar cancelamento" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo o cancelamento desta reprodução." }));
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText("Reprodução cancelada. O histórico foi mantido.")).toBeTruthy());
    expect(fetchMock.mock.calls[2][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ status: "Cancelled", confirmed: true });
    expect(screen.getByRole("button", { name: "Corrigir observações" })).toBeTruthy();
  });

  it("sends only notes when correcting a terminal reproduction", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse({ status: "Finished", endDate: "2026-09-06" }))
      .mockResolvedValueOnce(mutationResponse({ endDate: "2026-09-06", status: "Finished", notes: "Correção histórica." }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Corrigir observações" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Editar dados" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encerrar reprodução" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar reprodução" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir observações" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Observações/ }), { target: { value: "Correção histórica." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar observações" }));

    await waitFor(() => expect(screen.getByText("Observações corrigidas.")).toBeTruthy());
    expect(fetchMock.mock.calls[2][1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ notes: "Correção histórica." });
  });

  it("shows a recoverable message when the backend rejects a stale status transition", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 409, title: "The reproduction status cannot be changed from its current state." }), {
        headers: { "content-type": "application/problem+json" },
        status: 409
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar reprodução" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar reprodução" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo o cancelamento desta reprodução." }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect(await screen.findByText("A reprodução foi alterada por outra solicitação. Atualize os dados antes de tentar novamente.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Atualizar reprodução" })).toBeTruthy();
  });

  it("shows server validation beside each reproduction field", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(selectedFarmResponse())
      .mockResolvedValueOnce(detailsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 400,
        title: "One or more validation errors occurred.",
        errors: { EndDate: ["End date is invalid."], Notes: ["Notes are too long."] }
      }), {
        headers: { "content-type": "application/problem+json" },
        status: 400
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReproductionDetailScreen reproductionId="reproduction-a" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Editar dados" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Editar dados" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const endDate = screen.getByLabelText(/Data de término/);
    const notes = screen.getByRole("textbox", { name: /Observações/ });
    expect(document.getElementById(endDate.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Confira a data de término informada.");
    expect(document.getElementById(notes.getAttribute("aria-describedby") ?? "")?.textContent).toBe("As observações não podem exceder 2.000 caracteres.");
  });
});
