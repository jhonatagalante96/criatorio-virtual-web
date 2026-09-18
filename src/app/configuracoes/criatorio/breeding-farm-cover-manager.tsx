"use client";

import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient, getApiUrl } from "../../../lib/http/api-client";
import { CoverConfiguration, CoverTemplate, CoverTemplateLoadState, CoverTemplatePicker } from "./cover-template-picker";

const coversPath = "api/breeding-farms";
const templatesPath = "api/breeding-farm-cover-templates";
const fallbackCover = "/assets/imagery/birds/bird-flock-hd.webp";
const maxFileLength = 8 * 1024 * 1024;

interface CoverItem {
  contentType: string;
  contentUrl: string;
  fileName: string;
  length: number;
  source: string;
  templateConfiguration: CoverConfiguration | null;
  templateModelId: string | null;
  templateVersion: number | null;
  updatedAtUtc: string;
}

interface CoverResponse {
  breedingFarmId: string;
  cover: CoverItem | null;
}

type LoadState = "error" | "loading" | "ready";
type CoverMode = "onboarding" | "profile";

function fileTypeError(file: File): string | undefined {
  if (file.size <= 0) return "O arquivo selecionado está vazio.";
  if (file.size > maxFileLength) return "A imagem deve ter no máximo 8 MiB.";
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("pt-BR");
  const isPng = file.type.toLocaleLowerCase("pt-BR") === "image/png" && extension === "png";
  const isJpeg = file.type.toLocaleLowerCase("pt-BR") === "image/jpeg" && (extension === "jpg" || extension === "jpeg");
  const isWebp = file.type.toLocaleLowerCase("pt-BR") === "image/webp" && extension === "webp";
  if (!isPng && !isJpeg && !isWebp) return "Escolha uma imagem PNG, JPEG ou WebP com extensão compatível.";
  return undefined;
}

export function validateCoverDimensions(width: number, height: number): boolean {
  return width >= 1200 && height >= 400;
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const image = await createImageBitmap(file);
    const dimensions = { width: image.width, height: image.height };
    image.close();
    return dimensions;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("invalid_image"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function requestErrorMessage(error: unknown, action: "apply" | "load" | "preview" | "remove" | "upload"): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a tela antes de continuar.";
  if (!(error instanceof ApiError)) return "Verifique sua conexão e tente novamente.";
  if (error.status === 400) return action === "apply" || action === "preview"
    ? "A configuração não foi aceita. Confira as opções do modelo e tente novamente."
    : "A imagem não foi aceita. Escolha PNG, JPEG ou WebP de até 8 MiB e com pelo menos 1200 × 400 pixels.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 403) return "Sua conta não tem permissão para alterar a capa deste criatório.";
  if (error.status === 404) return action === "load"
    ? "Não foi possível localizar a capa deste criatório."
    : action === "preview" || action === "apply"
      ? "Este modelo não está mais disponível. Escolha um modelo atual e atualize a prévia."
      : "O criatório ou a capa não foi encontrada.";
  if (error.status === 409) return "Este modelo ou versão não está mais disponível. Escolha outro modelo e atualize a prévia.";
  if (error.status === 503) return action === "preview"
    ? "Não foi possível gerar a prévia agora. Tente novamente em instantes."
    : action === "apply"
      ? "A capa não pôde ser aplicada agora. Tente novamente em instantes."
      : "O armazenamento está indisponível no momento. Tente novamente em instantes.";
  if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível concluir esta ação. Tente novamente.";
}

function getTemplateLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para ver os modelos.";
  return "Não foi possível carregar os modelos de capa. Tente novamente.";
}

function getTemplateConfiguration(template: CoverTemplate, farmName: string): CoverConfiguration {
  const configuration: CoverConfiguration = {};
  for (const key of template.supportedOptions) {
    const value = template.defaults[key];
    if (typeof value === "string" || typeof value === "boolean" || value === null) configuration[key] = value;
    else if (key === "showLogo" || key === "showBadge") configuration[key] = false;
    else if (key === "logoAssetId") configuration[key] = null;
    else if (key === "accentColor") configuration[key] = "#48643A";
    else configuration[key] = "";
  }
  if (template.supportedOptions.includes("name")) configuration.name = farmName;
  return configuration;
}

function validateTemplateConfiguration(template: CoverTemplate, configuration: CoverConfiguration): string | undefined {
  const supported = new Set(template.supportedOptions);
  if (!supported.has("name") || typeof configuration.name !== "string" || !configuration.name.trim()) {
    return "Informe o nome do criatório para gerar a prévia.";
  }
  if (configuration.name.length > 80) return "O nome do criatório deve ter no máximo 80 caracteres.";
  if (supported.has("tagline") && (typeof configuration.tagline !== "string" || configuration.tagline.length > 120)) {
    return "A frase de apoio deve ter no máximo 120 caracteres.";
  }
  if (supported.has("badgeText") && (typeof configuration.badgeText !== "string" || configuration.badgeText.length > 32)) {
    return "O texto do selo deve ter no máximo 32 caracteres.";
  }
  if (supported.has("accentColor") && (typeof configuration.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(configuration.accentColor))) {
    return "Escolha uma cor de destaque válida.";
  }
  return undefined;
}

export function BreedingFarmCoverManager({
  breedingFarmId,
  farmName,
  mode = "profile",
  onContinue,
  onApplied
}: Readonly<{
  breedingFarmId: string;
  farmName: string;
  mode?: CoverMode;
  onApplied?: () => void;
  onContinue?: () => void;
}>) {
  const { refresh } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [cover, setCover] = useState<CoverItem | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fileError, setFileError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [templateLoadState, setTemplateLoadState] = useState<CoverTemplateLoadState>("loading");
  const [templates, setTemplates] = useState<CoverTemplate[]>([]);
  const [templateLoadError, setTemplateLoadError] = useState<string>();
  const [templateReloadNonce, setTemplateReloadNonce] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>();
  const [templateConfiguration, setTemplateConfiguration] = useState<CoverConfiguration>({});
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string>();
  const [templatePreviewSignature, setTemplatePreviewSignature] = useState<string>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string>();
  const [isMutating, setIsMutating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmApplyTemplate, setConfirmApplyTemplate] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const loadRequestVersion = useRef(0);
  const coverImageObjectUrl = useRef<string | undefined>(undefined);
  const templatePreviewObjectUrl = useRef<string | undefined>(undefined);
  const selectedFilePreviewObjectUrl = useRef<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRequestVersion = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  function replaceObjectUrl(ref: React.MutableRefObject<string | undefined>, setter: (url: string | undefined) => void, url?: string): void {
    if (ref.current && ref.current !== url) URL.revokeObjectURL(ref.current);
    ref.current = url;
    setter(url);
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const currentTemplateSignature = selectedTemplate
    ? JSON.stringify({ modelId: selectedTemplate.id, version: selectedTemplate.version, config: templateConfiguration })
    : undefined;
  const templatePreviewIsCurrent = Boolean(templatePreviewUrl && templatePreviewSignature === currentTemplateSignature);

  useEffect(() => {
    const requestVersion = ++loadRequestVersion.current;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    client.current!.setTenant(breedingFarmId);
    setLoadState("loading");
    setLoadError(undefined);

    async function loadCover(): Promise<void> {
      let imageObjectUrl: string | undefined;
      try {
        const response = await client.current!.request<CoverResponse>(`${coversPath}/${encodeURIComponent(breedingFarmId)}/cover`, { signal: controller.signal });
        if (response.cover?.contentUrl) {
          const blob = await client.current!.requestBlob(response.cover.contentUrl, {
            accept: response.cover.contentType || "image/*",
            signal: controller.signal
          });
          imageObjectUrl = URL.createObjectURL(blob);
        }
        if (cancelled || requestVersion !== loadRequestVersion.current) {
          if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
          return;
        }
        replaceObjectUrl(coverImageObjectUrl, setCoverImageUrl, imageObjectUrl);
        setCover(response.cover);
        setLoadState("ready");
      } catch (error) {
        if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
        if (cancelled || requestVersion !== loadRequestVersion.current || error instanceof StaleTenantResponseError || (error instanceof DOMException && error.name === "AbortError")) return;
        if (error instanceof ApiError && error.status === 401) {
          const result = await refresh();
          if (!cancelled && result.ok) {
            setReloadNonce((current) => current + 1);
            return;
          }
        }
        setLoadError(requestErrorMessage(error, "load"));
        setLoadState("error");
      }
    }

    void loadCover();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
      if (coverImageObjectUrl.current) {
        URL.revokeObjectURL(coverImageObjectUrl.current);
        coverImageObjectUrl.current = undefined;
      }
    };
  }, [breedingFarmId, refresh, reloadNonce]);

  useEffect(() => {
    if (!dialogOpen || !showTemplatePicker) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    client.current!.setTenant(breedingFarmId);
    setTemplateLoadState("loading");
    setTemplateLoadError(undefined);
    setTemplates([]);
    setSelectedTemplateId(undefined);
    setTemplateConfiguration({});
    replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl);
    setTemplatePreviewSignature(undefined);

    async function loadTemplates(): Promise<void> {
      try {
        const catalog = await client.current!.request<CoverTemplate[]>(templatesPath, { signal: controller.signal });
        if (cancelled) return;
        setTemplates(catalog);
        setTemplateLoadState("ready");
      } catch (error) {
        if (cancelled || error instanceof StaleTenantResponseError || (error instanceof DOMException && error.name === "AbortError")) return;
        if (error instanceof ApiError && error.status === 401) {
          const result = await refresh();
          if (!cancelled && result.ok) {
            setTemplateReloadNonce((current) => current + 1);
            return;
          }
        }
        setTemplateLoadError(getTemplateLoadError(error));
        setTemplateLoadState("error");
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [breedingFarmId, dialogOpen, refresh, showTemplatePicker, templateReloadNonce]);

  useEffect(() => {
    if (!dialogOpen || !showTemplatePicker || !selectedTemplate) return;
    const template = selectedTemplate;
    const requestVersion = ++previewRequestVersion.current;
    const signature = JSON.stringify({ modelId: template.id, version: template.version, config: templateConfiguration });
    const validationError = validateTemplateConfiguration(template, templateConfiguration);
    const controller = new AbortController();
    let cancelled = false;
    replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl);
    setTemplatePreviewSignature(undefined);
    if (validationError) {
      setMutationError(validationError);
      setIsPreviewing(false);
      return () => { cancelled = true; controller.abort(); };
    }
    const timer = window.setTimeout(() => {
      setIsPreviewing(true);
      setMutationError(undefined);
      async function preview(): Promise<void> {
        try {
          await ensureAntiforgeryToken();
          const config = Object.fromEntries(template.supportedOptions.map((key) => [key, templateConfiguration[key]]));
          const blob = await client.current!.requestBlob(`${templatesPath}/${encodeURIComponent(template.id)}/preview`, {
            accept: "image/png",
            body: JSON.stringify({ version: template.version, config }),
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: controller.signal
          });
          if (cancelled || requestVersion !== previewRequestVersion.current) return;
          const objectUrl = URL.createObjectURL(blob);
          replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl, objectUrl);
          setTemplatePreviewSignature(signature);
        } catch (error) {
          if (cancelled || requestVersion !== previewRequestVersion.current || error instanceof StaleTenantResponseError || (error instanceof DOMException && error.name === "AbortError")) return;
          await handleMutationError(error, "preview");
        } finally {
          if (!cancelled && requestVersion === previewRequestVersion.current) setIsPreviewing(false);
        }
      }
      void preview();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dialogOpen, showTemplatePicker, selectedTemplate, templateConfiguration]);

  useEffect(() => () => {
    if (coverImageObjectUrl.current) URL.revokeObjectURL(coverImageObjectUrl.current);
    if (templatePreviewObjectUrl.current) URL.revokeObjectURL(templatePreviewObjectUrl.current);
    if (selectedFilePreviewObjectUrl.current) URL.revokeObjectURL(selectedFilePreviewObjectUrl.current);
  }, []);

  useEffect(() => {
    if (!dialogOpen && !confirmUpload && !confirmRemove) return;
    function handleDialogKeys(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isMutating) {
        closeDialog();
        setConfirmUpload(false);
        setConfirmRemove(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".farm-cover-dialog-backdrop");
      const controls = dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])");
      if (!controls?.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls[controls.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
        event.preventDefault();
        controls[0].focus();
      }
    }
    window.addEventListener("keydown", handleDialogKeys);
    return () => window.removeEventListener("keydown", handleDialogKeys);
  }, [confirmRemove, confirmUpload, dialogOpen, isMutating]);

  async function ensureAntiforgeryToken(): Promise<void> {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }

  function openDialog(): void {
    setMutationError(undefined);
    setFileError(undefined);
    setDialogOpen(true);
    setShowTemplatePicker(false);
  }

  function closeDialog(): void {
    setDialogOpen(false);
    setShowTemplatePicker(false);
    setConfirmApplyTemplate(false);
    setIsPreviewing(false);
  }

  function selectTemplate(template: CoverTemplate): void {
    setSelectedTemplateId(template.id);
    setTemplateConfiguration(getTemplateConfiguration(template, farmName));
    replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl);
    setTemplatePreviewSignature(undefined);
    setMutationError(undefined);
  }

  function changeTemplateOption(key: string, value: string | boolean | null): void {
    setTemplateConfiguration((current) => ({ ...current, [key]: value }));
    replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl);
    setTemplatePreviewSignature(undefined);
    setMutationError(undefined);
  }

  async function handleMutationError(error: unknown, action: "apply" | "preview" | "remove" | "upload"): Promise<void> {
    if (error instanceof ApiError && (action === "preview" || action === "apply") && (error.status === 404 || error.status === 409)) {
      setConfirmApplyTemplate(false);
      setSelectedTemplateId(undefined);
      setTemplateConfiguration({});
      replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl);
      setTemplatePreviewSignature(undefined);
      client.current!.clearCache();
      setTemplateReloadNonce((current) => current + 1);
    }
    if (error instanceof ApiError && error.status === 401) {
      const result = await refresh();
      if (result.ok) setReloadNonce((current) => current + 1);
    }
    setMutationError(requestErrorMessage(error, action));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setMutationError(undefined);
    setSuccessMessage(undefined);
    setFileError(undefined);
    const invalidType = fileTypeError(file);
    if (invalidType) {
      setFileError(invalidType);
      return;
    }
    try {
      const dimensions = await imageDimensions(file);
      if (!validateCoverDimensions(dimensions.width, dimensions.height)) {
        setFileError("A imagem deve ter pelo menos 1200 × 400 pixels.");
        return;
      }
    } catch {
      setFileError("Não foi possível ler a imagem. Escolha outro arquivo e tente novamente.");
      return;
    }
    setSelectedFile(file);
    replaceObjectUrl(selectedFilePreviewObjectUrl, setSelectedFilePreviewUrl, URL.createObjectURL(file));
    closeDialog();
    setConfirmUpload(true);
  }

  async function applyUpload(): Promise<void> {
    if (!selectedFile) return;
    setIsMutating(true);
    setMutationError(undefined);
    try {
      await ensureAntiforgeryToken();
      const body = new FormData();
      body.append("file", selectedFile, selectedFile.name);
      await client.current!.request<CoverResponse>(`${coversPath}/${encodeURIComponent(breedingFarmId)}/cover/upload`, { body, method: "PUT" });
      client.current!.clearCache();
      setConfirmUpload(false);
      setSelectedFile(undefined);
      replaceObjectUrl(selectedFilePreviewObjectUrl, setSelectedFilePreviewUrl);
      setSuccessMessage("Capa atualizada com sucesso.");
      setReloadNonce((current) => current + 1);
      onApplied?.();
    } catch (error) {
      await handleMutationError(error, "upload");
    } finally {
      setIsMutating(false);
    }
  }

  async function applyTemplate(): Promise<void> {
    if (!selectedTemplate || !templatePreviewIsCurrent) return;
    setIsMutating(true);
    setMutationError(undefined);
    try {
      await ensureAntiforgeryToken();
      const config = Object.fromEntries(selectedTemplate.supportedOptions.map((key) => [key, templateConfiguration[key]]));
      await client.current!.request<CoverResponse>(`${coversPath}/${encodeURIComponent(breedingFarmId)}/cover/template`, {
        body: JSON.stringify({ modelId: selectedTemplate.id, version: selectedTemplate.version, config }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      client.current!.clearCache();
      setConfirmApplyTemplate(false);
      setSelectedTemplateId(undefined);
      setTemplateConfiguration({});
      replaceObjectUrl(templatePreviewObjectUrl, setTemplatePreviewUrl);
      setTemplatePreviewSignature(undefined);
      closeDialog();
      setSuccessMessage("Modelo de capa aplicado com sucesso.");
      setReloadNonce((current) => current + 1);
      onApplied?.();
    } catch (error) {
      await handleMutationError(error, "apply");
    } finally {
      setIsMutating(false);
    }
  }

  async function removeCover(): Promise<void> {
    setIsMutating(true);
    setMutationError(undefined);
    try {
      await ensureAntiforgeryToken();
      await client.current!.request<CoverResponse>(`${coversPath}/${encodeURIComponent(breedingFarmId)}/cover`, { method: "DELETE" });
      client.current!.clearCache();
      setConfirmRemove(false);
      setSuccessMessage("Capa removida. A imagem padrão será exibida.");
      setReloadNonce((current) => current + 1);
    } catch (error) {
      await handleMutationError(error, "remove");
    } finally {
      setIsMutating(false);
    }
  }

  const isOnboarding = mode === "onboarding";
  const previewSource = coverImageUrl ?? fallbackCover;

  return (
    <>
      <div className={isOnboarding ? "farm-cover-onboarding-preview" : "farm-profile-cover"}>
        <img alt={coverImageUrl ? `Capa atual de ${farmName}` : `Imagem padrão de capa para ${farmName}`} src={previewSource} />
        <button className="farm-cover-action" disabled={loadState === "loading"} onClick={openDialog} type="button">
          {cover ? "Alterar foto de capa" : "Configurar capa"}
        </button>
      </div>
      {successMessage && <span className="sr-only" role="status">{successMessage}</span>}
      {isOnboarding && loadState === "error" && <p className="farm-cover-load-error" role="alert">{loadError} <button className="farm-cover-retry" onClick={() => setReloadNonce((current) => current + 1)} type="button">Tentar novamente</button></p>}
      {isOnboarding && (
        <div className="farm-cover-onboarding-actions">
          <p className="farm-identity-onboarding-note">{cover
            ? "Esta capa já está aplicada. Você pode mantê-la ou escolher outra antes de continuar."
            : "Envie uma imagem ou escolha um modelo. A capa pode ser configurada depois em Meu Criatório."}</p>
          <button className="auth-primary-action" disabled={isMutating} onClick={onContinue} type="button">
            {cover ? "Manter esta capa e continuar para a assinatura" : "Configurar depois e continuar para a assinatura"}
          </button>
        </div>
      )}
      {!isOnboarding && loadState === "error" && <p className="farm-cover-load-error" role="alert">{loadError} <button className="farm-cover-retry" onClick={() => setReloadNonce((current) => current + 1)} type="button">Tentar novamente</button></p>}

      <input
        accept="image/png,image/jpeg,image/webp"
        aria-label="Enviar imagem de capa"
        className="farm-identity-file-input"
        onChange={(event) => void handleFileChange(event)}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      {dialogOpen && (
        <div className="farm-identity-dialog-backdrop farm-cover-dialog-backdrop">
          <section aria-labelledby={confirmApplyTemplate ? "titulo-confirmar-modelo-capa" : "farm-cover-dialog-title"} aria-modal="true" className="farm-identity-dialog farm-identity-chooser-dialog farm-cover-dialog" role="dialog">
            <header className="farm-identity-dialog-heading">
              <div><h3 id="farm-cover-dialog-title">Alterar capa do criatório</h3><p>Escolha uma imagem ou use um modelo oficial.</p></div>
              <button aria-label="Fechar" className="farm-identity-dialog-close" onClick={closeDialog} type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg></button>
            </header>
            {mutationError && !showTemplatePicker && <p className="form-error" role="alert">{mutationError}</p>}
            {fileError && <p className="form-error" role="alert">{fileError}</p>}
            {loadState === "error" && <div className="farm-identity-feedback"><p role="alert">{loadError}</p><button className="farm-identity-secondary-action" onClick={() => setReloadNonce((current) => current + 1)} type="button">Tentar novamente</button></div>}
            {!showTemplatePicker ? (
              <div className="farm-identity-chooser-options">
                <button autoFocus className="farm-identity-chooser-option" onClick={() => fileInputRef.current?.click()} type="button">
                  <span aria-hidden="true" className="farm-identity-chooser-icon"><svg fill="none" viewBox="0 0 24 24"><path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4v-10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="12" cy="13.2" r="3.1" stroke="currentColor" strokeWidth="1.8"/></svg></span>
                  <span><strong>Enviar minha imagem</strong><small>PNG, JPEG ou WebP · até 8 MiB · mínimo 1200 × 400 pixels.</small></span>
                </button>
                <button className="farm-identity-chooser-option" onClick={() => setShowTemplatePicker(true)} type="button">
                  <span aria-hidden="true" className="farm-identity-chooser-icon"><svg fill="none" viewBox="0 0 24 24"><rect height="15" rx="2" stroke="currentColor" strokeWidth="1.8" width="17" x="3.5" y="4.5"/><circle cx="9" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="m5 18 5-5 3 3 2.5-2.5L19 17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg></span>
                  <span><strong>Escolher um modelo</strong><small>Personalize a prévia antes de aplicar a capa.</small></span>
                </button>
                {cover && <button className="farm-identity-chooser-option" disabled={isMutating} onClick={() => { setMutationError(undefined); setConfirmRemove(true); closeDialog(); }} type="button"><span aria-hidden="true" className="farm-identity-chooser-icon"><svg fill="none" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg></span><span><strong>Remover capa</strong><small>Voltar a usar a imagem padrão do criatório.</small></span></button>}
              </div>
            ) : confirmApplyTemplate && selectedTemplate && templatePreviewUrl && templatePreviewIsCurrent ? (
              <div className="farm-cover-template-confirmation">
                <h4 id="titulo-confirmar-modelo-capa">Aplicar este modelo?</h4>
                <p>O modelo {selectedTemplate.name} será aplicado à capa de {farmName}, usando a prévia e as opções exibidas.</p>
                <img alt={`Prévia de ${selectedTemplate.name} que será aplicada`} className="farm-cover-template-render" src={templatePreviewUrl} />
                {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
                <div className="farm-identity-dialog-actions">
                  <button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmApplyTemplate(false)} type="button">Voltar à prévia</button>
                  <button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyTemplate()} type="button">{isMutating ? "Aplicando…" : "Confirmar aplicação do modelo"}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="farm-identity-template-picker-heading">
                  <button className="farm-identity-secondary-action" onClick={() => { setShowTemplatePicker(false); setIsPreviewing(false); }} type="button">Voltar</button>
                  <div><h4>Escolher um modelo</h4><p>Os modelos e suas opções vêm do catálogo da API.</p></div>
                </div>
                <CoverTemplatePicker
                  configuration={templateConfiguration}
                  error={mutationError}
                  isPreviewing={isPreviewing}
                  loadError={templateLoadError}
                  loadState={templateLoadState}
                  onChangeOption={changeTemplateOption}
                  onRetry={() => setTemplateReloadNonce((current) => current + 1)}
                  onSelect={selectTemplate}
                  previewIsCurrent={templatePreviewIsCurrent}
                  previewUrl={templatePreviewUrl}
                  selectedTemplate={selectedTemplate}
                  selectedTemplateId={selectedTemplateId}
                  templates={templates}
                  toPreviewUrl={getApiUrl}
                />
                {templatePreviewIsCurrent && <button className="farm-identity-primary-action farm-cover-apply-action" disabled={isMutating || isPreviewing} onClick={() => { setMutationError(undefined); setConfirmApplyTemplate(true); }} type="button">Conferir aplicação da capa</button>}
              </>
            )}
          </section>
        </div>
      )}

      {confirmUpload && selectedFile && (
        <div className="farm-identity-dialog-backdrop farm-cover-dialog-backdrop">
          <section aria-labelledby="titulo-confirmar-capa" aria-modal="true" className="farm-identity-dialog farm-cover-upload-confirmation" role="dialog">
            <h3 id="titulo-confirmar-capa">Conferir nova capa</h3>
            <p>Esta imagem será usada como capa de {farmName}.</p>
            <div className="farm-cover-preview-layout farm-cover-upload-preview-layout">
              <figure className="farm-cover-desktop-preview">
                <figcaption>Prévia para desktop · corte central 3:1</figcaption>
                <div className="farm-cover-preview-frame"><img alt={`Prévia da capa ${selectedFile.name} para desktop`} src={selectedFilePreviewUrl} /></div>
              </figure>
              <figure className="farm-cover-mobile-preview">
                <figcaption>Recorte para celular</figcaption>
                <div><img alt="Recorte central da mesma imagem em uma tela de celular" src={selectedFilePreviewUrl} /></div>
              </figure>
            </div>
            <p className="farm-identity-upload-file-name">{selectedFile.name}</p>
            {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
            <div className="farm-identity-dialog-actions">
              <button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => { setConfirmUpload(false); setSelectedFile(undefined); replaceObjectUrl(selectedFilePreviewObjectUrl, setSelectedFilePreviewUrl); }} type="button">Cancelar</button>
              <button className="farm-identity-secondary-action" disabled={isMutating} onClick={() => { setConfirmUpload(false); setSelectedFile(undefined); replaceObjectUrl(selectedFilePreviewObjectUrl, setSelectedFilePreviewUrl); openDialog(); }} type="button">Escolher outra imagem</button>
              <button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyUpload()} type="button">{isMutating ? "Enviando…" : "Confirmar aplicação"}</button>
            </div>
          </section>
        </div>
      )}
      {confirmRemove && (
        <div className="farm-identity-dialog-backdrop farm-cover-dialog-backdrop">
          <section aria-labelledby="titulo-remover-capa" aria-modal="true" className="farm-identity-dialog farm-cover-remove-confirmation" role="dialog">
            <h3 id="titulo-remover-capa">Remover capa?</h3>
            <p>A imagem padrão será exibida no perfil do criatório.</p>
            {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
            <div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmRemove(false)} type="button">Cancelar</button><button className="farm-identity-danger-action" disabled={isMutating} onClick={() => void removeCover()} type="button">{isMutating ? "Removendo…" : "Confirmar remoção"}</button></div>
          </section>
        </div>
      )}
    </>
  );
}
