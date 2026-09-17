"use client";

import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient, getApiUrl } from "../../../lib/http/api-client";

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
type IdentityTemplateLoadState = "error" | "loading" | "ready";

interface IdentityTemplateOption {
  key: string;
  type: string;
  required: boolean;
  default: string;
  values: string[];
}

interface IdentityTemplate {
  id: string;
  name: string;
  version: string;
  previewUrl: string;
  aspectRatio: string;
  options: IdentityTemplateOption[];
}

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
  if (error.status === 404) return action === "load" ? "Não foi possível localizar a identidade deste criatório." : "O criatório ou a identidade não foi encontrada.";
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

function optionLabel(key: string): string {
  if (key === "subtitle") return "Subtítulo";
  if (key === "tagline") return "Frase de apoio";
  return key;
}

function identityTemplateLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para ver os modelos.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para ver os modelos de identidade.";
  return "Não foi possível carregar os modelos de identidade. Tente novamente.";
}

function sourceLabel(source: string): string {
  if (source === "Upload") return "Imagem enviada";
  if (source === "Template") return "Modelo da plataforma";
  return "Identidade configurada";
}

export function VisualIdentityManager({ breedingFarmId, farmName }: Readonly<{ breedingFarmId: string; farmName: string }>) {
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
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmApplyTemplate, setConfirmApplyTemplate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);
  const currentImageObjectUrl = useRef<string | undefined>(undefined);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

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
  }, [breedingFarmId, refresh, templateReloadNonce]);

  useEffect(() => () => {
    if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  }, [selectedPreviewUrl]);

  useEffect(() => () => {
    if (templatePreviewUrl) URL.revokeObjectURL(templatePreviewUrl);
  }, [templatePreviewUrl]);

  useEffect(() => {
    if (!confirmApply && !confirmApplyTemplate && !confirmRemove) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isMutating) {
        setConfirmApply(false);
        setConfirmApplyTemplate(false);
        setConfirmRemove(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".farm-identity-dialog");
      const controls = dialog?.querySelectorAll<HTMLElement>("button:not(:disabled)");
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
  }, [confirmApply, confirmApplyTemplate, confirmRemove, isMutating]);

  async function ensureAntiforgeryToken(): Promise<void> {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const appliedTemplate = identity?.modelId ? templates.find((template) => template.id === identity.modelId) : undefined;

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

  function changeTemplateOption(option: IdentityTemplateOption, value: string): void {
    setTemplateConfiguration((current) => ({ ...current, [option.key]: value }));
    setTemplatePreviewUrl(undefined);
    setTemplatePreviewSignature(undefined);
    setMutationError(undefined);
    setSuccessMessage(undefined);
  }

  async function handleMutationError(error: unknown, action: "remove" | "upload" | "preview" | "apply"): Promise<void> {
    if (error instanceof ApiError && error.status === 409 && (action === "preview" || action === "apply") && /template|version/i.test(error.message)) {
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
    <section aria-labelledby="titulo-identidade-criatorio" className="farm-info-card farm-identity-card">
      <div className="farm-card-heading"><div><h2 id="titulo-identidade-criatorio">Identidade visual</h2><p>Personalize o símbolo exibido para o seu criatório.</p></div></div>
      {successMessage && <p className="confirmation-feedback" role="status">{successMessage}</p>}
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      {fileError && <p className="form-error" role="alert">{fileError}</p>}

      {loadState === "loading" && <p aria-live="polite" className="farm-identity-feedback">Carregando identidade visual…</p>}
      {loadState === "error" && <div className="farm-identity-feedback"><p role="alert">{loadError}</p><button className="farm-identity-secondary-action" onClick={() => setReloadNonce((current) => current + 1)} type="button">Tentar novamente</button></div>}
      {loadState === "ready" && (
        <>
          <div className="farm-identity-current">
            {currentImageUrl
              ? <img alt={`Identidade visual atual do ${farmName}`} className="farm-identity-preview" src={currentImageUrl} />
              : identity
                ? <div aria-label="Prévia da identidade não disponível" className="farm-identity-placeholder"><span aria-hidden="true">CV</span><small>Prévia indisponível</small></div>
                : <div className="farm-identity-placeholder"><img alt="" src="/assets/brand/png/criatorio-virtual-symbol.png" /><small>Símbolo padrão</small></div>}
            <div className="farm-identity-details">
              <strong>{identity ? sourceLabel(identity.source) : "Nenhuma imagem personalizada"}</strong>
              <p>{identity?.source === "Template"
                ? `${appliedTemplate?.name ?? identity.modelId ?? "Modelo aplicado"}${identity.version ? ` · versão ${identity.version}` : ""}`
                : identity?.fileName ?? "O símbolo padrão do Criatório Virtual será usado até você enviar uma imagem."}</p>
              {identity?.updatedAtUtc && <small>Atualizada em {new Date(identity.updatedAtUtc).toLocaleDateString("pt-BR")}</small>}
            </div>
          </div>

          <div className="farm-identity-actions">
            <label className="farm-identity-primary-action" htmlFor="farm-identity-file">{identity ? "Substituir imagem" : "Enviar minha imagem"}</label>
            <input accept="image/png,image/jpeg" aria-describedby="farm-identity-file-help" className="farm-identity-file-input" id="farm-identity-file" onChange={handleFileChange} type="file" />
            {identity && <button className="farm-identity-secondary-action" disabled={isMutating} onClick={() => { setMutationError(undefined); setConfirmRemove(true); }} type="button">Remover imagem</button>}
          </div>
          <p className="farm-identity-help" id="farm-identity-file-help">PNG ou JPEG, até 10 MB. A imagem só será aplicada após você conferir a prévia e confirmar.</p>

          {selectedFile && selectedPreviewUrl && (
            <div className="farm-identity-pending">
              <div><p className="eyebrow">Prévia da nova identidade</p><img alt={`Prévia de ${selectedFile.name}`} className="farm-identity-preview" src={selectedPreviewUrl} /><p>{selectedFile.name}</p></div>
              <div className="farm-identity-actions"><button className="farm-identity-primary-action" disabled={isMutating} onClick={() => { setMutationError(undefined); setConfirmApply(true); }} type="button">Aplicar identidade</button><button className="farm-identity-secondary-action" disabled={isMutating} onClick={() => { setSelectedFile(undefined); setSelectedPreviewUrl(undefined); setFileError(undefined); }} type="button">Cancelar prévia</button></div>
            </div>
          )}
        </>
      )}

      <section aria-labelledby="farm-identity-templates-title" className="farm-identity-templates">
        <div>
          <h3 id="farm-identity-templates-title">Escolher um modelo</h3>
          <p>Veja as opções disponíveis e gere uma prévia com os dados do seu criatório antes de aplicar.</p>
        </div>
        {templateLoadState === "loading" && <p aria-live="polite" className="farm-identity-feedback">Carregando modelos…</p>}
        {templateLoadState === "error" && (
          <div className="farm-identity-feedback">
            <p role="alert">{templateLoadError}</p>
            <button className="farm-identity-secondary-action" disabled={isMutating || isPreviewing} onClick={() => setTemplateReloadNonce((current) => current + 1)} type="button">Tentar novamente</button>
          </div>
        )}
        {templateLoadState === "ready" && templates.length === 0 && <p className="farm-identity-feedback">Nenhum modelo está disponível no momento.</p>}
        {templateLoadState === "ready" && templates.length > 0 && (
          <div aria-label="Modelos de identidade visual" className="farm-identity-template-gallery" role="group">
            {templates.map((template) => (
              <button
                aria-pressed={selectedTemplateId === template.id}
                className="farm-identity-template-option"
                disabled={isMutating || isPreviewing}
                key={`${template.id}-${template.version}`}
                onClick={() => selectTemplate(template)}
                type="button"
              >
                <img alt={`Prévia ilustrativa do modelo ${template.name}, com texto demonstrativo`} src={getApiUrl(template.previewUrl)} />
                <span className="farm-identity-template-name">{template.name}</span>
                <span className="farm-identity-template-version">Versão {template.version} · {template.aspectRatio}</span>
              </button>
            ))}
          </div>
        )}

        {selectedTemplate && (
          <div className="farm-identity-template-configuration">
            <h4>Personalizar {selectedTemplate.name}</h4>
            <p className="farm-identity-help">Os controles abaixo correspondem às opções declaradas por este modelo. O padrão do modelo aparece preenchido.</p>
            {selectedTemplate.options.length > 0 && (
              <fieldset className="farm-identity-template-fields">
                <legend>Opções deste modelo</legend>
                {selectedTemplate.options.map((option) => (
                  <div className="farm-identity-template-field" key={option.key}>
                    {option.type === "enum" ? (
                      <label htmlFor={`farm-identity-option-${option.key}`}>
                        {optionLabel(option.key)}
                        <select
                          id={`farm-identity-option-${option.key}`}
                          disabled={isMutating || isPreviewing}
                          onChange={(event) => changeTemplateOption(option, event.currentTarget.value)}
                          required={option.required}
                          value={templateConfiguration[option.key] ?? option.default}
                        >
                          {option.values.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </label>
                    ) : option.type === "text" ? (
                      <label htmlFor={`farm-identity-option-${option.key}`}>
                        {optionLabel(option.key)}
                        <input
                          autoComplete="off"
                          id={`farm-identity-option-${option.key}`}
                          maxLength={120}
                          disabled={isMutating || isPreviewing}
                          onChange={(event) => changeTemplateOption(option, event.currentTarget.value)}
                          required={option.required}
                          value={templateConfiguration[option.key] ?? option.default}
                        />
                      </label>
                    ) : (
                      <p className="farm-identity-help">{optionLabel(option.key)} é definida pelo modelo.</p>
                    )}
                  </div>
                ))}
              </fieldset>
            )}
            <div className="farm-identity-template-actions">
              <button className="farm-identity-secondary-action" disabled={isPreviewing || isMutating} onClick={() => void generateTemplatePreview()} type="button">
                {isPreviewing ? "Gerando prévia…" : templatePreviewUrl ? "Atualizar prévia" : "Gerar prévia"}
              </button>
              {templatePreviewUrl && templatePreviewSignature === currentTemplateSignature() && (
                <>
                  <img alt={`Prévia de ${selectedTemplate.name} com as opções escolhidas`} className="farm-identity-template-render" src={templatePreviewUrl} />
                  <button className="farm-identity-primary-action" disabled={isMutating || isPreviewing} onClick={() => { setMutationError(undefined); setConfirmApplyTemplate(true); }} type="button">Aplicar modelo</button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {confirmApply && selectedFile && (
        <div className="farm-identity-dialog-backdrop"><section aria-labelledby="titulo-confirmar-identidade" aria-modal="true" className="farm-identity-dialog" role="dialog"><h3 id="titulo-confirmar-identidade">Aplicar nova identidade?</h3><p>A imagem será usada como identidade visual de {farmName}.</p><div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmApply(false)} type="button">Voltar à prévia</button><button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyIdentity()} type="button">{isMutating ? "Aplicando…" : "Confirmar aplicação"}</button></div></section></div>
      )}
      {confirmApplyTemplate && selectedTemplate && templatePreviewUrl && templatePreviewSignature === currentTemplateSignature() && (
        <div className="farm-identity-dialog-backdrop">
          <section aria-labelledby="titulo-confirmar-modelo" aria-modal="true" className="farm-identity-dialog" role="dialog">
            <h3 id="titulo-confirmar-modelo">Aplicar este modelo?</h3>
            <p>O modelo {selectedTemplate.name} será aplicado à identidade visual de {farmName}, usando a prévia e as opções exibidas.</p>
            <img alt={`Prévia de ${selectedTemplate.name} que será aplicada`} className="farm-identity-template-render" src={templatePreviewUrl} />
            <div className="farm-identity-dialog-actions">
              <button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmApplyTemplate(false)} type="button">Voltar à prévia</button>
              <button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyTemplate()} type="button">{isMutating ? "Aplicando…" : "Confirmar aplicação do modelo"}</button>
            </div>
          </section>
        </div>
      )}
      {confirmRemove && (
        <div className="farm-identity-dialog-backdrop"><section aria-labelledby="titulo-remover-identidade" aria-modal="true" className="farm-identity-dialog" role="dialog"><h3 id="titulo-remover-identidade">Remover identidade visual?</h3><p>O símbolo padrão será exibido no lugar da imagem atual.</p><div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmRemove(false)} type="button">Cancelar</button><button className="farm-identity-danger-action" disabled={isMutating} onClick={() => void removeIdentity()} type="button">{isMutating ? "Removendo…" : "Confirmar remoção"}</button></div></section></div>
      )}
    </section>
  );
}
