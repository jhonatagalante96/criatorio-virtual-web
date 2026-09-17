"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient, getApiUrl } from "../../../../lib/http/api-client";
import { AppLoadingContent, AppLoadingState } from "../../../components/app-loading-state";
import { AuthenticatedShell } from "../../../components/authenticated-shell";
import { SessionRecovery } from "../../../components/session-recovery";

interface BreedingFarmSelectionResponse {
  breedingFarms: Array<{ breedingFarmId: string; name: string }>;
  selectedBreedingFarmId: string | null;
}

interface GalleryLimits {
  defaultPageSize: number;
  maxPageSize: number;
  maxImageFileLength: number;
  maxVideoFileLength: number;
  maxCaptionLength: number;
  supportedImageContentTypes: string[];
  supportedVideoContentTypes: string[];
}

interface GalleryBirdReference {
  birdId: string;
  name: string;
  ringNumber: string | null;
}

interface GalleryMedia {
  mediaId: string;
  bird: GalleryBirdReference | null;
  fileName: string;
  contentType: string;
  length: number;
  caption: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  isPrimary: boolean;
  contentUrl: string;
}

interface GalleryResponse {
  breedingFarmId: string;
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  limits: GalleryLimits;
  items: GalleryMedia[];
}

interface BirdListResponse {
  breedingFarmId: string;
  items: Array<{ birdId: string; name: string; ringNumber: string | null }>;
  page: number;
  pageSize: number;
  totalPages: number;
}

type FarmLoadState = "blocked" | "error" | "loading" | "ready";
type GalleryLoadState = "error" | "loading" | "ready";
type MediaFilter = "" | "image" | "video";

function sameTenantId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function formatMediaDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não disponível"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
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

function getActionError(error: unknown, operation: "caption" | "delete" | "upload", media?: GalleryMedia): string {
  if (!(error instanceof ApiError)) return "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
  if (error.status === 400) return operation === "upload"
    ? "O arquivo ou a legenda não atende aos requisitos. Confira o formato, o tamanho e os dados informados."
    : "A legenda não pôde ser salva. Confira o texto e tente novamente.";
  if (error.status === 403) return "Sua conta não tem permissão para alterar esta mídia.";
  if (error.status === 404) return "Esta mídia não está mais disponível no criatório selecionado. Atualize a galeria.";
  if (error.status === 409) {
    if (operation === "delete" && media?.isPrimary) return "Substitua a foto principal da ave antes de removê-la da galeria.";
    if (media?.bird) return "Esta mídia não pode ser alterada enquanto a transferência da ave estiver pendente.";
    return "A seleção do criatório mudou. Atualize a página e tente novamente.";
  }
  if (error.status === 503) return "O armazenamento privado está indisponível no momento. Tente novamente em instantes.";
  return error.status >= 500
    ? "O serviço está indisponível no momento. Tente novamente em instantes."
    : "Não foi possível concluir a operação. Verifique os dados e tente novamente.";
}

function GalleryStateCard({
  actionHref,
  actionLabel,
  email,
  farmName = "Criatório selecionado",
  heading,
  message,
  onRetry
}: Readonly<{
  actionHref?: string;
  actionLabel?: string;
  email: string;
  farmName?: string;
  heading: string;
  message: string;
  onRetry?: () => void;
}>) {
  return (
    <AuthenticatedShell activeNav="farm" email={email} farmName={farmName}>
      <section className="farm-gallery-state-card">
        <p className="eyebrow">Meu Criatório</p>
        <h1>{heading}</h1>
        <p>{message}</p>
        <div className="farm-gallery-state-actions">
          {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
          {actionHref && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
        </div>
      </section>
    </AuthenticatedShell>
  );
}

function GalleryMediaPreview({ media }: Readonly<{ media: GalleryMedia }>) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const source = getApiUrl(media.contentUrl);
  const isVideo = media.contentType.startsWith("video/");

  if (isVideo) {
    return <video aria-label={media.caption || media.fileName} controls crossOrigin="use-credentials" preload="metadata" src={source} />;
  }

  if (previewFailed || !media.contentType.startsWith("image/")) {
    return (
      <div className="farm-gallery-preview-unavailable">
        <span aria-hidden="true">▧</span>
        <p>Prévia indisponível</p>
        <a href={source} rel="noreferrer" target="_blank">Abrir arquivo</a>
      </div>
    );
  }

  return (
    <>
      <button
        aria-label={`Ampliar imagem: ${media.caption || media.fileName}`}
        className="farm-gallery-preview-trigger"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        <img alt={media.caption || media.fileName} crossOrigin="use-credentials" loading="lazy" onError={() => setPreviewFailed(true)} src={source} />
      </button>
      <dialog
        aria-label={`Visualização ampliada: ${media.caption || media.fileName}`}
        className="farm-gallery-zoom-dialog"
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
        ref={dialogRef}
      >
        <div className="farm-gallery-zoom-content">
          <button autoFocus aria-label="Fechar visualização da imagem" className="farm-gallery-secondary-action" onClick={() => dialogRef.current?.close()} type="button">Fechar</button>
          <img alt={media.caption || media.fileName} crossOrigin="use-credentials" src={source} />
          {media.caption && <p>{media.caption}</p>}
        </div>
      </dialog>
    </>
  );
}

function GalleryMediaCard({
  media,
  maxCaptionLength,
  onDelete,
  onSaveCaption,
  savingCaption,
  deleting
}: Readonly<{
  media: GalleryMedia;
  maxCaptionLength: number;
  onDelete: (media: GalleryMedia) => void;
  onSaveCaption: (media: GalleryMedia, caption: string) => Promise<boolean>;
  savingCaption: boolean;
  deleting: boolean;
}>) {
  const [isEditing, setIsEditing] = useState(false);
  const [caption, setCaption] = useState(media.caption ?? "");

  useEffect(() => setCaption(media.caption ?? ""), [media.caption]);

  async function submitCaption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSaveCaption(media, caption)) setIsEditing(false);
  }

  return (
    <article className="farm-gallery-item">
      <div className="farm-gallery-media-preview"><GalleryMediaPreview media={media} /></div>
      <div className="farm-gallery-item-content">
        <div className="farm-gallery-item-heading">
          <div>
            <h3>{media.caption || media.fileName}</h3>
            <p>{formatFileSize(media.length)} <span aria-hidden="true">·</span> {formatMediaDate(media.createdAtUtc)}</p>
          </div>
          {media.isPrimary && <span className="farm-gallery-primary-badge">Foto principal</span>}
        </div>
        {media.bird && (
          <p className="farm-gallery-bird-reference">
            Ave: <Link href={`/plantel/aves/${encodeURIComponent(media.bird.birdId)}`}>{media.bird.name}</Link>
            {media.bird.ringNumber && <span> · Anilha {media.bird.ringNumber}</span>}
          </p>
        )}
        {isEditing ? (
          <form className="farm-gallery-caption-form" onSubmit={submitCaption}>
            <label htmlFor={`caption-${media.mediaId}`}>Legenda</label>
            <input
              autoFocus
              id={`caption-${media.mediaId}`}
              maxLength={maxCaptionLength}
              onChange={(event) => setCaption(event.target.value)}
              value={caption}
            />
            <div className="farm-gallery-caption-actions">
              <button className="farm-gallery-secondary-action" disabled={savingCaption} onClick={() => { setCaption(media.caption ?? ""); setIsEditing(false); }} type="button">Cancelar</button>
              <button className="farm-gallery-primary-action" disabled={savingCaption} type="submit">{savingCaption ? "Salvando…" : "Salvar legenda"}</button>
            </div>
          </form>
        ) : (
          <div className="farm-gallery-item-actions">
            <button className="farm-gallery-secondary-action" disabled={deleting || savingCaption} onClick={() => setIsEditing(true)} type="button">Editar legenda</button>
            {media.isPrimary ? (
              <button aria-describedby={`primary-photo-${media.mediaId}`} className="farm-gallery-danger-action" disabled type="button">Remover mídia</button>
            ) : (
              <button className="farm-gallery-danger-action" disabled={deleting || savingCaption} onClick={() => onDelete(media)} type="button">Remover mídia</button>
            )}
          </div>
        )}
        {media.isPrimary && <p className="farm-gallery-primary-note" id={`primary-photo-${media.mediaId}`}>Para removê-la, primeiro substitua a foto principal na ficha da ave.</p>}
      </div>
    </article>
  );
}

function FarmGalleryScreen({ email }: Readonly<{ email: string }>) {
  const { refresh } = useAuth();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmLoadState>("loading");
  const [farmError, setFarmError] = useState<string>();
  const [farmRetryNonce, setFarmRetryNonce] = useState(0);
  const [galleryState, setGalleryState] = useState<GalleryLoadState>("loading");
  const [galleryError, setGalleryError] = useState<string>();
  const [galleryNonce, setGalleryNonce] = useState(0);
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [limits, setLimits] = useState<GalleryLimits>();
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const [mediaType, setMediaType] = useState<MediaFilter>("");
  const [birdId, setBirdId] = useState("");
  const [birds, setBirds] = useState<BirdListResponse["items"]>([]);
  const [birdLoadState, setBirdLoadState] = useState<"error" | "loading" | "ready">("loading");
  const [birdRetryNonce, setBirdRetryNonce] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [uploadCaption, setUploadCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [savingMediaId, setSavingMediaId] = useState<string>();
  const [deletingMediaId, setDeletingMediaId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [actionSuccess, setActionSuccess] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const farmRequestId = useRef(0);
  const galleryRequestId = useRef(0);
  const birdRequestId = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    const requestId = ++farmRequestId.current;
    const controller = new AbortController();
    setFarmState("loading");
    setFarmError(undefined);
    setFarmId(null);

    async function loadSelectedFarm() {
      try {
        const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms", { signal: controller.signal });
        if (controller.signal.aborted || requestId !== farmRequestId.current) return;
        if (!selection.breedingFarms.length) {
          setFarmState("blocked");
          setFarmError("Crie seu primeiro criatório antes de adicionar fotos e vídeos.");
          return;
        }
        if (!selection.selectedBreedingFarmId) {
          setFarmState("blocked");
          setFarmError("Selecione um criatório para consultar sua galeria.");
          return;
        }
        const selectedFarm = selection.breedingFarms.find((farm) => sameTenantId(farm.breedingFarmId, selection.selectedBreedingFarmId!));
        if (!selectedFarm) {
          setFarmState("blocked");
          setFarmError("O criatório selecionado não está disponível. Selecione-o novamente para continuar.");
          return;
        }

        client.current!.setTenant(selectedFarm.breedingFarmId);
        setFarmId(selectedFarm.breedingFarmId);
        setFarmName(selectedFarm.name);
        setFarmState("ready");
      } catch (error) {
        if (controller.signal.aborted || requestId !== farmRequestId.current || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && error.status === 401) {
          const result = await refresh();
          if (result.ok) setFarmRetryNonce((current) => current + 1);
          return;
        }
        setFarmState(error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409) ? "blocked" : "error");
        setFarmError(error instanceof ApiError && error.status === 403
          ? "Sua conta não tem permissão para acessar o criatório selecionado."
          : "Não foi possível carregar o criatório. Verifique sua conexão e tente novamente.");
      }
    }

    void loadSelectedFarm();
    return () => { controller.abort(); };
  }, [farmRetryNonce, refresh]);

  useEffect(() => {
    const selectedFarmId = farmId;
    if (!selectedFarmId) return;
    const requestId = ++galleryRequestId.current;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(limits?.defaultPageSize ?? 25) });
    if (mediaType) params.set("type", mediaType);
    if (birdId) params.set("birdId", birdId);
    setGalleryState("loading");
    setGalleryError(undefined);

    async function loadGallery() {
      try {
        const response = await client.current!.request<GalleryResponse>(`api/breeding-farms/gallery?${params.toString()}`, { signal: controller.signal });
        if (controller.signal.aborted || requestId !== galleryRequestId.current) return;
        if (!sameTenantId(response.breedingFarmId, selectedFarmId!)) throw new StaleTenantResponseError();
        const lastPage = Math.max(1, Math.ceil(response.totalCount / response.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setMedia(response.items);
        setLimits(response.limits);
        setTotalCount(response.totalCount);
        setHasNextPage(response.hasNextPage);
        setGalleryState("ready");
      } catch (error) {
        if (controller.signal.aborted || requestId !== galleryRequestId.current || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && error.status === 401) {
          const result = await refresh();
          if (result.ok) setFarmRetryNonce((current) => current + 1);
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setFarmState("blocked");
          setFarmError("Sua conta não tem permissão para acessar esta galeria.");
          return;
        }
        if (error instanceof ApiError && error.status === 404 && birdId) {
          setBirdId("");
          setGalleryError("A ave selecionada não está mais disponível. Exibindo todas as mídias.");
          return;
        }
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          setFarmState("blocked");
          setFarmError("A seleção do criatório mudou. Selecione um criatório novamente para abrir a galeria.");
          return;
        }
        setGalleryState("error");
        setGalleryError(error instanceof ApiError && error.status >= 500
          ? "O serviço está indisponível no momento. Tente novamente em instantes."
          : "Não foi possível carregar a galeria. Verifique sua conexão e tente novamente.");
      }
    }

    void loadGallery();
    return () => { controller.abort(); };
  }, [birdId, farmId, galleryNonce, limits?.defaultPageSize, mediaType, page, refresh]);

  useEffect(() => {
    const selectedFarmId = farmId;
    if (!selectedFarmId) return;
    const requestId = ++birdRequestId.current;
    const controller = new AbortController();
    setBirdLoadState("loading");

    async function loadBirdOptions() {
      try {
        const allBirds: BirdListResponse["items"] = [];
        let currentPage = 1;
        let totalPages = 1;
        do {
          const params = new URLSearchParams({ page: String(currentPage), pageSize: "100", sortBy: "name", sortDirection: "asc" });
          const response = await client.current!.request<BirdListResponse>(`api/birds?${params.toString()}`, { signal: controller.signal });
          if (controller.signal.aborted || requestId !== birdRequestId.current) return;
          if (!sameTenantId(response.breedingFarmId, selectedFarmId!)) throw new StaleTenantResponseError();
          allBirds.push(...response.items);
          totalPages = response.totalPages;
          currentPage += 1;
        } while (currentPage <= totalPages);
        if (controller.signal.aborted || requestId !== birdRequestId.current) return;
        setBirds(allBirds);
        setBirdLoadState("ready");
      } catch (error) {
        if (controller.signal.aborted || requestId !== birdRequestId.current || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && error.status === 401) {
          const result = await refresh();
          if (result.ok) setFarmRetryNonce((current) => current + 1);
          return;
        }
        setBirdLoadState("error");
      }
    }

    void loadBirdOptions();
    return () => { controller.abort(); };
  }, [birdRetryNonce, farmId, refresh]);

  async function fetchCsrfToken(): Promise<void> {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }

  async function handleActionFailure(error: unknown, operation: "caption" | "delete" | "upload", item?: GalleryMedia): Promise<void> {
    if (error instanceof ApiError && error.status === 401) {
      csrfToken.current = undefined;
      const result = await refresh();
      if (result.ok) setFarmRetryNonce((current) => current + 1);
      return;
    }
    setActionError(getActionError(error, operation, item));
    setActionSuccess(undefined);
  }

  function invalidateGalleryCache(): void {
    client.current?.clearCache();
    setGalleryNonce((current) => current + 1);
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedFile || !limits || isUploading) return;
    setActionError(undefined);
    setActionSuccess(undefined);

    const acceptedTypes = [...limits.supportedImageContentTypes, ...limits.supportedVideoContentTypes];
    if (!acceptedTypes.includes(selectedFile.type)) {
      setActionError("Escolha uma foto ou vídeo em um formato aceito pela galeria.");
      return;
    }
    const maxFileLength = selectedFile.type.startsWith("video/") ? limits.maxVideoFileLength : limits.maxImageFileLength;
    if (selectedFile.size <= 0 || selectedFile.size > maxFileLength) {
      setActionError(`O arquivo deve ter entre 1 byte e ${formatFileSize(maxFileLength)}.`);
      return;
    }
    if (uploadCaption.length > limits.maxCaptionLength) {
      setActionError(`A legenda deve ter no máximo ${limits.maxCaptionLength} caracteres.`);
      return;
    }

    setIsUploading(true);
    try {
      await fetchCsrfToken();
      const form = new FormData();
      form.set("file", selectedFile);
      const caption = uploadCaption.trim();
      if (caption) form.set("caption", caption);
      await client.current!.request<GalleryMedia>("api/breeding-farms/gallery", { body: form, method: "POST" });
      setSelectedFile(undefined);
      setUploadCaption("");
      if (fileInput.current) fileInput.current.value = "";
      setActionSuccess("A mídia foi adicionada à galeria.");
      invalidateGalleryCache();
    } catch (error) {
      await handleActionFailure(error, "upload");
    } finally {
      setIsUploading(false);
    }
  }

  async function saveCaption(item: GalleryMedia, value: string): Promise<boolean> {
    if (!limits || savingMediaId) return false;
    if (value.length > limits.maxCaptionLength) {
      setActionError(`A legenda deve ter no máximo ${limits.maxCaptionLength} caracteres.`);
      return false;
    }
    setActionError(undefined);
    setActionSuccess(undefined);
    setSavingMediaId(item.mediaId);
    try {
      await fetchCsrfToken();
      const updated = await client.current!.request<GalleryMedia>(`api/breeding-farms/gallery/${encodeURIComponent(item.mediaId)}`, {
        body: JSON.stringify({ caption: value.trim() || null }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      client.current?.clearCache();
      setMedia((current) => current.map((candidate) => candidate.mediaId === updated.mediaId ? updated : candidate));
      setActionSuccess("A legenda foi atualizada.");
      return true;
    } catch (error) {
      await handleActionFailure(error, "caption", item);
      return false;
    } finally {
      setSavingMediaId(undefined);
    }
  }

  async function deleteMedia(item: GalleryMedia): Promise<void> {
    if (item.isPrimary || deletingMediaId) return;
    const confirmed = window.confirm(`Remover “${item.caption || item.fileName}” da galeria? Essa ação também remove a mídia associada à ave, quando houver.`);
    if (!confirmed) return;
    setActionError(undefined);
    setActionSuccess(undefined);
    setDeletingMediaId(item.mediaId);
    try {
      await fetchCsrfToken();
      await client.current!.request<void>(`api/breeding-farms/gallery/${encodeURIComponent(item.mediaId)}`, { method: "DELETE" });
      setMedia((current) => current.filter((candidate) => candidate.mediaId !== item.mediaId));
      setTotalCount((current) => Math.max(0, current - 1));
      setActionSuccess("A mídia foi removida da galeria e da ficha da ave, quando vinculada.");
      invalidateGalleryCache();
    } catch (error) {
      await handleActionFailure(error, "delete", item);
    } finally {
      setDeletingMediaId(undefined);
    }
  }

  function changeMediaType(event: ChangeEvent<HTMLSelectElement>): void {
    setMediaType(event.target.value as MediaFilter);
    setPage(1);
    setActionError(undefined);
    setActionSuccess(undefined);
  }

  function changeBird(event: ChangeEvent<HTMLSelectElement>): void {
    setBirdId(event.target.value);
    setPage(1);
    setActionError(undefined);
    setActionSuccess(undefined);
  }

  function retryGallery(): void {
    setGalleryError(undefined);
    client.current?.clearCache();
    setGalleryNonce((current) => current + 1);
  }

  if (farmState === "loading") return <AppLoadingState activeNav="farm" email={email} label="Carregando sua galeria" message="Buscando o criatório selecionado e suas mídias." />;
  if (farmState === "blocked") return <GalleryStateCard actionHref={farmError?.startsWith("Crie") ? "/onboarding/criatorio" : "/onboarding/criatorio/selecionar"} actionLabel={farmError?.startsWith("Crie") ? "Criar meu criatório" : "Selecionar criatório"} email={email} heading={farmError?.startsWith("Crie") ? "Crie seu primeiro criatório" : "Selecione um criatório"} message={farmError ?? "Escolha um criatório para continuar."} />;
  if (farmState === "error") return <GalleryStateCard email={email} heading="Não foi possível abrir a galeria" message={farmError ?? "Verifique sua conexão e tente novamente."} onRetry={() => setFarmRetryNonce((current) => current + 1)} />;

  const supportedTypes = limits ? [...limits.supportedImageContentTypes, ...limits.supportedVideoContentTypes] : [];
  const pageSize = limits?.defaultPageSize ?? 25;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = Boolean(mediaType || birdId);

  return (
    <AuthenticatedShell activeNav="farm" email={email} farmName={farmName}>
      <div className="farm-view farm-gallery-view">
        <nav aria-label="Navegação estrutural" className="farm-breadcrumb">
          <Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/configuracoes/criatorio">Meu Criatório</Link><span aria-hidden="true">›</span><span aria-current="page">Galeria</span>
        </nav>

        <section aria-label="Seções do criatório" className="farm-profile farm-gallery-header-card">
          <header className="farm-gallery-heading">
            <div><p className="eyebrow">{farmName}</p><h1>Galeria</h1><p>Fotos e vídeos do criatório, em um só lugar.</p></div>
          </header>
          <nav aria-label="Seções do criatório" className="farm-tabs">
            <Link href="/configuracoes/criatorio">Informações</Link>
            <Link aria-current="page" href="/configuracoes/criatorio/galeria">Galeria</Link>
          </nav>
        </section>

        {actionError && <p className="farm-gallery-feedback farm-gallery-feedback-error" role="alert">{actionError}</p>}
        {actionSuccess && <p className="farm-gallery-feedback farm-gallery-feedback-success" role="status">{actionSuccess}</p>}

        <section aria-labelledby="gallery-upload-heading" className="farm-gallery-panel">
          <div className="farm-gallery-panel-heading"><div><h2 id="gallery-upload-heading">Adicionar mídia</h2><p>Envie uma foto ou um vídeo para este criatório. A mídia não será vinculada a uma ave.</p></div></div>
          <form aria-busy={isUploading} className="farm-gallery-upload-form" onSubmit={(event) => void uploadMedia(event)}>
            <div className="farm-gallery-upload-fields">
              <div className="farm-gallery-field farm-gallery-file-field">
                <label htmlFor="gallery-file">Foto ou vídeo</label>
                <input
                  accept={supportedTypes.join(",")}
                  disabled={!limits || isUploading}
                  id="gallery-file"
                  onChange={(event) => { setSelectedFile(event.target.files?.[0]); setActionError(undefined); }}
                  ref={fileInput}
                  type="file"
                />
                <small>{selectedFile ? `${selectedFile.name} · ${formatFileSize(selectedFile.size)}` : limits ? `Imagens até ${formatFileSize(limits.maxImageFileLength)} e vídeos até ${formatFileSize(limits.maxVideoFileLength)}.` : "Carregando limites de arquivo…"}</small>
              </div>
              <div className="farm-gallery-field">
                <label htmlFor="gallery-caption">Legenda <span>(opcional)</span></label>
                <input
                  disabled={!limits || isUploading}
                  id="gallery-caption"
                  maxLength={limits?.maxCaptionLength}
                  onChange={(event) => setUploadCaption(event.target.value)}
                  placeholder="Conte um pouco sobre esta mídia"
                  value={uploadCaption}
                />
                {limits && <small>{uploadCaption.length}/{limits.maxCaptionLength} caracteres</small>}
              </div>
            </div>
            <div className="farm-gallery-upload-actions">
              <button className="farm-gallery-primary-action" disabled={!selectedFile || !limits || isUploading} type="submit">{isUploading ? "Enviando mídia…" : "Adicionar à galeria"}</button>
            </div>
            {isUploading && <div aria-live="polite" className="farm-gallery-upload-progress" role="status"><progress aria-label="Progresso do envio" /><span>Enviando mídia com segurança…</span></div>}
          </form>
        </section>

        <section aria-labelledby="gallery-list-heading" className="farm-gallery-panel">
          <div className="farm-gallery-list-heading">
            <div><h2 id="gallery-list-heading">Mídias do criatório</h2><p>{totalCount.toLocaleString("pt-BR")} {totalCount === 1 ? "item" : "itens"}</p></div>
            <div className="farm-gallery-filters">
              <label htmlFor="gallery-type-filter">Tipo
                <select id="gallery-type-filter" onChange={changeMediaType} value={mediaType}>
                  <option value="">Todas</option><option value="image">Fotos</option><option value="video">Vídeos</option>
                </select>
              </label>
              <label htmlFor="gallery-bird-filter">Ave
                <select disabled={birdLoadState !== "ready"} id="gallery-bird-filter" onChange={changeBird} value={birdId}>
                  <option value="">Todas as aves</option>
                  {birds.map((bird) => <option key={bird.birdId} value={bird.birdId}>{bird.name}{bird.ringNumber ? ` · ${bird.ringNumber}` : ""}</option>)}
                </select>
              </label>
              {(mediaType || birdId) && media.length > 0 && <button className="farm-gallery-clear-filter" onClick={() => { setMediaType(""); setBirdId(""); setPage(1); }} type="button">Limpar filtros</button>}
            </div>
          </div>

          {birdLoadState === "error" && <p className="farm-gallery-filter-warning" role="status">Não foi possível carregar a lista de aves. <button onClick={() => setBirdRetryNonce((current) => current + 1)} type="button">Tentar novamente</button></p>}
          {galleryError && <p className="farm-gallery-feedback farm-gallery-feedback-error" role="alert">{galleryError}</p>}
          {galleryState === "loading" && <AppLoadingContent label="Carregando mídias" message="Consultando fotos e vídeos do criatório." />}
          {galleryState === "error" && <div className="farm-gallery-retry"><button className="farm-gallery-secondary-action" onClick={retryGallery} type="button">Tentar novamente</button></div>}
          {galleryState === "ready" && media.length === 0 && (
            <div className="farm-gallery-empty">
              <span aria-hidden="true">▧</span>
              <h3>{hasActiveFilters ? "Nenhuma mídia encontrada" : "Sua galeria está vazia"}</h3>
              <p>{hasActiveFilters ? "Tente alterar os filtros ou escolha outra ave." : "Adicione fotos ou vídeos para registrar os momentos e espaços do seu criatório."}</p>
              {hasActiveFilters
                ? <button className="farm-gallery-secondary-action" onClick={() => { setMediaType(""); setBirdId(""); setPage(1); }} type="button">Limpar filtros</button>
                : <button className="farm-gallery-primary-action" onClick={() => fileInput.current?.click()} type="button">Adicionar primeira mídia</button>}
            </div>
          )}
          {galleryState === "ready" && media.length > 0 && (
            <>
              <div aria-busy={isUploading || Boolean(savingMediaId) || Boolean(deletingMediaId)} className="farm-gallery-grid">
                {media.map((item) => <GalleryMediaCard deleting={deletingMediaId === item.mediaId} key={item.mediaId} maxCaptionLength={limits?.maxCaptionLength ?? 0} media={item} onDelete={(entry) => void deleteMedia(entry)} onSaveCaption={(entry, caption) => saveCaption(entry, caption)} savingCaption={savingMediaId === item.mediaId} />)}
              </div>
              {pageCount > 1 && <nav aria-label="Paginação da galeria" className="farm-gallery-pagination"><button className="farm-gallery-secondary-action" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Anterior</button><span>Página {page} de {pageCount}</span><button className="farm-gallery-secondary-action" disabled={!hasNextPage} onClick={() => setPage((current) => current + 1)} type="button">Próxima</button></nav>}
            </>
          )}
        </section>
        <p className="farm-page-footer">A Galeria reúne mídias do criatório e mídias vinculadas às aves sem duplicar arquivos.</p>
      </div>
    </AuthenticatedShell>
  );
}

function FarmGalleryRoute() {
  const { error, refresh, session, status } = useAuth();

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="farm" email={session?.email} label="Verificando seu acesso" message="Só um instante enquanto abrimos a galeria." />;
  }
  if (status === "error") return <GalleryStateCard email={session?.email ?? ""} heading="Não foi possível consultar a sessão" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <GalleryStateCard email={session?.email ?? ""} heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} />;
  if (status === "unauthenticated" || !session) return <SessionRecovery />;
  return <FarmGalleryScreen email={session.email} />;
}

export default function BreedingFarmGalleryPage() {
  return <AuthProvider><FarmGalleryRoute /></AuthProvider>;
}
