import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BreedingFarmEditPage from "./page";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/configuracoes/criatorio");
  window.sessionStorage.clear();
  routerReplace.mockReset();
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

function settingsResponse(overrides: Partial<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    address: {
      city: "São Paulo",
      complement: null,
      neighborhood: "Centro",
      number: "10",
      postalCode: "01001-000",
      state: "SP",
      street: "Rua das Flores"
    },
    breedingFarmId: "farm-id",
    contactEmail: "owner@example.com",
    contactPhone: "+55 11 99999-0000",
    name: "Sítio Aurora",
    officialRegistrationNumber: "REG-001",
    responsibleName: "Ana Souza",
    updatedAtUtc: "2026-09-10T20:00:00Z",
    ...overrides
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function visualIdentityResponse(identity: Record<string, unknown> | null = null): Response {
  return new Response(JSON.stringify({ breedingFarmId: "farm-id", identity }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function viaCepResponse(): Response {
  return new Response(JSON.stringify({
    bairro: "Bela Vista",
    complemento: "lado par",
    localidade: "São Paulo",
    logradouro: "Avenida Paulista",
    uf: "SP"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function selectionResponse(selectedBreedingFarmId: string | null = "farm-id"): Response {
  return new Response(JSON.stringify({
    breedingFarms: [{ breedingFarmId: "farm-id", isSelected: selectedBreedingFarmId === "farm-id", name: "Sítio Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function useFarmRoute() {
  window.history.pushState({}, "", "/configuracoes/criatorio?breedingFarmId=farm-id");
}

describe("BreedingFarmEditPage", () => {
  it("keeps the edit screen private without an authenticated session", async () => {
    useFarmRoute();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para editar seu criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks authenticated access when no farm identifier is provided", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Selecione um criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the selected farm overview in the authenticated shell", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(visualIdentityResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Meu Criatório" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Dados básicos" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Endereço" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Contato" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Editar criatório/ }).getAttribute("href")).toContain("breedingFarmId=farm-id");
    expect(screen.getAllByRole("link", { name: "Meu Criatório" }).length).toBeGreaterThan(0);
    expect(await screen.findByText("Nenhuma imagem personalizada")).toBeTruthy();
  });

  it("switches from the overview to the edit screen when the farm query changes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(visualIdentityResponse())
      .mockResolvedValueOnce(settingsResponse());
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Meu Criatório" })).toBeTruthy());
    window.history.pushState({}, "", "/configuracoes/criatorio?breedingFarmId=farm-id");
    view.rerender(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    expect(screen.getByLabelText("Nome do criatório")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("previews, confirms, uploads, and explicitly removes a visual identity", async () => {
    let uploaded = false;
    let failUploadOnce = true;
    const identity = {
      contentType: "image/png",
      contentUrl: "/api/breeding-farms/visual-identity/content",
      fileName: "logo.png",
      length: 3,
      source: "Upload",
      updatedAtUtc: "2026-09-10T20:00:00Z"
    };
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/api/auth/session")) return authenticatedSession();
      if (url.pathname.endsWith("/api/breeding-farms")) return selectionResponse();
      if (url.pathname.endsWith("/api/breeding-farms/farm-id/settings")) return settingsResponse();
      if (url.pathname.endsWith("/antiforgery/token")) return antiforgeryResponse();
      if (url.pathname.endsWith("/api/breeding-farms/visual-identity/content")) return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 });
      if (url.pathname.endsWith("/api/breeding-farms/visual-identity") && init?.method === "PUT") {
        if (failUploadOnce) {
          failUploadOnce = false;
          return new Response(JSON.stringify({ status: 503, title: "Storage unavailable" }), {
            headers: { "content-type": "application/problem+json" },
            status: 503
          });
        }
        uploaded = true;
        return visualIdentityResponse(identity);
      }
      if (url.pathname.endsWith("/api/breeding-farms/visual-identity") && init?.method === "DELETE") {
        uploaded = false;
        return visualIdentityResponse();
      }
      if (url.pathname.endsWith("/api/breeding-farms/visual-identity")) return visualIdentityResponse(uploaded ? identity : null);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const TestURL = class extends URL {};
    vi.stubGlobal("URL", Object.assign(TestURL, {
      createObjectURL: vi.fn(() => "blob:visual-identity-preview"),
      revokeObjectURL: vi.fn()
    }));
    render(<BreedingFarmEditPage />);

    await screen.findByText("Nenhuma imagem personalizada");
    const image = new File(["png"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Enviar minha imagem"), { target: { files: [image] } });
    expect(await screen.findByRole("img", { name: "Prévia de logo.png" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar identidade" }));
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === "PUT")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));
    expect(await screen.findByText("O armazenamento está indisponível no momento. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar aplicação" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    expect(await screen.findByText("Imagem enviada")).toBeTruthy();
    expect(await screen.findByRole("img", { name: "Identidade visual atual do Sítio Aurora" })).toBeTruthy();
    const uploadCall = fetchMock.mock.calls.find(([, options]) => (options as RequestInit | undefined)?.method === "PUT");
    expect(uploadCall).toBeTruthy();
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
    expect(new Headers((uploadCall?.[1] as RequestInit).headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(new Headers((uploadCall?.[1] as RequestInit).headers).get("content-type")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remover imagem" }));
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
    expect(await screen.findByText("Nenhuma imagem personalizada")).toBeTruthy();
    expect(await screen.findByText("Identidade visual removida. O símbolo padrão será usado.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === "DELETE")).toBe(true);
  });

  it("rejects unsupported images before creating an application preview", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(selectionResponse())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(visualIdentityResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await screen.findByText("Nenhuma imagem personalizada");
    fireEvent.change(screen.getByLabelText("Enviar minha imagem"), {
      target: { files: [new File(["text"], "logo.gif", { type: "image/gif" })] }
    });

    expect(await screen.findByText("Escolha uma imagem PNG ou JPEG com extensão compatível.")).toBeTruthy();
    expect(screen.queryByText("Prévia da nova identidade")).toBeNull();
    fireEvent.change(screen.getByLabelText("Enviar minha imagem"), {
      target: { files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "logo.png", { type: "image/png" })] }
    });
    expect(await screen.findByText("A imagem deve ter no máximo 10 MB.")).toBeTruthy();
  });

  it("offers retry after the current identity request fails", async () => {
    let identityRequests = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/api/auth/session")) return authenticatedSession();
      if (path.endsWith("/api/breeding-farms/farm-id/settings")) return settingsResponse();
      if (path.endsWith("/api/breeding-farms/visual-identity")) {
        identityRequests += 1;
        return identityRequests === 1 ? new Response(null, { status: 503 }) : visualIdentityResponse();
      }
      if (path.endsWith("/api/breeding-farms")) return selectionResponse();
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(identityRequests).toBe(1));
    expect(screen.queryByRole("alert")?.textContent).toBe("O armazenamento está indisponível no momento. Tente novamente em instantes.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma imagem personalizada")).toBeTruthy();
  });

  it("loads the selected farm settings into an editable form", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora");
    expect((screen.getByLabelText("Nome do responsável") as HTMLInputElement).value).toBe("Ana Souza");
    expect((screen.getByLabelText("Endereço") as HTMLInputElement).value).toBe("Rua das Flores");
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeTruthy();
  });

  it("fills the address after changing the CEP", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(viaCepResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("CEP"), { target: { value: "01001001" } });

    await waitFor(() => {
      expect((screen.getByLabelText("Endereço") as HTMLInputElement).value).toBe("Avenida Paulista");
      expect((screen.getByLabelText("Endereço") as HTMLInputElement).disabled).toBe(false);
    });
    expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("São Paulo");
    expect((screen.getByLabelText("UF") as HTMLInputElement).value).toBe("SP");
    expect(screen.getByText("Endereço preenchido automaticamente.", { exact: false })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("updates settings with the contract payload and shows confirmation", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(settingsResponse({
        address: {
          city: "Rio de Janeiro",
          complement: "Casa 2",
          neighborhood: "Centro",
          number: "20",
          postalCode: "98765432",
          state: "RJ",
          street: "Avenida B"
        },
        name: "Sítio Aurora Atualizado",
        responsibleName: "Nova Responsável"
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: " Sítio Aurora Atualizado " } });
    fireEvent.change(screen.getByLabelText("Nome do responsável"), { target: { value: " Nova Responsável " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("Dados do criatório atualizados com sucesso.", { exact: true })).toBeTruthy());
    expect(routerReplace).toHaveBeenCalledWith("/configuracoes/criatorio");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, updateRequest] = fetchMock.mock.calls[3];
    expect(new Headers(updateRequest.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(updateRequest.body as string)).toEqual({
      address: {
        city: "São Paulo",
        complement: null,
        neighborhood: "Centro",
        number: "10",
        postalCode: "01001-000",
        state: "SP",
        street: "Rua das Flores"
      },
      contactEmail: "owner@example.com",
      contactPhone: "+55 11 99999-0000",
      name: "Sítio Aurora Atualizado",
      officialRegistrationNumber: "REG-001",
      responsibleName: "Nova Responsável"
    });
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora Atualizado");
  });

  it("validates required fields before making an update request", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(screen.getByText("Informe o nome do criatório.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps API validation errors while preserving the edited form", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: { name: ["The name is invalid."], "Address.State": ["The state is invalid."] },
        title: "Raw API title"
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Confira os dados informados"));
    expect(screen.getByText("Confira o nome do criatório.")).toBeTruthy();
    expect(screen.getByText("Informe a UF com duas letras.")).toBeTruthy();
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Aurora");
  });

  it("shows a recoverable conflict without discarding the official registration", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "The official registration number is already in use." }), {
        headers: { "content-type": "application/problem+json" },
        status: 409
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("já está em uso"));
    expect((screen.getByLabelText("Registro oficial (opcional)") as HTMLInputElement).value).toBe("REG-001");
  });

  it("ends the private flow when the update session expires", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre para editar seu criatório" })).toBeTruthy());
    expect(screen.queryByLabelText("Nome do criatório")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("preserves the form after a network failure", async () => {
    useFarmRoute();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(settingsResponse())
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmEditPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Editar criatório" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nome do criatório"), { target: { value: "Sítio Preservado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Verifique sua conexão"));
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Sítio Preservado");
  });
});
