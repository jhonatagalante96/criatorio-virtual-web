"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, StaleTenantResponseError, getApiUrl } from "../../../../lib/http/api-client";
import type { BirdStatus } from "../bird-status-action";

interface BirdAttachment {
  attachmentId: string;
  birdId: string;
  fileName: string;
  contentType: string;
  length: number;
  createdAtUtc: string;
  downloadUrl: string;
  isPrimary: boolean;
  caption: string | null;
}

interface BirdAttachmentsResponse {
  breedingFarmId: string;
  birdId: string;
  items: BirdAttachment[];
}

interface BirdMediaSectionProps {
  bird: Readonly<{
    birdId: string;
    breedingFarmId: string;
    name: string;
    status: BirdStatus;
  }>;
  client: ApiClient;
  onBirdUpdated: () => void;
  onSessionExpired: () => Promise<unknown> | void;
  prepareMutation: () => Promise<void>;
}

type LoadState = "error" | "loading" | "ready";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};
const SUPPORTED_EXTENSIONS_BY_CONTENT_TYPE: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/gif": [".gif"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/jpeg": [".jpeg", ".jpg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"]
};
const ACCEPTED_FILE_TYPES = ".pdf,.gif,.heic,.heif,.jpeg,.jpg,.png,.webp,.mp4,.webm";

function sameTenantId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function extensionOf(fileName: string): string {
  const separator = fileName.lastIndexOf(".");
  return separator < 0 ? "" : fileName.slice(separator).toLowerCase();
}

function contentTypeFor(file: File): string | undefined {
  const extension = extensionOf(file.name);
  const type = file.type.trim().toLowerCase() || EXTENSION_CONTENT_TYPES[extension];
  return SUPPORTED_EXTENSIONS_BY_CONTENT_TYPE[type]?.includes(extension) ? type : undefined;
}

function validateFile(file: File): string | undefined {
  const contentType = contentTypeFor(file);
  if (!contentType) return "Escolha PDF, GIF, HEIC, HEIF, JPEG, PNG, WebP, MP4 ou WebM.";
  if (file.size <= 0) return "O arquivo não pode estar vazio.";
  const maxLength = contentType.startsWith("video/") ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size > maxLength) {
    const limit = contentType.startsWith("video/") ? "100 MB" : "10 MB";
    return `Este arquivo excede o limite de ${limit} para este formato.`;
  }
  return undefined;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não disponível"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function getErrorMessage(error: unknown, operation: "delete" | "primary" | "upload"): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a ficha e tente novamente.";
  if (!(error instanceof ApiError)) return "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
  if (error.status === 400) {
    return operation === "upload"
      ? "O arquivo não atende aos requisitos. Confira o formato, o tamanho e tente novamente."
      : "Não foi possível concluir a operação. Atualize a ficha e tente novamente.";
  }
  if (error.status === 403) return "Sua conta não tem permissão para alterar os arquivos desta ave.";
  if (error.status === 404) return "A ave ou o arquivo não está mais disponível no criatório selecionado. Atualize a ficha.";
  if (error.status === 409) {
    const message = `${error.message} ${error.details ?? ""}`.toLowerCase();
    return message.includes("transfer")
      ? "Esta ave está com uma transferência pendente. Não é possível alterar os arquivos até esse fluxo ser encerrado."
      : "A seleção do criatório mudou. Atualize a ficha e tente novamente.";
  }
  if (error.status === 503) return "O armazenamento privado está indisponível no momento. Tente novamente em instantes.";
  if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
}

function isImage(attachment: BirdAttachment): boolean {
  return attachment.contentType.toLowerCase().startsWith("image/");
}

function isVideo(attachment: BirdAttachment): boolean {
  return attachment.contentType.toLowerCase().startsWith("video/");
}

function BirdMediaPreview({ attachment }: Readonly<{ attachment: BirdAttachment }>) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const source = getApiUrl(attachment.downloadUrl);

  if (isVideo(attachment)) {
    return (
      <video
        aria-label={`Vídeo: ${attachment.caption || attachment.fileName}`}
        controls
        crossOrigin="use-credentials"
        preload="metadata"
        src={source}
      />
    );
  }

  if (isImage(attachment) && !previewFailed) {
    return (
      <img
        alt={attachment.caption || attachment.fileName}
        crossOrigin="use-credentials"
        loading="lazy"
        onError={() => setPreviewFailed(true)}
        src={source}
      />
    );
  }

  return (
    <div className="bird-media-file-placeholder">
      <span aria-hidden="true">▧</span>
      <span>{attachment.contentType === "application/pdf" ? "Documento PDF" : "Prévia indisponível"}</span>
    </div>
  );
}

export function BirdMediaSection({ bird, client, onBirdUpdated, onSessionExpired, prepareMutation }: Readonly<BirdMediaSectionProps>) {
  const [attachments, setAttachments] = useState<BirdAttachment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [uploadError, setUploadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [actionSuccess, setActionSuccess] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<string>();
  const [transferBlocked, setTransferBlocked] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<BirdAttachment>();
  const fileInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const mutationBlocked = bird.status === "Transferred" || transferBlocked;

  const loadAttachments = useCallback(async (signal?: AbortSignal, recoverSession = true) => {
    const currentRequestId = ++requestId.current;
    setLoadState("loading");
    setLoadError(undefined);
    try {
      const response = await client.request<BirdAttachmentsResponse>(
        `api/birds/${encodeURIComponent(bird.birdId)}/attachments`,
        { signal }
      );
      if (signal?.aborted || currentRequestId !== requestId.current) return;
      if (!sameTenantId(response.breedingFarmId, bird.breedingFarmId) || !sameTenantId(response.birdId, bird.birdId)) {
        throw new StaleTenantResponseError();
      }
      if (response.items.some((attachment) => !sameTenantId(attachment.birdId, bird.birdId))) {
        throw new StaleTenantResponseError();
      }
      setAttachments(response.items);
      setLoadState("ready");
    } catch (error) {
      if (signal?.aborted || currentRequestId !== requestId.current) return;
      if (error instanceof ApiError && error.status === 401) {
        if (!recoverSession) {
          setLoadError("Sua sessão expirou. Entre novamente para carregar os arquivos desta ave.");
          setLoadState("error");
          return;
        }
        await onSessionExpired();
        if (signal?.aborted || currentRequestId !== requestId.current) return;
        return loadAttachments(signal, false);
      }
      setLoadError(error instanceof ApiError && error.status === 403
        ? "Sua conta não tem permissão para consultar os arquivos desta ave."
        : error instanceof ApiError && error.status === 404
          ? "A ave não está mais disponível no criatório selecionado."
          : error instanceof ApiError && error.status === 409
            ? "Selecione novamente um criatório para consultar estes arquivos."
            : error instanceof ApiError && error.status >= 500
              ? "O serviço está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível carregar as fotos e os anexos. Verifique sua conexão e tente novamente.");
      setLoadState("error");
    }
  }, [bird.birdId, bird.breedingFarmId, client, onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAttachments(controller.signal);
    return () => {
      controller.abort();
      uploadController.current?.abort();
    };
  }, [loadAttachments]);

  useEffect(() => {
    if (previewAttachment) dialogRef.current?.showModal();
  }, [previewAttachment]);

  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setSelectedFile(file);
    setUploadError(file ? validateFile(file) : undefined);
    setActionError(undefined);
    setActionSuccess(undefined);
  }

  async function reportFailure(error: unknown, operation: "delete" | "primary" | "upload") {
    if (error instanceof ApiError && error.status === 401) {
      await onSessionExpired();
      setActionError("Sua sessão expirou. Entre novamente para continuar.");
      return;
    }
    if (error instanceof ApiError && error.status === 409) {
      const message = `${error.message} ${error.details ?? ""}`.toLowerCase();
      if (message.includes("transfer")) setTransferBlocked(true);
    }
    setActionError(getErrorMessage(error, operation));
    setActionSuccess(undefined);
    if (operation === "delete" && error instanceof ApiError && error.status === 503) {
      client.clearCache();
      await loadAttachments();
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || uploading || activeAttachmentId || mutationBlocked) return;
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const contentType = contentTypeFor(selectedFile)!;
    const file = selectedFile.type === contentType
      ? selectedFile
      : new File([selectedFile], selectedFile.name, { lastModified: selectedFile.lastModified, type: contentType });
    const form = new FormData();
    form.set("file", file, file.name);
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setUploadProgress(null);
    setUploadError(undefined);
    setActionError(undefined);
    setActionSuccess(undefined);

    try {
      await prepareMutation();
      const uploaded = await client.upload<BirdAttachment>(
        `api/birds/${encodeURIComponent(bird.birdId)}/attachments`,
        form,
        (percent) => setUploadProgress(percent),
        { signal: controller.signal }
      );
      client.clearCache();
      setUploadProgress(100);
      setAttachments((current) => [uploaded, ...current.filter((item) => item.attachmentId !== uploaded.attachmentId)]);
      setSelectedFile(undefined);
      if (fileInput.current) fileInput.current.value = "";
      setActionSuccess(isImage(uploaded) || isVideo(uploaded)
        ? "O arquivo foi adicionado à ficha e também está disponível na Galeria do Criatório."
        : "O anexo foi adicionado à ficha da ave.");
      if (uploaded.isPrimary) onBirdUpdated();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 409 && `${error.message} ${error.details ?? ""}`.toLowerCase().includes("transfer")) {
        setTransferBlocked(true);
      }
      await reportFailure(error, "upload");
    } finally {
      uploadController.current = null;
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function setPrimaryPhoto(attachment: BirdAttachment) {
    if (!isImage(attachment) || attachment.isPrimary || uploading || activeAttachmentId || mutationBlocked) return;
    setActiveAttachmentId(attachment.attachmentId);
    setActionError(undefined);
    setActionSuccess(undefined);
    try {
      await prepareMutation();
      await client.request(`api/birds/${encodeURIComponent(bird.birdId)}/primary-photo`, {
        body: JSON.stringify({ attachmentId: attachment.attachmentId }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      client.clearCache();
      setAttachments((current) => current.map((item) => ({ ...item, isPrimary: item.attachmentId === attachment.attachmentId })));
      setActionSuccess("A foto principal da ave foi atualizada.");
      onBirdUpdated();
    } catch (error) {
      await reportFailure(error, "primary");
    } finally {
      setActiveAttachmentId(undefined);
    }
  }

  async function deleteAttachment(attachment: BirdAttachment) {
    if (attachment.isPrimary || uploading || activeAttachmentId || mutationBlocked) return;
    const isGalleryMedia = isImage(attachment) || isVideo(attachment);
    const confirmation = isGalleryMedia
      ? `Remover “${attachment.caption || attachment.fileName}”? A mídia também deixará de aparecer na Galeria do Criatório.`
      : `Remover “${attachment.fileName}” desta ficha?`;
    if (!window.confirm(confirmation)) return;

    setActiveAttachmentId(attachment.attachmentId);
    setActionError(undefined);
    setActionSuccess(undefined);
    try {
      await prepareMutation();
      await client.request<void>(`api/birds/${encodeURIComponent(bird.birdId)}/attachments/${encodeURIComponent(attachment.attachmentId)}`, {
        body: JSON.stringify({ confirmed: true }),
        headers: { "content-type": "application/json" },
        method: "DELETE"
      });
      client.clearCache();
      setAttachments((current) => current.filter((item) => item.attachmentId !== attachment.attachmentId));
      setActionSuccess(isGalleryMedia
        ? "A mídia foi removida da ficha e da Galeria do Criatório."
        : "O anexo foi removido da ficha da ave.");
    } catch (error) {
      await reportFailure(error, "delete");
    } finally {
      setActiveAttachmentId(undefined);
    }
  }

  function retry() {
    setTransferBlocked(false);
    setActionError(undefined);
    client.clearCache();
    void loadAttachments();
  }

  const media = attachments.filter((attachment) => isImage(attachment) || isVideo(attachment));
  const otherAttachments = attachments.filter((attachment) => !isImage(attachment) && !isVideo(attachment));
  const mutationInProgress = uploading || Boolean(activeAttachmentId);

  return (
    <section aria-labelledby="titulo-fotos-ave" aria-busy={loadState === "loading"} className="bird-detail-section bird-detail-media-card">
      <div className="bird-detail-section-heading bird-media-heading">
        <div><p className="eyebrow">Fotos e anexos</p><h2 id="titulo-fotos-ave">Arquivos da ave</h2></div>
        {loadState === "ready" && <span className="bird-media-count">{attachments.length} {attachments.length === 1 ? "arquivo" : "arquivos"}</span>}
      </div>

      {mutationBlocked && (
        <p className="bird-media-blocked" role="status">
          {bird.status === "Transferred"
            ? "Esta ave foi transferida e seus arquivos não podem mais ser alterados."
            : "Esta ave está com uma transferência pendente. As alterações ficam bloqueadas até o fluxo ser encerrado."}
        </p>
      )}

      {loadState === "loading" && <p className="bird-media-loading" role="status">Carregando fotos e anexos…</p>}
      {loadState === "error" && (
        <div className="bird-media-load-error" role="alert">
          <p>{loadError}</p>
          <button className="auth-secondary-action" onClick={retry} type="button">Tentar novamente</button>
        </div>
      )}
      {loadState === "ready" && attachments.length === 0 && (
        <div className="bird-detail-empty-media">
          <span aria-hidden="true" className="bird-media-empty-icon">▧</span>
          <p>Nenhuma foto ou anexo cadastrado.</p>
          <span>Adicione arquivos para organizar as mídias e documentos desta ave.</span>
        </div>
      )}

      {loadState === "ready" && media.length > 0 && (
        <div aria-label="Fotos e vídeos da ave" className="bird-media-grid">
          {media.map((attachment) => {
            const busy = activeAttachmentId === attachment.attachmentId;
            const primaryHintId = `bird-media-primary-${attachment.attachmentId}`;
            return (
              <article className="bird-media-card" key={attachment.attachmentId}>
                <div className="bird-media-preview">
                  {isImage(attachment) ? (
                    <button
                      aria-label={`Ampliar imagem: ${attachment.caption || attachment.fileName}`}
                      className="bird-media-preview-trigger"
                      onClick={() => setPreviewAttachment(attachment)}
                      type="button"
                    >
                      <BirdMediaPreview attachment={attachment} />
                    </button>
                  ) : <BirdMediaPreview attachment={attachment} />}
                </div>
                <div className="bird-media-card-body">
                  <div className="bird-media-card-title">
                    <p title={attachment.fileName}>{attachment.caption || attachment.fileName}</p>
                    {attachment.isPrimary && <span className="bird-media-primary-badge">Foto principal</span>}
                    {isVideo(attachment) && <span className="bird-media-type-badge">Vídeo</span>}
                  </div>
                  <p className="bird-media-meta">{formatFileSize(attachment.length)} <span aria-hidden="true">·</span> {formatDate(attachment.createdAtUtc)}</p>
                  <div className="bird-media-actions">
                    {isImage(attachment) && !attachment.isPrimary && (
                      <button
                        aria-describedby={mutationBlocked ? "bird-media-blocked-help" : undefined}
                        className="bird-media-secondary-action"
                        disabled={mutationInProgress || mutationBlocked}
                        onClick={() => void setPrimaryPhoto(attachment)}
                        type="button"
                      >
                        {busy ? "Salvando…" : "Definir como principal"}
                      </button>
                    )}
                    {attachment.isPrimary ? (
                      <button aria-describedby={primaryHintId} className="bird-media-danger-action" disabled type="button">Remover</button>
                    ) : (
                      <button
                        aria-describedby={mutationBlocked ? "bird-media-blocked-help" : undefined}
                        className="bird-media-danger-action"
                        disabled={mutationInProgress || mutationBlocked}
                        onClick={() => void deleteAttachment(attachment)}
                        type="button"
                      >
                        {busy ? "Removendo…" : "Remover"}
                      </button>
                    )}
                  </div>
                  {attachment.isPrimary && <p className="bird-media-primary-note" id={primaryHintId}>Defina outra foto principal antes de remover esta imagem.</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {loadState === "ready" && otherAttachments.length > 0 && (
        <div className="bird-media-documents">
          <h3>Outros anexos</h3>
          <ul>
            {otherAttachments.map((attachment) => (
              <li key={attachment.attachmentId}>
                <span aria-hidden="true" className="bird-media-document-icon">PDF</span>
                <span className="bird-media-document-info">
                  <strong title={attachment.fileName}>{attachment.fileName}</strong>
                  <small>{formatFileSize(attachment.length)} <span aria-hidden="true">·</span> {formatDate(attachment.createdAtUtc)}</small>
                </span>
                <a href={getApiUrl(attachment.downloadUrl)} rel="noreferrer" target="_blank">Baixar</a>
                <button
                  aria-describedby={mutationBlocked ? "bird-media-blocked-help" : undefined}
                  className="bird-media-danger-action"
                  disabled={mutationInProgress || mutationBlocked}
                  onClick={() => void deleteAttachment(attachment)}
                  type="button"
                >
                  {activeAttachmentId === attachment.attachmentId ? "Removendo…" : "Remover"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mutationBlocked && <span className="sr-only" id="bird-media-blocked-help">As ações estão desabilitadas enquanto a transferência estiver pendente.</span>}

      {loadState === "ready" && (
        <form aria-busy={uploading} className="bird-media-upload-form" onSubmit={(event) => void uploadAttachment(event)}>
          <label htmlFor="bird-media-file">Adicionar foto, vídeo ou anexo</label>
          <input
            accept={ACCEPTED_FILE_TYPES}
            aria-describedby={uploadError ? "bird-media-file-error" : "bird-media-file-hint"}
            disabled={uploading || mutationBlocked}
            id="bird-media-file"
            onChange={changeFile}
            ref={fileInput}
            type="file"
          />
          {uploadError
            ? <p className="bird-media-field-error" id="bird-media-file-error">{uploadError}</p>
            : <p className="bird-media-hint" id="bird-media-file-hint">PDF, GIF, HEIC, HEIF, JPEG, PNG e WebP até 10 MB; MP4 e WebM até 100 MB. Fotos e vídeos também aparecem na Galeria do Criatório.</p>}
          {selectedFile && <p className="bird-media-selected-file">Selecionado: {selectedFile.name} · {formatFileSize(selectedFile.size)}</p>}
          <button className="auth-primary-action" disabled={!selectedFile || Boolean(uploadError) || mutationInProgress || mutationBlocked} type="submit">
            {uploading ? "Enviando…" : "Enviar arquivo"}
          </button>
          {uploading && (
            <div aria-live="polite" className="bird-media-upload-progress" role="status">
              <progress aria-label="Progresso do envio" max={100} value={uploadProgress ?? undefined} />
              <span>{uploadProgress === null ? "Enviando arquivo com segurança…" : `${uploadProgress}% enviado`}</span>
            </div>
          )}
        </form>
      )}

      {actionError && <p className="bird-media-action-error" role="alert">{actionError}</p>}
      {actionSuccess && <p className="bird-media-action-success" role="status">{actionSuccess}</p>}

      <dialog
        aria-label={`Visualização ampliada: ${previewAttachment?.caption || previewAttachment?.fileName || "foto"}`}
        className="bird-media-zoom-dialog"
        onClick={(event) => { if (event.target === event.currentTarget) { dialogRef.current?.close(); setPreviewAttachment(undefined); } }}
        onClose={() => setPreviewAttachment(undefined)}
        ref={dialogRef}
      >
        {previewAttachment && (
          <div className="bird-media-zoom-content">
            <button autoFocus className="bird-media-secondary-action" onClick={() => dialogRef.current?.close()} type="button">Fechar</button>
            <BirdMediaPreview attachment={previewAttachment} />
          </div>
        )}
      </dialog>
    </section>
  );
}
