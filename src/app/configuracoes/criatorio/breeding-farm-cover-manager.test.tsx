import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BreedingFarmCoverManager } from "./breeding-farm-cover-manager";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("../../../lib/auth/auth-context", () => ({ useAuth: () => ({ refresh: refreshMock }) }));

const template = {
  canvas: { aspectRatio: "3:1", height: 640, width: 1920 },
  defaults: { name: "Sítio Aurora", showLogo: true, tagline: "Aves com origem" },
  id: "natureza_classica",
  name: "Natureza clássica",
  previewUrl: "/api/breeding-farm-cover-templates/natureza_classica/1/preview",
  safeArea: { description: "Área central segura", height: 0.6, width: 0.6, x: 0.2, y: 0.2 },
  supportedOptions: ["name", "tagline", "showLogo"],
  version: 1
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status: 200 });
}

function coverResponse(cover: Record<string, unknown> | null = null): Response {
  return jsonResponse({ breedingFarmId: "farm-id", cover });
}

function currentCover(): Record<string, unknown> {
  return {
    contentType: "image/png",
    contentUrl: "/api/breeding-farms/farm-id/cover/content",
    fileName: "cover.png",
    length: 20,
    source: "Template",
    templateConfiguration: { name: "Sítio Aurora" },
    templateModelId: "natureza_classica",
    templateVersion: 1,
    updatedAtUtc: "2026-09-17T12:00:00Z"
  };
}

function setupFetch(initialCover: Record<string, unknown> | null = null, templateApplyFailureStatus?: number) {
  let cover = initialCover;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/antiforgery/token")) return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
    if (url.pathname.endsWith("/api/breeding-farm-cover-templates")) return jsonResponse([template]);
    if (url.pathname.endsWith("/api/breeding-farm-cover-templates/natureza_classica/preview")) {
      return new Response(new Blob(["preview"], { type: "image/png" }), { headers: { "content-type": "image/png" }, status: 200 });
    }
    if (url.pathname.endsWith("/api/breeding-farms/farm-id/cover/content")) {
      return new Response(new Blob(["cover"], { type: "image/png" }), { headers: { "content-type": "image/png" }, status: 200 });
    }
    if (url.pathname.endsWith("/api/breeding-farms/farm-id/cover/template") && init?.method === "PUT") {
      if (templateApplyFailureStatus) {
        return new Response(JSON.stringify({ status: templateApplyFailureStatus, title: "Cover update unavailable" }), {
          headers: { "content-type": "application/problem+json" },
          status: templateApplyFailureStatus
        });
      }
      cover = currentCover();
      return coverResponse(cover);
    }
    if (url.pathname.endsWith("/api/breeding-farms/farm-id/cover/upload") && init?.method === "PUT") {
      cover = { ...currentCover(), source: "Upload", templateModelId: null, templateVersion: null };
      return coverResponse(cover);
    }
    if (url.pathname.endsWith("/api/breeding-farms/farm-id/cover") && init?.method === "DELETE") {
      cover = null;
      return coverResponse(null);
    }
    if (url.pathname.endsWith("/api/breeding-farms/farm-id/cover")) return coverResponse(cover);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshMock.mockReset();
});

describe("BreedingFarmCoverManager", () => {
  it("loads templates from the API, previews declared options, and applies only after confirmation", async () => {
    const fetchMock = setupFetch();
    const objectUrl = vi.fn(() => "blob:cover-preview");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: objectUrl, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    render(<BreedingFarmCoverManager breedingFarmId="farm-id" farmName="Criatório Galante" />);

    expect(await screen.findByAltText("Imagem padrão de capa para Criatório Galante")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Configurar capa" }));
    fireEvent.click(screen.getByRole("button", { name: /Escolher um modelo/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Natureza clássica/ }));
    expect(await screen.findByLabelText("Frase de apoio")).toBeTruthy();
    expect((screen.getByLabelText("Nome do criatório") as HTMLInputElement).value).toBe("Criatório Galante");
    expect(screen.queryByLabelText("Cor de destaque")).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) =>
      new URL(String(input)).pathname.endsWith("/natureza_classica/preview") && init?.method === "POST"
    )).toBe(true), { timeout: 3000 });

    fireEvent.change(screen.getByLabelText("Frase de apoio"), { target: { value: "Criados com cuidado" } });
    await waitFor(() => {
      const previewRequests = fetchMock.mock.calls.filter(([input, init]) => new URL(String(input)).pathname.endsWith("/natureza_classica/preview") && init?.method === "POST");
      const latestBody = JSON.parse(String(previewRequests.at(-1)?.[1]?.body));
      expect(latestBody.config.tagline).toBe("Criados com cuidado");
    }, { timeout: 3000 });

    fireEvent.click(await screen.findByRole("button", { name: "Conferir aplicação da capa" }));
    expect(await screen.findByRole("heading", { name: "Aplicar este modelo?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação do modelo" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) =>
      new URL(String(input)).pathname.endsWith("/api/breeding-farms/farm-id/cover/template") && init?.method === "PUT"
    )).toBe(true));
    const applyRequest = fetchMock.mock.calls.find(([input, init]) => new URL(String(input)).pathname.endsWith("/api/breeding-farms/farm-id/cover/template") && init?.method === "PUT");
    expect(JSON.parse(String(applyRequest?.[1]?.body))).toEqual({
      config: { name: "Criatório Galante", showLogo: true, tagline: "Criados com cuidado" },
      modelId: "natureza_classica",
      version: 1
    });
    expect(new Headers(applyRequest?.[1]?.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(await screen.findByText("Modelo de capa aplicado com sucesso.")).toBeTruthy();
  });

  it("prevalidates image format and dimensions before asking for confirmation", async () => {
    const fetchMock = setupFetch();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:cover-upload", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 900, height: 300, close: vi.fn() })));
    render(<BreedingFarmCoverManager breedingFarmId="farm-id" farmName="Sítio Aurora" />);

    fireEvent.click(await screen.findByRole("button", { name: "Configurar capa" }));
    fireEvent.change(screen.getByLabelText("Enviar imagem de capa"), {
      target: { files: [new File(["image"], "capa.gif", { type: "image/gif" })] }
    });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Escolha uma imagem PNG, JPEG ou WebP com extensão compatível.");
    fireEvent.change(screen.getByLabelText("Enviar imagem de capa"), {
      target: { files: [new File(["image"], "capa.png", { type: "image/png" })] }
    });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "A imagem deve ter pelo menos 1200 × 400 pixels.");
    expect(screen.queryByRole("heading", { name: "Conferir nova capa" })).toBeNull();
    expect(fetchMock.mock.calls.some(([input, init]) => new URL(String(input)).pathname.endsWith("/cover/upload") && init?.method === "PUT")).toBe(false);
  });

  it("keeps the apply confirmation open and explains a server failure", async () => {
    setupFetch(null, 503);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:cover-preview", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    render(<BreedingFarmCoverManager breedingFarmId="farm-id" farmName="Sítio Aurora" />);

    fireEvent.click(await screen.findByRole("button", { name: "Configurar capa" }));
    fireEvent.click(screen.getByRole("button", { name: /Escolher um modelo/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Natureza clássica/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Conferir aplicação da capa" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação do modelo" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "A capa não pôde ser aplicada agora. Tente novamente em instantes.");
    expect(screen.getByRole("heading", { name: "Aplicar este modelo?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar aplicação do modelo" })).toBeTruthy();
  });

  it("uploads an accepted image and confirms removal of the current cover", async () => {
    const fetchMock = setupFetch(currentCover());
    const onApplied = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:cover-image", writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn(), writable: true });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1600, height: 600, close: vi.fn() })));
    render(<BreedingFarmCoverManager breedingFarmId="farm-id" farmName="Sítio Aurora" onApplied={onApplied} />);

    expect(await screen.findByAltText("Capa atual de Sítio Aurora")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Alterar foto de capa" }));
    fireEvent.change(screen.getByLabelText("Enviar imagem de capa"), {
      target: { files: [new File(["image"], "capa.webp", { type: "image/webp" })] }
    });
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar aplicação" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => new URL(String(input)).pathname.endsWith("/cover/upload") && init?.method === "PUT")).toBe(true));
    const uploadRequest = fetchMock.mock.calls.find(([input, init]) => new URL(String(input)).pathname.endsWith("/cover/upload") && init?.method === "PUT");
    expect(uploadRequest?.[1]?.body).toBeInstanceOf(FormData);
    expect((uploadRequest?.[1]?.body as FormData).get("file")).toBeInstanceOf(File);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(await screen.findByAltText("Capa atual de Sítio Aurora")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Alterar foto de capa" }));
    fireEvent.click(screen.getByRole("button", { name: /Remover capa/ }));
    expect(await screen.findByRole("heading", { name: "Remover capa?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => new URL(String(input)).pathname.endsWith("/api/breeding-farms/farm-id/cover") && init?.method === "DELETE")).toBe(true));
    expect(await screen.findByText("Capa removida. A imagem padrão será exibida.")).toBeTruthy();
  });
});
