import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BreedingFarmGalleryPage from "./page";

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");

afterEach(() => {
  cleanup();
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  window.history.pushState({}, "", "/configuracoes/criatorio/galeria");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

function authenticatedSession(): Response {
  return jsonResponse({ email: "owner@example.com", emailConfirmed: true, userId: "user-id" });
}

function selectedFarm(): Response {
  return jsonResponse({
    breedingFarms: [{ breedingFarmId: "farm-id", isSelected: true, name: "Sítio Aurora", responsibleName: "Ana Souza" }],
    selectedBreedingFarmId: "farm-id"
  });
}

interface TestGalleryMedia {
  mediaId: string;
  bird: { birdId: string; name: string; ringNumber: string | null } | null;
  fileName: string;
  contentType: string;
  length: number;
  caption: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  isPrimary: boolean;
  contentUrl: string;
}

function galleryMedia(overrides: Partial<TestGalleryMedia> = {}): TestGalleryMedia {
  return {
    mediaId: "media-1",
    bird: { birdId: "bird-1", name: "Aurora", ringNumber: "ABC-123" },
    fileName: "aurora.jpg",
    contentType: "image/jpeg",
    length: 1200,
    caption: null,
    createdAtUtc: "2026-09-16T12:00:00Z",
    updatedAtUtc: "2026-09-16T12:00:00Z",
    isPrimary: false,
    contentUrl: "/api/breeding-farms/gallery/media-1/content",
    ...overrides
  };
}

function galleryResponse(items: TestGalleryMedia[], page = 1, pageSize = 25) {
  return {
    breedingFarmId: "farm-id",
    page,
    pageSize,
    totalCount: items.length,
    hasNextPage: false,
    limits: {
      defaultPageSize: 25,
      maxPageSize: 100,
      maxImageFileLength: 10 * 1024 * 1024,
      maxVideoFileLength: 100 * 1024 * 1024,
      maxCaptionLength: 300,
      supportedImageContentTypes: ["image/gif", "image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"],
      supportedVideoContentTypes: ["video/mp4", "video/webm"]
    },
    items
  };
}

function birdListResponse() {
  return jsonResponse({
    breedingFarmId: "farm-id",
    items: [
      { birdId: "bird-1", name: "Aurora", ringNumber: "ABC-123" },
      { birdId: "bird-2", name: "Brisa", ringNumber: null }
    ],
    page: 1,
    pageSize: 100,
    totalPages: 1
  });
}

function installGalleryApi(initialItems: TestGalleryMedia[] = [galleryMedia()]) {
  let items: TestGalleryMedia[] = [...initialItems];
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    const method = init.method ?? "GET";

    if (url.pathname === "/api/auth/session") return authenticatedSession();
    if (url.pathname === "/api/breeding-farms" && method === "GET") return selectedFarm();
    if (url.pathname === "/antiforgery/token") return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
    if (url.pathname === "/api/birds") return birdListResponse();

    if (url.pathname === "/api/breeding-farms/gallery" && method === "GET") {
      const type = url.searchParams.get("type");
      const birdId = url.searchParams.get("birdId");
      const filtered = items.filter((item) => (!type || item.contentType.startsWith(`${type}/`)) && (!birdId || item.bird?.birdId === birdId));
      return jsonResponse(galleryResponse(filtered));
    }
    if (url.pathname === "/api/breeding-farms/gallery" && method === "POST") {
      const form = init.body as FormData;
      const file = form.get("file") as File;
      const caption = form.get("caption");
      const created = galleryMedia({
        mediaId: "media-uploaded",
        bird: null,
        fileName: file.name,
        contentType: file.type,
        length: file.size,
        caption: typeof caption === "string" ? caption : null,
        contentUrl: "/api/breeding-farms/gallery/media-uploaded/content"
      });
      items = [created, ...items];
      return jsonResponse(created, 201);
    }
    if (url.pathname.startsWith("/api/breeding-farms/gallery/") && method === "PUT") {
      const id = url.pathname.split("/").at(-1);
      const body = JSON.parse(String(init.body)) as { caption: string | null };
      const existing = items.find((item) => item.mediaId === id) ?? galleryMedia({ mediaId: id, bird: null });
      const updated = { ...existing, caption: body.caption, updatedAtUtc: "2026-09-17T12:00:00Z" };
      items = items.map((item) => item.mediaId === id ? updated : item);
      return jsonResponse(updated);
    }
    if (url.pathname.startsWith("/api/breeding-farms/gallery/") && method === "DELETE") {
      const id = url.pathname.split("/").at(-1);
      items = items.filter((item) => item.mediaId !== id);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

describe("BreedingFarmGalleryPage", () => {
  it("loads private gallery media and shows linked bird details without autoplaying videos", async () => {
    installGalleryApi([
      galleryMedia(),
      galleryMedia({ mediaId: "video-1", bird: null, fileName: "voo.mp4", contentType: "video/mp4", contentUrl: "/api/breeding-farms/gallery/video-1/content" })
    ]);
    render(<BreedingFarmGalleryPage />);

    expect(await screen.findByRole("heading", { name: "Galeria" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Aurora" })).getAttribute("href")).toBe("/plantel/aves/bird-1");
    expect(screen.getByText(/Anilha/).textContent).toContain("ABC-123");
    const video = screen.getByLabelText("voo.mp4") as HTMLVideoElement;
    expect(video.controls).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(screen.getByRole("link", { name: "Galeria" }).getAttribute("aria-current")).toBe("page");
  });

  it("opens an accessible enlarged view when the user activates a photo thumbnail", async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
    installGalleryApi();
    render(<BreedingFarmGalleryPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ampliar imagem: aurora.jpg" }));

    expect(showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Visualização ampliada: aurora.jpg" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar visualização da imagem" })).toBeTruthy();
  });

  it("filters media by type and by bird using the API contract", async () => {
    const { requests } = installGalleryApi([
      galleryMedia(),
      galleryMedia({ mediaId: "video-1", bird: null, fileName: "voo.mp4", contentType: "video/mp4" })
    ]);
    render(<BreedingFarmGalleryPage />);
    await screen.findByRole("heading", { name: "Mídias do criatório" });

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "video" } });
    await waitFor(() => expect(requests.some(({ url }) => url.pathname === "/api/breeding-farms/gallery" && url.searchParams.get("type") === "video")).toBe(true));
    fireEvent.change(screen.getByLabelText("Ave"), { target: { value: "bird-1" } });
    await waitFor(() => expect(requests.some(({ url }) => url.pathname === "/api/breeding-farms/gallery" && url.searchParams.get("type") === "video" && url.searchParams.get("birdId") === "bird-1")).toBe(true));
  });

  it("distinguishes an empty filtered result from an empty gallery", async () => {
    installGalleryApi([galleryMedia()]);
    render(<BreedingFarmGalleryPage />);
    await screen.findByRole("heading", { name: "Mídias do criatório" });

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "video" } });

    expect(await screen.findByRole("heading", { name: "Nenhuma mídia encontrada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar primeira mídia" })).toBeNull();
  });

  it("uploads standalone media, updates a caption, and confirms deletion with antiforgery protection", async () => {
    const { requests } = installGalleryApi();
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<BreedingFarmGalleryPage />);
    await screen.findByRole("heading", { name: "Mídias do criatório" });

    const file = new File(["photo-bytes"], "momento.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Foto ou vídeo"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Legenda (opcional)"), { target: { value: "Manhã no criatório" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à galeria" }));

    await screen.findByText("A mídia foi adicionada à galeria.");
    await waitFor(() => expect(requests.some(({ url, init }) => url.pathname === "/api/breeding-farms/gallery" && init.method === "POST")).toBe(true));
    const upload = requests.find(({ url, init }) => url.pathname === "/api/breeding-farms/gallery" && init.method === "POST")!;
    expect((upload.init.body as FormData).get("file")).toBeInstanceOf(File);
    expect((upload.init.body as FormData).get("caption")).toBe("Manhã no criatório");
    expect(new Headers(upload.init.headers).get("x-xsrf-token")).toBe("csrf-token");

    const card = screen.getByRole("heading", { name: "aurora.jpg" }).closest("article");
    expect(card).toBeTruthy();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar legenda" }));
    fireEvent.change(within(card as HTMLElement).getByLabelText("Legenda"), { target: { value: "Registro atualizado" } });
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Salvar legenda" }));
    await screen.findByRole("heading", { name: "Registro atualizado" });
    const captionUpdate = requests.find(({ url, init }) => url.pathname.endsWith("/media-1") && init.method === "PUT");
    expect(captionUpdate).toBeTruthy();
    expect(JSON.parse(String(captionUpdate?.init.body))).toEqual({ caption: "Registro atualizado" });
    expect(new Headers(captionUpdate?.init.headers).get("x-xsrf-token")).toBe("csrf-token");

    const allGalleryRequestsBeforeFilter = requests.filter(({ url, init }) => url.pathname === "/api/breeding-farms/gallery" && init.method !== "POST" && !url.searchParams.has("type")).length;
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "image" } });
    await screen.findByRole("heading", { name: "Registro atualizado" });
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(requests.filter(({ url, init }) => url.pathname === "/api/breeding-farms/gallery" && init.method !== "POST" && !url.searchParams.has("type")).length).toBeGreaterThan(allGalleryRequestsBeforeFilter));
    expect(await screen.findByRole("heading", { name: "Registro atualizado" })).toBeTruthy();

    const updatedCard = screen.getByRole("heading", { name: "Registro atualizado" }).closest("article") as HTMLElement;
    fireEvent.click(within(updatedCard).getByRole("button", { name: "Remover mídia" }));
    await screen.findByText("A mídia foi removida da galeria e da ficha da ave, quando vinculada.");
    expect(requests.some(({ url, init }) => url.pathname.endsWith("/media-1") && init.method === "DELETE")).toBe(true);
  });

  it("does not upload unsupported formats and blocks farm media that is the primary bird photo", async () => {
    installGalleryApi([galleryMedia({ isPrimary: true })]);
    render(<BreedingFarmGalleryPage />);
    await screen.findByRole("heading", { name: "Mídias do criatório" });

    const unsupported = new File(["pdf"], "documento.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Foto ou vídeo"), { target: { files: [unsupported] } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à galeria" }));
    expect((await screen.findByRole("alert")).textContent?.includes("Escolha uma foto ou vídeo")).toBe(true);
    expect(screen.getByRole("button", { name: "Remover mídia" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/primeiro substitua a foto principal/)).toBeTruthy();
  });

  it("offers a create-farm path without requesting gallery data when no farm is selected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/auth/session") return authenticatedSession();
      if (url.pathname === "/api/breeding-farms") return jsonResponse({ breedingFarms: [], selectedBreedingFarmId: null });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingFarmGalleryPage />);

    expect(await screen.findByRole("heading", { name: "Crie seu primeiro criatório" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar meu criatório" }).getAttribute("href")).toBe("/onboarding/criatorio");
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/breeding-farms/gallery"))).toBe(false);
  });

  it("offers a first-media call to action when the gallery is empty", async () => {
    installGalleryApi([]);
    render(<BreedingFarmGalleryPage />);
    await screen.findByRole("heading", { name: "Sua galeria está vazia" });
    const fileInput = screen.getByLabelText("Foto ou vídeo") as HTMLInputElement;
    const openFilePicker = vi.spyOn(fileInput, "click");

    fireEvent.click(screen.getByRole("button", { name: "Adicionar primeira mídia" }));

    expect(openFilePicker).toHaveBeenCalledOnce();
  });
});
