"use client";

import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient, getApiUrl } from "../../../lib/http/api-client";
import { IdentityTemplate, IdentityTemplateLoadState, IdentityTemplateOption, VisualIdentityTemplatePicker, optionLabel } from "./visual-identity-template-picker";

const visualIdentityPath = "api/breeding-farms/visual-identity";
const visualIdentityTemplatesPath = `${visualIdentityPath}/templates`;
const maxFileLength = 10 * 1024 * 1024;

interface VisualIdentityItem {
  contentType: string | null;
  contentUrl: string | null;
  fileName: string | null;
  length: number | null;
  modelId?: string | null;
  source: string;
  updatedAtUtc: string;
  version?: string | null;
  configuration?: Record<string, string> | null;
}

interface VisualIdentityResponse {
  breedingFarmId: string;
  identity: VisualIdentityItem | null;
}

type LoadState = "error" | "loading" | "ready";

function validateFile(file: File): string | undefined {
  if (file.size <= 0) return "O arquivo selecionado está vazio.";
  if (file.size > maxFileLength) return "A imagem deve ter no máximo 10 MB.";

  const extension = file.name.split(".").pop()?.toLocaleLowerCase("pt-BR");
  const isPng = file.type.toLocaleLowerCase("pt-BR") === "image/png" && extension === "png";
  const isJpeg = file.type.toLocaleLowerCase("pt-BR") === "image/jpeg" && (extension === "jpg" || extension === "jpeg");
  if (!isPng && !isJpeg) return "Escolha uma imagem PNG ou JPEG com extensão compatível.";
  return undefined;
}

function requestErrorMessage(error: unknown, action: "load" | "remove" | "upload" | "preview" | "apply"): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a tela antes de continuar.";
  if (!(error instanceof ApiError)) return "Verifique sua conexão e tente novamente.";
  if (error.status === 400) return action === "preview" || action === "apply"
    ? "A configuração não foi aceita. Confira as opções do modelo e tente novamente."
    : "A imagem não foi aceita. Escolha um arquivo PNG ou JPEG válido de até 10 MB.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 403) return "Sua conta não tem permissão para alterar esta identidade.";
  if (error.status === 404) return action === "load" ? "Não foi possível localizar a identidade deste criatório." : action === "preview" || action === "apply"
    ? "Este modelo não está mais disponível. Escolha um modelo atual e gere uma nova prévia."
    : "O criatório ou a identidade não foi encontrada.";
  if (error.status === 409) return (action === "preview" || action === "apply") && /template|version/i.test(error.message)
    ? "Este modelo ou versão não está mais disponível. Escolha outro modelo e gere uma nova prévia."
    : "Selecione ou atualize o criatório antes de continuar.";
  if (error.status === 503) return action === "preview"
    ? "Não foi possível gerar a prévia do modelo agora. Tente novamente em instantes."
    : action === "apply"
      ? "O modelo não pôde ser aplicado agora. Tente novamente em instantes."
      : "O armazenamento está indisponível no momento. Tente novamente em instantes.";
  if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível concluir esta ação. Tente novamente.";
}

function identityTemplateLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para ver os modelos.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para ver os modelos de identidade.";
  return "Não foi possível carregar os modelos de identidade. Tente novamente.";
}

export function VisualIdentityManager({ actionRef, breedingFarmId, farmName }: Readonly<{ actionRef: React.MutableRefObject<() => void>; breedingFarmId: string; farmName: string }>) {
  const { refresh } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [identity, setIdentity] = useState<VisualIdentityItem | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [templateLoadState, setTemplateLoadState] = useState<IdentityTemplateLoadState>("loading");
  const [templates, setTemplates] = useState<IdentityTemplate[]>([]);
  const [templateLoadError, setTemplateLoadError] = useState<string>();
  const [templateReloadNonce, setTemplateReloadNonce] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>();
  const [templateConfiguration, setTemplateConfiguration] = useState<Record<string, string>>({});
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string>();
  const [templatePreviewSignature, setTemplatePreviewSignature] = useState<string>();
  const [isMutating, setIsMutating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmApplyTemplate, setConfirmApplyTemplate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);
  const currentImageObjectUrl = useRef<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    const openAction = () => {
      setMutationError(undefined);
      setFileError(undefined);
      setIdentityDialogOpen(true);
      setShowTemplatePicker(false);
    };
    actionRef.current = openAction;
    return () => {
      if (actionRef.current === openAction) actionRef.current = () => {};
    };
  }, [actionRef]);

  useEffect(() => {
    const currentRequest = requestVersion.current + 1;
    requestVersion.current = currentRequest;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    client.current!.setTenant(breedingFarmId);
    setLoadState("loading");
    setLoadError(undefined);

    async function loadIdentity() {
      let imageObjectUrl: string | undefined;
      try {
        const response = await client.current!.request<VisualIdentityResponse>(visualIdentityPath, { signal: controller.signal });
        if (response.identity?.contentUrl) {
          const image = await client.current!.requestBlob(response.identity.contentUrl, {
            accept: response.identity.contentType ?? "image/*",
            signal: controller.signal
          });
          imageObjectUrl = URL.createObjectURL(image);
        }
        if (cancelled || currentRequest !== requestVersion.current) {
          if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
          return;
        }
        if (currentImageObjectUrl.current) URL.revokeObjectURL(currentImageObjectUrl.current);
        currentImageObjectUrl.current = imageObjectUrl;
        setCurrentImageUrl(imageObjectUrl);
        setIdentity(response.identity);
        setLoadState("ready");
      } catch (error) {
        if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
        if (cancelled || currentRequest !== requestVersion.current || error instanceof StaleTenantResponseError) return;
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

    void loadIdentity();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
      if (currentImageObjectUrl.current) {
        URL.revokeObjectURL(currentImageObjectUrl.current);
        currentImageObjectUrl.current = undefined;
      }
    };
  }, [breedingFarmId, refresh, reloadNonce]);

  useEffect(() => {
    if (!identityDialogOpen || !showTemplatePicker) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    client.current!.setTenant(breedingFarmId);
    setTemplateLoadState("loading");
    setTemplateLoadError(undefined);
    setTemplates([]);
    setSelectedTemplateId(undefined);
    setTemplateConfiguration({});
    setTemplatePreviewUrl(undefined);
    setTemplatePreviewSignature(undefined);

    async function loadTemplates() {
      try {
        const catalog = await client.current!.request<IdentityTemplate[]>(visualIdentityTemplatesPath, { signal: controller.signal });
        if (cancelled) return;
        setTemplates(catalog);
        setTemplateLoadState("ready");
      } catch (error) {
        if (cancelled || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && error.status === 401) {
          const result = await refresh();
          if (!cancelled && result.ok) {
            setTemplateReloadNonce((current) => current + 1);
            return;
          }
        }
        setTemplateLoadError(identityTemplateLoadError(error));
        setTemplateLoadState("error");
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [breedingFarmId, identityDialogOpen, refresh, showTemplatePicker, templateReloadNonce]);

  useEffect(() => () => {
    if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  }, [selectedPreviewUrl]);

  useEffect(() => () => {
    if (templatePreviewUrl) URL.revokeObjectURL(templatePreviewUrl);
  }, [templatePreviewUrl]);

  useEffect(() => {
    if (!identityDialogOpen && !confirmApply && !confirmApplyTemplate && !confirmRemove) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isMutating) {
        setIdentityDialogOpen(false);
        setShowTemplatePicker(false);
        setConfirmApply(false);
        setConfirmApplyTemplate(false);
        setConfirmRemove(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".farm-identity-dialog-backdrop");
      const controls = dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmApply, confirmApplyTemplate, confirmRemove, identityDialogOpen, isMutating]);

  async function ensureAntiforgeryToken(): Promise<void> {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  function templatePayload(template: IdentityTemplate, values: Record<string, string>): Record<string, string> {
    return Object.fromEntries(template.options.map((option) => [option.key, values[option.key]?.trim() || option.default]));
  }

  function currentTemplateSignature(): string | undefined {
    if (!selectedTemplate) return undefined;
    return JSON.stringify({
      templateId: selectedTemplate.id,
      version: selectedTemplate.version,
      config: templatePayload(selectedTemplate, templateConfiguration)
    });
  }

  function selectTemplate(template: IdentityTemplate): void {
    setSelectedFile(undefined);
    setSelectedPreviewUrl(undefined);
    setFileError(undefined);
    setSelectedTemplateId(template.id);
    setTemplateConfiguration(Object.fromEntries(template.options.map((option) => [option.key, option.default])));
    setTemplatePreviewUrl(undefined);
    setTemplatePreviewSignature(undefined);
    setMutationError(undefined);
    setSuccessMessage(undefined);
  }

  function openIdentityDialog(): void {
    setMutationError(undefined);
    setFileError(undefined);
    setIdentityDialogOpen(true);
    setShowTemplatePicker(false);
  }

  function closeIdentityDialog(): void {
    setIdentityDialogOpen(false);
    setShowTemplatePicker(false);
    setConfirmApplyTemplate(false);
  }

  function changeTemplateOption(option: IdentityTemplateOption, value: string): void {
    setTemplateConfiguration((current) => ({ ...current, [option.key]: value }));
    setTemplatePreviewUrl(undefined);
    setTemplatePreviewSignature(undefined);
    setMutationError(undefined);
    setSuccessMessage(undefined);
  }

  async function handleMutationError(error: unknown, action: "remove" | "upload" | "preview" | "apply"): Promise<void> {
    const staleTemplate = error instanceof ApiError && (action === "preview" || action === "apply") &&
      (error.status === 404 || (error.status === 409 && /template|version/i.test(error.message)));
    if (staleTemplate) {
      setConfirmApplyTemplate(false);
      setSelectedTemplateId(undefined);
      setTemplateConfiguration({});
      setTemplatePreviewUrl(undefined);
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

  async function generateTemplatePreview(): Promise<void> {
    if (!selectedTemplate) return;
    const config = templatePayload(selectedTemplate, templateConfiguration);
    setTemplateConfiguration((current) => ({ ...current, ...config }));
    for (const option of selectedTemplate.options) {
      const value = config[option.key]?.trim() ?? "";
      if ((option.required && !value) || (option.type === "text" && value.length > 120)) {
        setMutationError(option.type === "text" && value.length > 120
          ? `${optionLabel(option.key)} deve ter no máximo 120 caracteres.`
          : `Preencha ${optionLabel(option.key).toLocaleLowerCase("pt-BR")} para gerar a prévia.`);
        return;
      }
      if (option.type === "enum" && value && !option.values.includes(value)) {
        setMutationError(`Escolha uma opção válida para ${optionLabel(option.key).toLocaleLowerCase("pt-BR")}.`);
        return;
      }
    }

    setIsPreviewing(true);
    setMutationError(undefined);
    setTemplatePreviewUrl(undefined);
    setTemplatePreviewSignature(undefined);
    try {
      await ensureAntiforgeryToken();
      const body = JSON.stringify({ templateId: selectedTemplate.id, version: selectedTemplate.version, config });
      const preview = await client.current!.requestBlob(`${visualIdentityTemplatesPath}/preview`, {
        accept: "image/png",
        body,
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setTemplatePreviewUrl(URL.createObjectURL(preview));
      setTemplatePreviewSignature(JSON.stringify({ templateId: selectedTemplate.id, version: selectedTemplate.version, config }));
    } catch (error) {
      await handleMutationError(error, "preview");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function applyTemplate(): Promise<void> {
    if (!selectedTemplate || !templatePreviewUrl || templatePreviewSignature !== currentTemplateSignature()) return;
    setIsMutating(true);
    setMutationError(undefined);
    try {
      await ensureAntiforgeryToken();
      await client.current!.request<VisualIdentityResponse>(`${visualIdentityPath}/template`, {
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          version: selectedTemplate.version,
          config: templatePayload(selectedTemplate, templateConfiguration)
        }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      client.current!.clearCache();
      setConfirmApplyTemplate(false);
      setSelectedTemplateId(undefined);
      setTemplateConfiguration({});
      setTemplatePreviewUrl(undefined);
      setTemplatePreviewSignature(undefined);
      closeIdentityDialog();
      setSuccessMessage("Modelo de identidade visual aplicado com sucesso.");
      setReloadNonce((current) => current + 1);
    } catch (error) {
      await handleMutationError(error, "apply");
    } finally {
      setIsMutating(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setMutationError(undefined);
    setSuccessMessage(undefined);
    setSelectedTemplateId(undefined);
    setTemplateConfiguration({});
    setTemplatePreviewUrl(undefined);
    setTemplatePreviewSignature(undefined);
    const validationError = validateFile(file);
    if (validationError) {
      setSelectedFile(undefined);
      setSelectedPreviewUrl(undefined);
      setFileError(validationError);
      return;
    }

    setFileError(undefined);
    setSelectedFile(file);
    setSelectedPreviewUrl(URL.createObjectURL(file));
    closeIdentityDialog();
    setConfirmApply(true);
  }

  async function applyIdentity(): Promise<void> {
    if (!selectedFile) return;
    setIsMutating(true);
    setMutationError(undefined);
    try {
      await ensureAntiforgeryToken();
      const formData = new FormData();
      formData.append("file", selectedFile, selectedFile.name);
      await client.current!.request<VisualIdentityResponse>(visualIdentityPath, { body: formData, method: "PUT" });
      client.current!.clearCache();
      setConfirmApply(false);
      setSelectedFile(undefined);
      setSelectedPreviewUrl(undefined);
      setSuccessMessage("Identidade visual atualizada com sucesso.");
      setReloadNonce((current) => current + 1);
    } catch (error) {
      await handleMutationError(error, "upload");
    } finally {
      setIsMutating(false);
    }
  }

  async function removeIdentity(): Promise<void> {
    setIsMutating(true);
    setMutationError(undefined);
    try {
      await ensureAntiforgeryToken();
      await client.current!.request<VisualIdentityResponse>(visualIdentityPath, { method: "DELETE" });
      client.current!.clearCache();
      setConfirmRemove(false);
      setSuccessMessage("Identidade visual removida. O símbolo padrão será usado.");
      setReloadNonce((current) => current + 1);
    } catch (error) {
      await handleMutationError(error, "remove");
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <>
      <div className="farm-identity-avatar-wrap">
        <div className="farm-profile-symbol farm-identity-profile-symbol">
          <img alt={currentImageUrl ? `Identidade visual atual do ${farmName}` : ""} className="farm-identity-profile-image" src={currentImageUrl ?? "/assets/brand/png/criatorio-virtual-symbol.png"} />
        </div>
        <button aria-label="Alterar imagem do criatório" className="farm-identity-camera-action" onClick={openIdentityDialog} type="button">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4v-10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="12" cy="13.2" r="3.1" stroke="currentColor" strokeWidth="1.8"/></svg>
        </button>
        <input accept="image/png,image/jpeg" aria-label="Enviar minha imagem" className="farm-identity-file-input" onChange={handleFileChange} ref={fileInputRef} tabIndex={-1} type="file" />
      </div>
      {successMessage && <span className="sr-only" role="status">{successMessage}</span>}

      {identityDialogOpen && (
        <div className="farm-identity-dialog-backdrop">
          <section aria-labelledby={confirmApplyTemplate ? "titulo-confirmar-modelo" : "farm-identity-chooser-title"} aria-modal="true" className="farm-identity-dialog farm-identity-chooser-dialog" role="dialog">
            <header className="farm-identity-dialog-heading">
              <div>{confirmApplyTemplate
                ? <><h3 id="titulo-confirmar-modelo">Aplicar este modelo?</h3><p>Confira o resultado antes de atualizar o perfil do seu criatório.</p></>
                : <><h3 id="farm-identity-chooser-title">Alterar identidade visual</h3><p>Escolha como deseja atualizar a imagem do seu criatório.</p></>}</div>
              <button aria-label="Fechar" className="farm-identity-dialog-close" onClick={closeIdentityDialog} type="button">×</button>
            </header>
            {mutationError && !showTemplatePicker && <p className="form-error" role="alert">{mutationError}</p>}
            {fileError && <p className="form-error" role="alert">{fileError}</p>}
            {loadState === "error" && <div className="farm-identity-feedback"><p role="alert">{loadError}</p><button className="farm-identity-secondary-action" onClick={() => setReloadNonce((current) => current + 1)} type="button">Tentar novamente</button></div>}
            {!showTemplatePicker ? (
              <div className="farm-identity-chooser-options">
                <button autoFocus className="farm-identity-chooser-option" onClick={() => fileInputRef.current?.click()} type="button">
                  <span aria-hidden="true" className="farm-identity-chooser-icon"><svg fill="none" viewBox="0 0 24 24"><path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4v-10Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="12" cy="13.2" r="3.1" stroke="currentColor" strokeWidth="1.8"/></svg></span>
                  <span><strong>Enviar minha imagem</strong><small>Use um arquivo PNG ou JPEG do seu dispositivo.</small></span>
                </button>
                <button className="farm-identity-chooser-option" onClick={() => setShowTemplatePicker(true)} type="button">
                  <span aria-hidden="true" className="farm-identity-chooser-icon"><svg fill="none" viewBox="0 0 24 24"><rect height="15" rx="2" stroke="currentColor" strokeWidth="1.8" width="17" x="3.5" y="4.5"/><circle cx="9" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="m5 18 5-5 3 3 2.5-2.5L19 17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg></span>
                  <span><strong>Escolher um modelo</strong><small>Veja os modelos disponíveis e personalize uma prévia.</small></span>
                </button>
                {identity && <button className="farm-identity-chooser-option" disabled={isMutating} onClick={() => { setMutationError(undefined); setConfirmRemove(true); closeIdentityDialog(); }} type="button"><span aria-hidden="true" className="farm-identity-chooser-icon">×</span><span><strong>Remover imagem</strong><small>Voltar a usar o símbolo padrão do Criatório Virtual.</small></span></button>}
              </div>
            ) : confirmApplyTemplate && selectedTemplate && templatePreviewUrl && templatePreviewSignature === currentTemplateSignature() ? (
              <div className="farm-identity-template-confirmation">
                <p>O modelo {selectedTemplate.name} será aplicado à identidade visual de {farmName}, usando a prévia e as opções exibidas.</p>
                <img alt={`Prévia de ${selectedTemplate.name} que será aplicada`} className="farm-identity-template-render" src={templatePreviewUrl} />
                <div className="farm-identity-dialog-actions">
                  <button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmApplyTemplate(false)} type="button">Voltar à prévia</button>
                  <button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyTemplate()} type="button">{isMutating ? "Aplicando…" : "Confirmar aplicação do modelo"}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="farm-identity-template-picker-heading">
                  <button className="farm-identity-secondary-action" onClick={() => setShowTemplatePicker(false)} type="button">Voltar</button>
                  <div><h4>Escolher um modelo</h4><p>Gere uma prévia com os dados do criatório antes de aplicar.</p></div>
                </div>
                <VisualIdentityTemplatePicker
                  error={mutationError}
                  getPreviewUrl={getApiUrl}
                  isMutating={isMutating}
                  isPreviewing={isPreviewing}
                  loadError={templateLoadError}
                  loadState={templateLoadState}
                  onApply={() => { setMutationError(undefined); setConfirmApplyTemplate(true); }}
                  onChangeOption={changeTemplateOption}
                  onGeneratePreview={() => void generateTemplatePreview()}
                  onRetry={() => setTemplateReloadNonce((current) => current + 1)}
                  onSelect={selectTemplate}
                  previewIsCurrent={Boolean(templatePreviewUrl && templatePreviewSignature === currentTemplateSignature())}
                  previewUrl={templatePreviewUrl}
                  selectedTemplate={selectedTemplate}
                  selectedTemplateId={selectedTemplateId}
                  templateConfiguration={templateConfiguration}
                  templates={templates}
                />
              </>
            )}
          </section>
        </div>
      )}

      {confirmApply && selectedFile && (
        <div className="farm-identity-dialog-backdrop"><section aria-labelledby="titulo-confirmar-identidade" aria-modal="true" className="farm-identity-dialog" role="dialog"><h3 id="titulo-confirmar-identidade">Conferir nova identidade</h3><p>Esta imagem será usada no perfil de {farmName}.</p><img alt={`Prévia de ${selectedFile.name}`} className="farm-identity-upload-preview" src={selectedPreviewUrl} /><p className="farm-identity-upload-file-name">{selectedFile.name}</p>{mutationError && <p className="form-error" role="alert">{mutationError}</p>}<div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => { setConfirmApply(false); setSelectedFile(undefined); setSelectedPreviewUrl(undefined); }} type="button">Cancelar</button><button className="farm-identity-secondary-action" disabled={isMutating} onClick={() => { setConfirmApply(false); setSelectedFile(undefined); setSelectedPreviewUrl(undefined); openIdentityDialog(); }} type="button">Escolher outra imagem</button><button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyIdentity()} type="button">{isMutating ? "Aplicando…" : "Confirmar aplicação"}</button></div></section></div>
      )}
      {confirmRemove && (
        <div className="farm-identity-dialog-backdrop"><section aria-labelledby="titulo-remover-identidade" aria-modal="true" className="farm-identity-dialog" role="dialog"><h3 id="titulo-remover-identidade">Remover identidade visual?</h3><p>O símbolo padrão será exibido no lugar da imagem atual.</p>{mutationError && <p className="form-error" role="alert">{mutationError}</p>}<div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmRemove(false)} type="button">Cancelar</button><button className="farm-identity-danger-action" disabled={isMutating} onClick={() => void removeIdentity()} type="button">{isMutating ? "Removendo…" : "Confirmar remoção"}</button></div></section></div>
      )}
    </>
  );
}
