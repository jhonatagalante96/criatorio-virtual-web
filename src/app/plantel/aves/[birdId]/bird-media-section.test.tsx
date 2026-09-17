import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiClient, ApiError } from "../../../../lib/http/api-client";
import { BirdMediaSection } from "./bird-media-section";

const bird = {
  birdId: "bird-a",
  breedingFarmId: "farm-a",
  name: "Pardal",
  status: "Active" as const
};

const photo = {
  attachmentId: "photo-a",
  birdId: bird.birdId,
  fileName: "pardal.jpg",
  contentType: "image/jpeg",
  length: 1280,
  createdAtUtc: "2026-09-17T12:00:00Z",
  downloadUrl: "/api/birds/bird-a/attachments/photo-a/content",
  isPrimary: true,
  caption: "Pardal"
};

function createClient(attachments = [photo]) {
  return {
    clearCache: vi.fn(),
    request: vi.fn().mockResolvedValue({ breedingFarmId: bird.breedingFarmId, birdId: bird.birdId, items: attachments }),
    upload: vi.fn()
  } as unknown as ApiClient;
}

function renderSection(client: ApiClient) {
  return render(
    <BirdMediaSection
      bird={bird}
      client={client}
      onBirdUpdated={vi.fn()}
      onSessionExpired={vi.fn()}
      prepareMutation={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BirdMediaSection", () => {
  it("separates private image previews from downloadable documents", async () => {
    const client = createClient([
      photo,
      { ...photo, attachmentId: "document-a", fileName: "registro.pdf", contentType: "application/pdf", downloadUrl: "/api/birds/bird-a/attachments/document-a/content", isPrimary: false }
    ]);

    renderSection(client);

    expect(await screen.findByRole("img", { name: "Pardal" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Outros anexos" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Baixar" }).getAttribute("href")).toContain("document-a/content");
    expect(screen.queryByRole("img", { name: "registro.pdf" })).toBeNull();
  });

  it("sets a different image as primary and refreshes the bird profile", async () => {
    const replacement = {
      ...photo,
      attachmentId: "photo-b",
      fileName: "pardal-substituto.jpg",
      downloadUrl: "/api/birds/bird-a/attachments/photo-b/content",
      isPrimary: false
    };
    const client = createClient([photo, replacement]);
    const onBirdUpdated = vi.fn();

    render(
      <BirdMediaSection
        bird={bird}
        client={client}
        onBirdUpdated={onBirdUpdated}
        onSessionExpired={vi.fn()}
        prepareMutation={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Definir como principal" }));

    expect(await screen.findByText("A foto principal da ave foi atualizada.")).toBeTruthy();
    expect(client.request).toHaveBeenNthCalledWith(2, "api/birds/bird-a/primary-photo", {
      body: JSON.stringify({ attachmentId: "photo-b" }),
      headers: { "content-type": "application/json" },
      method: "PUT"
    });
    expect(screen.getAllByRole("button", { name: "Definir como principal" })).toHaveLength(1);
    expect(screen.getAllByText("Foto principal", { exact: true })).toHaveLength(1);
    expect(client.clearCache).toHaveBeenCalledOnce();
    expect(onBirdUpdated).toHaveBeenCalledOnce();
  });

  it("blocks further photo changes after the API reports a pending transfer", async () => {
    const candidate = { ...photo, attachmentId: "photo-b", isPrimary: false };
    const client = createClient([candidate]);
    vi.mocked(client.request)
      .mockResolvedValueOnce({ breedingFarmId: bird.breedingFarmId, birdId: bird.birdId, items: [candidate] })
      .mockRejectedValueOnce(new ApiError(409, "The primary photo cannot be changed while a transfer is pending."));

    renderSection(client);
    fireEvent.click(await screen.findByRole("button", { name: "Definir como principal" }));

    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("transferência pendente");
    expect(screen.getByRole("button", { name: "Definir como principal" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("transferência pendente");
  });

  it("validates unsupported files before sending and announces upload progress", async () => {
    let finishUpload: ((attachment: typeof photo) => void) | undefined;
    const client = createClient([]);
    const upload = vi.mocked(client.upload).mockImplementation((_path, _form, onProgress) => {
      onProgress?.(37);
      return new Promise((resolve) => { finishUpload = resolve; });
    });
    renderSection(client);

    const input = await screen.findByLabelText("Adicionar foto, vídeo ou anexo");
    fireEvent.change(input, { target: { files: [new File(["bad"], "arquivo.exe", { type: "application/octet-stream" })] } });
    expect(screen.getByText(/Escolha PDF/)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [new File(["bird"], "pardal.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));

    expect(await screen.findByText("37% enviado")).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
    finishUpload?.({ ...photo, attachmentId: "photo-b", isPrimary: false });
    await screen.findByText("O arquivo foi adicionado à ficha e também está disponível na Galeria do Criatório.");
  });

  it("refreshes an expired session once before loading attachments again", async () => {
    const client = createClient([]);
    vi.mocked(client.request)
      .mockRejectedValueOnce(new ApiError(401, "A session has expired."))
      .mockResolvedValueOnce({ breedingFarmId: bird.breedingFarmId, birdId: bird.birdId, items: [] });
    const onSessionExpired = vi.fn().mockResolvedValue({ ok: true });

    render(
      <BirdMediaSection
        bird={bird}
        client={client}
        onBirdUpdated={vi.fn()}
        onSessionExpired={onSessionExpired}
        prepareMutation={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(await screen.findByText("Nenhuma foto ou anexo cadastrado.")).toBeTruthy();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledTimes(2);
  });
});
