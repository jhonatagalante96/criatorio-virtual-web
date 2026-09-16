"use client";

import React, { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiClient, ApiError, StaleTenantResponseError } from "../../../../lib/http/api-client";

export type ExternalParentPosition = "father" | "mother";

export interface ExistingGenealogyParent {
  birdId: string | null;
  name: string;
  ringNumber: string | null;
  source: "External" | "Private" | "Snapshot";
}

export interface ParentLinkInput {
  linkedBirdId?: string;
  name?: string;
}

export interface ParentOption {
  birthDate: string | null;
  birdId: string;
  name: string;
  ringNumber: string | null;
  sex: "Female" | "Male";
}

interface ParentOptionsResponse {
  breedingFarmId: string;
  items: ParentOption[];
}

type SearchState = "empty" | "error" | "idle" | "loading" | "ready";
type ParentOrigin = "bird" | "external" | "";

interface ExternalAncestorEditorProps {
  ancestorName: string;
  availablePositions?: ExternalParentPosition[];
  client: ApiClient;
  currentParents: Partial<Record<ExternalParentPosition, ExistingGenealogyParent>>;
  onClose: () => void;
  onMutationComplete: () => void;
  onSave: (position: ExternalParentPosition, parent: ParentLinkInput, selectedParent?: ParentOption) => Promise<void>;
  onSessionExpired: () => Promise<boolean>;
  onUnlink: (position: ExternalParentPosition) => Promise<void>;
}

function positionLabel(position: ExternalParentPosition): string {
  return position === "father" ? "Pai" : "Mãe";
}

function formatParentOption(option: ParentOption): string {
  const details = [
    option.ringNumber ? `Anilha ${option.ringNumber}` : undefined,
    option.birthDate ? `${option.sex === "Male" ? "Nascido" : "Nascida"} em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${option.birthDate}T00:00:00Z`))}` : undefined
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "Sem anilha ou data de nascimento informada";
}

function searchErrorMessage(error: unknown): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a ficha antes de buscar aves.";
  if (!(error instanceof ApiError)) return "Não foi possível buscar aves cadastradas. Verifique sua conexão e tente novamente.";
  if (error.status === 401) return "Sua sessão expirou. Atualize a sessão e tente buscar novamente.";
  if (error.status === 403) return "Sua conta não tem permissão para buscar aves deste criatório.";
  if (error.status === 404) return "O criatório selecionado não foi encontrado.";
  if (error.status === 409) return "Selecione novamente um criatório para buscar aves.";
  if (error.status >= 500) return "A busca está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível buscar aves cadastradas. Verifique sua conexão e tente novamente.";
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Feche esta janela e atualize a ficha.";
  if (!(error instanceof ApiError)) return "Não foi possível salvar a ascendência. Verifique sua conexão e tente novamente.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para editar a genealogia.";
  if (error.status === 403) return "Somente o responsável pelo criatório pode editar esta ascendência.";
  if (error.status === 404) return "O ancestral ou o vínculo selecionado não está mais disponível. Atualize a árvore e tente novamente.";
  if (error.status === 409) {
    const message = error.message.toLowerCase();
    if (message.includes("breeding farm must be selected")) return "Selecione novamente um criatório para editar a genealogia.";
    if (message.includes("changed by another request")) return "A árvore mudou enquanto você editava. Atualize a árvore e tente novamente.";
    return "A alteração não é compatível com o estado atual da árvore. Confira os vínculos e tente novamente.";
  }
  if (error.status === 400) return "Confira o nome ou a ave selecionada e tente novamente.";
  if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível salvar a ascendência. Confira os dados e tente novamente.";
}

export function ExternalAncestorEditor({
  ancestorName,
  availablePositions,
  client,
  currentParents,
  onClose,
  onMutationComplete,
  onSave,
  onSessionExpired,
  onUnlink
}: Readonly<ExternalAncestorEditorProps>) {
  const dialogId = useId();
  const descriptionId = useId();
  const positionId = useId();
  const externalNameId = useId();
  const searchId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [position, setPosition] = useState<ExternalParentPosition | "">("");
  const [origin, setOrigin] = useState<ParentOrigin>("");
  const [externalName, setExternalName] = useState("");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ParentOption[]>([]);
  const [selectedParent, setSelectedParent] = useState<ParentOption>();
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState<string>();
  const [searchRetry, setSearchRetry] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [replaceConfirmation, setReplaceConfirmation] = useState(false);
  const [unlinkConfirmation, setUnlinkConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const isBusy = isSaving || isUnlinking;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      if (!dialog.open) return;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);

  useEffect(() => {
    if (origin !== "bird" || !position) {
      setOptions([]);
      setSearchError(undefined);
      setSearchState("idle");
      return;
    }

    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setOptions([]);
      setSearchError(undefined);
      setSearchState("idle");
      return;
    }

    const controller = new AbortController();
    setSearchState("loading");
    setSearchError(undefined);
    const timeoutId = window.setTimeout(async () => {
      try {
        const sex = position === "father" ? "Male" : "Female";
        const response = await client.request<ParentOptionsResponse>(
          `api/birds/parent-options?search=${encodeURIComponent(normalizedQuery)}&sex=${sex}&limit=5`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setOptions(response.items);
        setSearchState(response.items.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          const recovered = await onSessionExpired();
          if (controller.signal.aborted) return;
          if (recovered) {
            setSearchRetry((value) => value + 1);
            return;
          }
        }
        setSearchError(searchErrorMessage(error));
        setSearchState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [client, onSessionExpired, origin, position, query, searchRetry]);

  const currentParent = position ? currentParents[position] : undefined;
  const selectablePositions = availablePositions ?? ["father", "mother"];
  const currentPositionLabel = position ? positionLabel(position) : "";
  const dialogTitle = Object.values(currentParents).some(Boolean) ? "Editar ascendência" : "Adicionar ascendência";
  const parentRelation = position === "father" ? "pai cadastrado" : "mãe cadastrada";
  const selectedName = origin === "external" ? externalName.trim() : selectedParent?.name;
  const isSameParent = Boolean(currentParent && (
    origin === "external"
      ? currentParent.source === "External" && currentParent.name.trim().toLocaleLowerCase() === externalName.trim().toLocaleLowerCase()
      : origin === "bird" && currentParent.birdId === selectedParent?.birdId
  ));

  function changePosition(value: string) {
    setPosition(value as ExternalParentPosition | "");
    setOrigin("");
    setExternalName("");
    setQuery("");
    setOptions([]);
    setSelectedParent(undefined);
    setErrorMessage(undefined);
    setReplaceConfirmation(false);
    setUnlinkConfirmation(false);
  }

  function changeOrigin(value: ParentOrigin) {
    setOrigin(value);
    setExternalName("");
    setQuery("");
    setOptions([]);
    setSelectedParent(undefined);
    setErrorMessage(undefined);
    setReplaceConfirmation(false);
    setUnlinkConfirmation(false);
  }

  function chooseParent(option: ParentOption) {
    setSelectedParent(option);
    setQuery("");
    setOptions([]);
    setSearchState("idle");
    setSearchError(undefined);
    setErrorMessage(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(undefined);
    if (!position) {
      setErrorMessage("Escolha se deseja informar o pai ou a mãe deste ancestral.");
      return;
    }
    if (!origin) {
      setErrorMessage("Escolha se o novo vínculo será com uma ave cadastrada ou um ancestral externo.");
      return;
    }

    let parent: ParentLinkInput;
    if (origin === "external") {
      if (!externalName.trim()) {
        setErrorMessage("Informe o nome do ancestral externo.");
        return;
      }
      parent = { name: externalName.trim() };
    } else {
      if (!selectedParent) {
        setErrorMessage("Busque e selecione uma ave cadastrada antes de salvar.");
        return;
      }
      parent = { linkedBirdId: selectedParent.birdId };
    }

    if (isSameParent) {
      setErrorMessage("Este ancestral já está vinculado a esta posição.");
      return;
    }
    if (currentParent && !replaceConfirmation) {
      setReplaceConfirmation(true);
      setUnlinkConfirmation(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(position, parent, origin === "bird" ? selectedParent : undefined);
      onClose();
      onMutationComplete();
    } catch (error) {
      setErrorMessage(mutationErrorMessage(error));
      if (error instanceof ApiError && error.status === 401) await onSessionExpired();
    } finally {
      setIsSaving(false);
    }
  }

  async function unlink() {
    if (!position || !currentParent) return;
    setIsUnlinking(true);
    setErrorMessage(undefined);
    try {
      await onUnlink(position);
      onClose();
      onMutationComplete();
    } catch (error) {
      setErrorMessage(mutationErrorMessage(error));
      if (error instanceof ApiError && error.status === 401) await onSessionExpired();
    } finally {
      setIsUnlinking(false);
    }
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={dialogId}
      className="external-ancestor-dialog"
      onCancel={(event) => { event.preventDefault(); if (!isBusy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !isBusy) onClose(); }}
      ref={dialogRef}
    >
      <div className="external-ancestor-dialog-content">
        <header className="external-ancestor-dialog-header">
          <div>
            <p className="eyebrow">Genealogia</p>
            <h2 id={dialogId}>{dialogTitle}</h2>
            <p id={descriptionId}>Informe os pais de {ancestorName}. A posição escolhida determina o sexo validado pelo sistema.</p>
          </div>
          <button aria-label="Fechar edição de ascendência" className="external-ancestor-close" disabled={isBusy} onClick={onClose} type="button">×</button>
        </header>

        <form className="external-ancestor-form" noValidate onSubmit={submit}>
          <div className="external-ancestor-controls">
            <label className="external-ancestor-field" htmlFor={positionId}>
              <span>Posição</span>
              <select disabled={isBusy} id={positionId} onChange={(event) => changePosition(event.target.value)} value={position}>
                <option value="">Escolha Pai ou Mãe</option>
                {selectablePositions.map((availablePosition) => (
                  <option key={availablePosition} value={availablePosition}>{positionLabel(availablePosition)}</option>
                ))}
              </select>
            </label>

            {currentParent && position && (
              <section aria-label={`Vínculo atual de ${currentPositionLabel}`} className="external-ancestor-current">
                <div>
                  <span>Vínculo atual · {currentPositionLabel}</span>
                  <strong>{currentParent.name}</strong>
                  <small>{currentParent.ringNumber ? `Anilha ${currentParent.ringNumber}` : currentParent.source === "External" ? "Ancestral externo" : "Ave cadastrada ou registro preservado"}</small>
                </div>
                {unlinkConfirmation ? (
                  <div className="external-ancestor-confirmation" role="group" aria-label={`Confirmar desvinculação de ${currentPositionLabel}`}>
                    <p>Isso removerá somente o vínculo de {currentPositionLabel} de {ancestorName}. A outra posição será preservada.</p>
                    <div className="external-ancestor-confirmation-actions">
                      <button className="auth-secondary-action" disabled={isBusy} onClick={() => setUnlinkConfirmation(false)} type="button">Cancelar</button>
                      <button className="external-ancestor-danger-action" disabled={isBusy} onClick={() => void unlink()} type="button">{isUnlinking ? "Desvinculando…" : `Confirmar desvínculo de ${currentPositionLabel}`}</button>
                    </div>
                  </div>
                ) : (
                  <button className="external-ancestor-unlink" disabled={isBusy} onClick={() => { setUnlinkConfirmation(true); setReplaceConfirmation(false); }} type="button">Desvincular {currentPositionLabel}</button>
                )}
              </section>
            )}
          </div>

          <fieldset className="external-ancestor-origin" disabled={isBusy || !position}>
            <legend>Origem do novo vínculo</legend>
            <label><input checked={origin === "bird"} name={`${dialogId}-origin`} onChange={() => changeOrigin("bird")} type="radio" value="bird" />Ave cadastrada</label>
            <label><input checked={origin === "external"} name={`${dialogId}-origin`} onChange={() => changeOrigin("external")} type="radio" value="external" />Ancestral externo</label>
          </fieldset>

          {origin === "external" && position && (
            <div className="external-ancestor-field-group">
              <label className="external-ancestor-field" htmlFor={externalNameId}>
                <span>Nome do ancestral externo · {currentPositionLabel}</span>
                <input autoComplete="off" disabled={isBusy} id={externalNameId} maxLength={200} onChange={(event) => { setExternalName(event.target.value); setErrorMessage(undefined); }} placeholder={position === "father" ? "Ex.: Avô Azul" : "Ex.: Avó Rubi"} value={externalName} />
              </label>
              <p className="external-ancestor-help">Esse nome será incluído somente na genealogia, sem criar ave, anilha ou registro no plantel.</p>
            </div>
          )}

          {origin === "bird" && position && (
            <section aria-label="Buscar ave cadastrada" className="external-ancestor-field-group">
              <label className="external-ancestor-field" htmlFor={searchId}>
                <span>Buscar {parentRelation} pelo nome ou anilha</span>
                <input
                  aria-controls={`${dialogId}-results`}
                  autoComplete="off"
                  disabled={isBusy || Boolean(selectedParent)}
                  id={searchId}
                  maxLength={100}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                  placeholder={position === "father" ? "Ex.: Pai Azul ou 930001" : "Ex.: Mãe Rubi ou 930002"}
                  type="search"
                  value={query}
                />
              </label>
              <p className="external-ancestor-help">Digite ao menos dois caracteres. A busca retorna até cinco aves do criatório selecionado.</p>
              {selectedParent && (
                <div className="external-ancestor-selected" role="status">
                  <span><strong>{selectedParent.name}</strong><small>{formatParentOption(selectedParent)}</small></span>
                  <button className="text-action" disabled={isBusy} onClick={() => { setSelectedParent(undefined); setSearchState("idle"); }} type="button">Alterar seleção</button>
                </div>
              )}
              <div aria-live="polite" className="external-ancestor-results" id={`${dialogId}-results`}>
                {searchState === "loading" && <p role="status">Buscando aves…</p>}
                {searchState === "idle" && !selectedParent && <p role="status">Nenhuma ave selecionada.</p>}
                {searchState === "empty" && <p role="status">Nenhuma ave ativa encontrada para essa busca.</p>}
                {searchState === "error" && (
                  <div className="external-ancestor-search-error">
                    <p role="alert">{searchError}</p>
                    <button className="auth-secondary-action" disabled={isBusy} onClick={() => setSearchRetry((value) => value + 1)} type="button">Tentar novamente</button>
                  </div>
                )}
                {searchState === "ready" && (
                  <ul aria-label={`Resultados para ${position === "father" ? "pai" : "mãe"}`} className="external-ancestor-options" role="listbox">
                    {options.map((option) => (
                      <li key={option.birdId}>
                        <button aria-selected={false} disabled={isBusy} onClick={() => chooseParent(option)} role="option" type="button">
                          <strong>{option.name}</strong>
                          <span>{formatParentOption(option)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          <section aria-label="Revisar vínculo" className="external-ancestor-review">
            <h3>Revisar vínculo</h3>
            <dl>
              <div><dt>Ancestral</dt><dd>{ancestorName}</dd></div>
              <div><dt>Posição</dt><dd>{position ? currentPositionLabel : "Escolha Pai ou Mãe"}</dd></div>
              <div><dt>Novo vínculo</dt><dd>{selectedName || "Escolha uma origem e informe o ancestral"}</dd></div>
            </dl>
          </section>

          {replaceConfirmation && currentParent && position && (
            <section aria-label="Confirmar substituição" className="external-ancestor-confirmation" role="group">
              <p>{currentPositionLabel} de {ancestorName} será alterado de <strong>{currentParent.name}</strong> para <strong>{selectedName}</strong>. A outra posição será preservada.</p>
              <div className="external-ancestor-confirmation-actions">
                <button className="auth-secondary-action" disabled={isBusy} onClick={() => setReplaceConfirmation(false)} type="button">Voltar e revisar</button>
                <button className="auth-primary-action" disabled={isBusy} type="submit">{isSaving ? "Salvando…" : "Confirmar substituição"}</button>
              </div>
            </section>
          )}

          {errorMessage && <p className="external-ancestor-error" role="alert">{errorMessage}</p>}

          {!replaceConfirmation && (
            <footer className="external-ancestor-actions">
              <button className="auth-secondary-action" disabled={isBusy} onClick={onClose} type="button">Cancelar</button>
              <button className="auth-primary-action" disabled={isBusy} type="submit">{isSaving ? "Salvando…" : "Confirmar e salvar ascendência"}</button>
            </footer>
          )}
        </form>
      </div>
    </dialog>
  );
}
