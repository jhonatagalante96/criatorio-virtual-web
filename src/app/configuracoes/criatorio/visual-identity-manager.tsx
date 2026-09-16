"use client";

import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../lib/http/api-client";

const visualIdentityPath = "api/breeding-farms/visual-identity";
const maxFileLength = 10 * 1024 * 1024;

interface VisualIdentityItem {
  contentType: string | null;
  contentUrl: string | null;
  fileName: string | null;
  length: number | null;
  source: string;
  updatedAtUtc: string;
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

function requestErrorMessage(error: unknown, action: "load" | "remove" | "upload"): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a tela antes de continuar.";
  if (!(error instanceof ApiError)) return "Verifique sua conexão e tente novamente.";
  if (error.status === 400) return "A imagem não foi aceita. Escolha um arquivo PNG ou JPEG válido de até 10 MB.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 403) return "Sua conta não tem permissão para alterar esta identidade.";
  if (error.status === 404) return action === "load" ? "Não foi possível localizar a identidade deste criatório." : "O criatório ou a identidade não foi encontrada.";
  if (error.status === 409) return "Selecione um criatório para gerenciar a identidade visual.";
  if (error.status === 503) return "O armazenamento está indisponível no momento. Tente novamente em instantes.";
  if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível concluir esta ação. Tente novamente.";
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
  const [isMutating, setIsMutating] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
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

  useEffect(() => () => {
    if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
  }, [selectedPreviewUrl]);

  useEffect(() => {
    if (!confirmApply && !confirmRemove) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isMutating) {
        setConfirmApply(false);
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
  }, [confirmApply, confirmRemove, isMutating]);

  async function ensureAntiforgeryToken(): Promise<void> {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }

  async function handleMutationError(error: unknown, action: "remove" | "upload"): Promise<void> {
    if (error instanceof ApiError && error.status === 401) {
      const result = await refresh();
      if (result.ok) setReloadNonce((current) => current + 1);
    }
    setMutationError(requestErrorMessage(error, action));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setMutationError(undefined);
    setSuccessMessage(undefined);
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
              <p>{identity?.fileName ?? "O símbolo padrão do Criatório Virtual será usado até você enviar uma imagem."}</p>
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

      {confirmApply && selectedFile && (
        <div className="farm-identity-dialog-backdrop"><section aria-labelledby="titulo-confirmar-identidade" aria-modal="true" className="farm-identity-dialog" role="dialog"><h3 id="titulo-confirmar-identidade">Aplicar nova identidade?</h3><p>A imagem será usada como identidade visual de {farmName}.</p><div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmApply(false)} type="button">Voltar à prévia</button><button className="farm-identity-primary-action" disabled={isMutating} onClick={() => void applyIdentity()} type="button">{isMutating ? "Aplicando…" : "Confirmar aplicação"}</button></div></section></div>
      )}
      {confirmRemove && (
        <div className="farm-identity-dialog-backdrop"><section aria-labelledby="titulo-remover-identidade" aria-modal="true" className="farm-identity-dialog" role="dialog"><h3 id="titulo-remover-identidade">Remover identidade visual?</h3><p>O símbolo padrão será exibido no lugar da imagem atual.</p><div className="farm-identity-dialog-actions"><button autoFocus className="farm-identity-secondary-action" disabled={isMutating} onClick={() => setConfirmRemove(false)} type="button">Cancelar</button><button className="farm-identity-danger-action" disabled={isMutating} onClick={() => void removeIdentity()} type="button">{isMutating ? "Removendo…" : "Confirmar remoção"}</button></div></section></div>
      )}
    </section>
  );
}
