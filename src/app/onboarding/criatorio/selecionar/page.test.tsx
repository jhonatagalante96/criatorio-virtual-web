import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BreedingFarmSelectionPage from "./page";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));

const urlDescriptors = {
  createObjectURL: Object.getOwnPropertyDescriptor(URL, "createObjectURL"),
  revokeObjectURL: Object.getOwnPropertyDescriptor(URL, "revokeObjectURL")
};

afterEach(() => {
  cleanup();
  if (urlDescriptors.createObjectURL) Object.defineProperty(URL, "createObjectURL", urlDescriptors.createObjectURL);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (urlDescriptors.revokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", urlDescriptors.revokeObjectURL);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
  window.history.replaceState({}, "", "/");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  routerReplace.mockReset();
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

function visualIdentityResponse(identity: Record<string, unknown> | null = null): Response {
  return new Response(JSON.stringify({ breedingFarmId: "farm-a", identity }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
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
    expect(screen.getByRole("link", { name: "Ir para o painel" }).getAttribute("href")).toBe("/dashboard");
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

  it("opens the optional identity step after selecting the newly created farm", async () => {
    window.history.replaceState({}, "", "/onboarding/criatorio/selecionar?identityFarmId=farm-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(singleSelectionResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(singleSelectionResponse("farm-a"))
      .mockResolvedValueOnce(visualIdentityResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Escolha onde continuar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com este criatório" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Identidade do criatório" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Alterar imagem do criatório" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Configurar depois e ir para o painel" }).getAttribute("href")).toBe("/dashboard");
    const [, selectionRequest] = fetchMock.mock.calls[3];
    expect(new Headers(selectionRequest.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(selectionRequest.body as string)).toEqual({ breedingFarmId: "farm-a" });
  });

  it("resumes the identity step for the persisted farm without reapplying an existing identity", async () => {
    window.history.replaceState({}, "", "/onboarding/criatorio/selecionar?identityFarmId=farm-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(singleSelectionResponse("farm-a"))
      .mockResolvedValueOnce(visualIdentityResponse({
        contentType: null,
        contentUrl: null,
        fileName: null,
        length: null,
        modelId: "natural",
        source: "Template",
        updatedAtUtc: "2026-09-17T00:00:00Z",
        version: "1"
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Identidade do criatório" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Alterar imagem do criatório" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Configurar depois e ir para o painel" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, request]) => request.method === "PUT")).toBe(false);
  });

  it("advances to the dashboard after the identity upload succeeds", async () => {
    window.history.replaceState({}, "", "/onboarding/criatorio/selecionar?identityFarmId=farm-a");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:identity-preview", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(singleSelectionResponse("farm-a"))
      .mockResolvedValueOnce(visualIdentityResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(visualIdentityResponse())
      .mockResolvedValueOnce(visualIdentityResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Identidade do criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Alterar imagem do criatório" }));
    fireEvent.change(screen.getByLabelText("Enviar minha imagem"), {
      target: { files: [new File(["image"], "criatorio.png", { type: "image/png" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    const applyRequest = fetchMock.mock.calls.find(([, request]) => request.method === "PUT");
    expect(applyRequest).toBeTruthy();
    expect(new Headers(applyRequest![1].headers).get("x-xsrf-token")).toBe("csrf-token");
  });

  it("advances to the dashboard after a visual identity template is applied", async () => {
    window.history.replaceState({}, "", "/onboarding/criatorio/selecionar?identityFarmId=farm-a");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:identity-template-preview", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(singleSelectionResponse("farm-a"))
      .mockResolvedValueOnce(visualIdentityResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        aspectRatio: "1:1",
        id: "natural",
        name: "Natural",
        options: [],
        previewUrl: "/api/templates/natural/preview",
        version: "1"
      }]), { headers: { "content-type": "application/json" }, status: 200 }))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(new Blob(["preview"]), { headers: { "content-type": "image/png" }, status: 200 }))
      .mockResolvedValueOnce(visualIdentityResponse())
      .mockResolvedValueOnce(visualIdentityResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Identidade do criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Alterar imagem do criatório" }));
    fireEvent.click(screen.getByRole("button", { name: /Escolher um modelo/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Natural/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar prévia" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar modelo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação do modelo" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    const applyRequest = fetchMock.mock.calls.find(([, request]) => request.method === "PUT");
    expect(applyRequest).toBeTruthy();
    expect(new Headers(applyRequest![1].headers).get("x-xsrf-token")).toBe("csrf-token");
  });

  it("does not advance when the identity upload is rejected", async () => {
    window.history.replaceState({}, "", "/onboarding/criatorio/selecionar?identityFarmId=farm-a");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:identity-preview", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(singleSelectionResponse("farm-a"))
      .mockResolvedValueOnce(visualIdentityResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmSelectionPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Identidade do criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Alterar imagem do criatório" }));
    fireEvent.change(screen.getByLabelText("Enviar minha imagem"), {
      target: { files: [new File(["image"], "criatorio.png", { type: "image/png" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("não tem permissão"));
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Identidade do criatório" })).toBeTruthy();
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
