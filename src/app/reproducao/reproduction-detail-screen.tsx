"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import {
  birdSexLabel,
  birdStatusLabel,
  formatReproductionDate,
  formatReproductionTimestamp,
  normalizeFarmResponse,
  reproductionStatusClass,
  reproductionStatusLabel,
  selectedFarmFromResponse,
  type BreedingFarmSelectionResponse,
  type ReproductionDetailsResponse
} from "./reproduction-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type DetailState = "error" | "loading" | "ready";
type ReproductionDialogMode = "cancel" | "correct-notes" | "edit" | "finish";

type ReproductionMutationResponse = Pick<
  ReproductionDetailsResponse,
  "endDate" | "notes" | "startDate" | "status" | "updatedAtUtc"
>;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstFieldError(fields: Record<string, string[]>, field: string): string | undefined {
  const key = Object.keys(fields).find((candidate) => candidate.toLowerCase() === field.toLowerCase());
  return key ? fields[key]?.[0] : undefined;
}

function reproductionFieldErrorMessage(field: string): string {
  switch (field.toLowerCase()) {
    case "confirmed": return "Confirme a alteração antes de continuar.";
    case "startdate": return "A data de início não pode ser futura.";
    case "enddate": return "Confira a data de término informada.";
    case "notes": return "As observações não podem exceder 2.000 caracteres.";
    default: return "Revise este campo e tente novamente.";
  }
}

function reproductionMutationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      if (firstFieldError(error.fields, "Confirmed")) return "Confirme a alteração antes de continuar.";
      if (firstFieldError(error.fields, "StartDate")) return "A data de início não pode ser futura.";
      if (firstFieldError(error.fields, "EndDate")) return "Confira a data de término informada.";
      if (firstFieldError(error.fields, "Notes")) return "As observações não podem exceder 2.000 caracteres.";
      return "Revise os dados informados e tente novamente.";
    }
    if (error.status === 403) return "Sua conta não tem permissão para alterar esta reprodução.";
    if (error.status === 404) return "Esta reprodução não existe ou não está disponível no criatório selecionado.";
    if (error.status === 409) return "A reprodução foi alterada por outra solicitação. Atualize os dados antes de tentar novamente.";
    if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  }
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize os dados antes de continuar.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível salvar as alterações. Tente novamente.";
}

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de continuar.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado. Tente novamente.";
}

function reproductionDetailsErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "Esta reprodução não existe ou não está disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar esta reprodução.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar esta reprodução.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar esta reprodução. Tente novamente.";
}

function StateCard({
  actionHref,
  actionLabel,
  heading,
  message,
  onRetry
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return (
    <main className="document-wizard-page">
      <section className="document-wizard-state" role={onRetry ? "alert" : undefined}>
        <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="heart" /></span>
        <h1>{heading}</h1>
        <p>{message}</p>
        {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
        {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
      </section>
    </main>
  );
}

export function ReproductionBirdSnapshot({
  label,
  bird
}: Readonly<{ label: string; bird: ReproductionDetailsResponse["maleBird"] }>) {
  return (
    <article className="reproduction-detail-bird">
      <header><span aria-hidden="true" className="reproduction-detail-bird-icon"><DashboardIcon name="bird" /></span><div><p className="eyebrow">{label}</p><h3>{bird.name}</h3></div></header>
      <dl>
        <div><dt>Sexo</dt><dd>{birdSexLabel(bird.sex)}</dd></div>
        <div><dt>Anilha</dt><dd>{bird.ringNumber || "Não informada"}</dd></div>
        <div><dt>Nascimento</dt><dd>{formatReproductionDate(bird.birthDate)}</dd></div>
        <div><dt>Situação retornada</dt><dd>{birdStatusLabel(bird.status)}</dd></div>
      </dl>
    </article>
  );
}

export function ReproductionDetailScreen({ reproductionId }: Readonly<{ reproductionId: string }>) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [detail, setDetail] = useState<ReproductionDetailsResponse>();
  const [detailError, setDetailError] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [dialogMode, setDialogMode] = useState<ReproductionDialogMode>();
  const [actionError, setActionError] = useState<string>();
  const [actionNotice, setActionNotice] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [refreshAfterActionError, setRefreshAfterActionError] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [finishEndDate, setFinishEndDate] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const firstTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const actionNoticeRef = useRef<HTMLParagraphElement | null>(null);

  if (!client.current) client.current = createApiClient();

  const loadFarm = useCallback(async (recoverSession = true) => {
    const version = ++farmRequestVersion.current;
    setFarmState("loading");
    setFarmError(undefined);
    try {
      const rawResponse = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (version !== farmRequestVersion.current) return;
      const selectedFarm = selectedFarmFromResponse(normalizeFarmResponse(rawResponse));
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setSelectedFarmId(undefined);
        setFarmName("Criatório selecionado");
        setFarmState("blocked");
        return;
      }

      client.current!.setTenant(selectedFarm.breedingFarmId);
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");
    } catch (error) {
      if (version !== farmRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === farmRequestVersion.current) {
          await loadFarm(false);
          return;
        }
      }
      setFarmState(error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409) ? "blocked" : "error");
      setFarmError(farmErrorMessage(error));
    }
  }, [refresh]);

  const loadDetails = useCallback(async (recoverSession = true) => {
    if (!selectedFarmId || !reproductionId) return;
    const version = ++detailRequestVersion.current;
    setDetailState("loading");
    setDetailError(undefined);
    setDetail(undefined);
    try {
      const response = await client.current!.request<ReproductionDetailsResponse>(`api/reproductions/${encodeURIComponent(reproductionId)}`);
      if (version !== detailRequestVersion.current) return;
      setDetail(response);
      setDetailState("ready");
    } catch (error) {
      if (version !== detailRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === detailRequestVersion.current) {
          await loadDetails(false);
          return;
        }
      }
      setDetailState("error");
      setDetailError(reproductionDetailsErrorMessage(error));
    }
  }, [refresh, reproductionId, selectedFarmId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadFarm();
    return () => {
      farmRequestVersion.current += 1;
      detailRequestVersion.current += 1;
    };
  }, [loadFarm, status]);

  useEffect(() => {
    if (status !== "authenticated" || farmState !== "ready" || !selectedFarmId) return;
    void loadDetails();
    return () => { detailRequestVersion.current += 1; };
  }, [farmState, loadDetails, selectedFarmId, status]);

  useEffect(() => {
    if (!dialogMode) return;
    (firstInputRef.current ?? firstTextAreaRef.current)?.focus();
  }, [dialogMode]);

  function openDialog(mode: ReproductionDialogMode, event: React.MouseEvent<HTMLButtonElement>) {
    if (!detail) return;
    actionTriggerRef.current = event.currentTarget;
    setFieldErrors({});
    setActionError(undefined);
    setActionNotice(undefined);
    setRefreshAfterActionError(false);
    setIsConfirmed(false);
    setEditStartDate(detail.startDate);
    setEditEndDate(detail.endDate ?? "");
    setEditNotes(detail.notes ?? "");
    setFinishEndDate(detail.endDate ?? todayUtc());
    setDialogMode(mode);
  }

  function closeDialog() {
    if (isSubmitting) return;
    setDialogMode(undefined);
    setActionError(undefined);
    setFieldErrors({});
    window.setTimeout(() => actionTriggerRef.current?.focus(), 0);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)"
    ));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function validateDialog(): Record<string, string> {
    const errors: Record<string, string> = {};
    const today = todayUtc();
    if (dialogMode === "edit") {
      if (!editStartDate) errors.startDate = "Informe a data de início.";
      else if (editStartDate > today) errors.startDate = "A data de início não pode ser futura.";
      if (editEndDate && editStartDate && editEndDate < editStartDate) errors.endDate = "A data de término não pode ser anterior ao início.";
      else if (editEndDate > today) errors.endDate = "A data de término não pode ser futura.";
      if (editNotes.trim().length > 2000) errors.notes = "As observações não podem exceder 2.000 caracteres.";
    }
    if (dialogMode === "correct-notes" && editNotes.trim().length > 2000) {
      errors.notes = "As observações não podem exceder 2.000 caracteres.";
    }
    if (dialogMode === "finish") {
      if (!finishEndDate) errors.endDate = "Informe a data de término.";
      else if (detail && finishEndDate < detail.startDate) errors.endDate = "A data de término não pode ser anterior ao início.";
      else if (finishEndDate > today) errors.endDate = "A data de término não pode ser futura.";
    }
    if ((dialogMode === "finish" || dialogMode === "cancel") && !isConfirmed) {
      errors.confirmed = "Confirme a alteração antes de continuar.";
    }
    return errors;
  }

  async function requestMutation(
    method: "PATCH" | "PUT",
    body: Record<string, unknown>,
    recoverSession = true
  ): Promise<ReproductionMutationResponse> {
    try {
      return await client.current!.request<ReproductionMutationResponse>(
        `api/reproductions/${encodeURIComponent(reproductionId)}${method === "PATCH" ? "/status" : ""}`,
        { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method }
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok) return requestMutation(method, body, false);
      }
      throw error;
    }
  }

  async function submitDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialogMode || !detail || isSubmitting) return;

    const nextErrors = validateDialog();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    const terminalAction = dialogMode === "finish" || dialogMode === "cancel";
    const method = terminalAction ? "PATCH" : "PUT";
    const body = dialogMode === "finish"
      ? { status: "Finished", confirmed: true, endDate: finishEndDate }
      : dialogMode === "cancel"
        ? { status: "Cancelled", confirmed: true }
        : dialogMode === "edit"
          ? {
              maleBirdId: detail.maleBird.birdId,
              femaleBirdId: detail.femaleBird.birdId,
              startDate: editStartDate,
              endDate: editEndDate || null,
              notes: editNotes.trim() || null
            }
          : { notes: editNotes.trim() || null };

    setIsSubmitting(true);
    setActionError(undefined);
    setFieldErrors({});
    setRefreshAfterActionError(false);
    try {
      const updated = await requestMutation(method, body);
      setDetail((current) => current ? {
        ...current,
        endDate: updated.endDate,
        notes: updated.notes,
        startDate: updated.startDate,
        status: updated.status,
        updatedAtUtc: updated.updatedAtUtc
      } : current);
      setActionNotice(dialogMode === "finish"
        ? "Reprodução encerrada. O histórico foi mantido."
        : dialogMode === "cancel"
          ? "Reprodução cancelada. O histórico foi mantido."
          : dialogMode === "correct-notes"
            ? "Observações corrigidas."
            : "Reprodução atualizada.");
      setDialogMode(undefined);
      window.setTimeout(() => {
        if (terminalAction) actionNoticeRef.current?.focus();
        else actionTriggerRef.current?.focus();
      }, 0);
    } catch (error) {
      setActionError(reproductionMutationErrorMessage(error));
      if (error instanceof ApiError) {
        if (error.status === 400) {
          const serverErrors: Record<string, string> = {};
          for (const field of ["StartDate", "EndDate", "Notes", "Confirmed"]) {
            const message = firstFieldError(error.fields, field);
            if (message) serverErrors[field.charAt(0).toLowerCase() + field.slice(1)] = reproductionFieldErrorMessage(field);
          }
          setFieldErrors(serverErrors);
        }
        setRefreshAfterActionError(error.status === 404 || error.status === 409);
      } else if (error instanceof StaleTenantResponseError) {
        setRefreshAfterActionError(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function refreshAfterConflict() {
    setDialogMode(undefined);
    setActionError(undefined);
    setRefreshAfterActionError(false);
    client.current!.clearCache();
    void loadFarm();
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="reproduction" email={session?.email} farmName={farmName} label="Preparando reprodução" message="Consultando o criatório selecionado." />;
  }
  if (status === "unauthenticated") {
    return <StateCard actionHref="/login" actionLabel="Entrar" heading="Entre para consultar esta reprodução" message="Sua sessão é necessária para visualizar o histórico privado do criatório." />;
  }
  if (status === "forbidden" || status === "error") {
    return <StateCard heading="Não foi possível abrir a reprodução" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="reproduction" email={session.email} farmName={farmName} label="Preparando reprodução" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para consultar esta reprodução."} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard heading="Não foi possível consultar o criatório" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }
  if (detailState === "error") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref={detailError?.includes("Selecione novamente") ? "/onboarding/criatorio/selecionar" : "/reproducao"} actionLabel={detailError?.includes("Selecione novamente") ? "Selecionar criatório" : "Voltar às reproduções"} heading="Não foi possível consultar esta reprodução" message={detailError ?? "Tente novamente para continuar."} onRetry={() => void loadDetails()} /></AuthenticatedShell>;
  }
  if (detailState === "loading" || !detail) {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><main className="document-wizard-page"><div className="document-history-state" role="status"><span aria-hidden="true" className="document-preview-dialog-spinner" /><strong>Consultando reprodução…</strong><span>Carregando os dados retornados pelo histórico do criatório.</span></div></main></AuthenticatedShell>;
  }

  const isActive = detail.status === "Active";
  const isTerminal = detail.status === "Finished" || detail.status === "Cancelled";
  const dialogTitle = dialogMode === "finish"
    ? "Encerrar reprodução?"
    : dialogMode === "cancel"
      ? "Cancelar reprodução?"
      : dialogMode === "correct-notes"
        ? "Corrigir observações"
        : "Editar reprodução";
  const dialogIntro = dialogMode === "finish"
    ? "Informe a data de término. Depois do encerramento, o casal e o período ficam preservados e somente as observações podem ser corrigidas."
    : dialogMode === "cancel"
      ? "A reprodução será marcada como cancelada e permanecerá no histórico. Depois disso, somente as observações poderão ser corrigidas."
      : dialogMode === "correct-notes"
        ? "O casal e o período deste registro são preservados. O contrato permite corrigir somente as observações de uma reprodução encerrada ou cancelada."
        : "Ajuste o período e as observações. O casal registrado será mantido nesta edição.";
  const canSubmitDialog = !isSubmitting && (!(dialogMode === "finish" || dialogMode === "cancel") || isConfirmed);

  return (
    <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}>
      <main className="document-wizard-page reproduction-history-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/reproducao">Reproduções</Link><span aria-hidden="true">›</span><span aria-current="page">Detalhes</span></nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Histórico na origem</p><h1>Detalhes da reprodução</h1><p>Registro consultado no contexto do criatório selecionado.</p></div>
          <Link className="document-wizard-back-link" href="/reproducao">Voltar às reproduções</Link>
        </header>

        <section aria-labelledby="titulo-detalhes-reproducao" className="document-wizard-card reproduction-detail-card">
          <header className="reproduction-detail-heading">
            <div><p className="eyebrow">Período da reprodução</p><h2 id="titulo-detalhes-reproducao">{formatReproductionDate(detail.startDate)}{detail.endDate ? ` — ${formatReproductionDate(detail.endDate)}` : " — em andamento"}</h2></div>
            <div className="reproduction-detail-heading-aside">
              <span className={`reproduction-status-badge ${reproductionStatusClass(detail.status)}`}>{reproductionStatusLabel(detail.status)}</span>
              {isActive && <div aria-label="Ações da reprodução" className="reproduction-detail-actions">
                <button className="auth-secondary-action" onClick={(event) => openDialog("edit", event)} type="button">Editar dados</button>
                <button className="auth-primary-action" onClick={(event) => openDialog("finish", event)} type="button">Encerrar reprodução</button>
                <button className="reproduction-cancel-action" onClick={(event) => openDialog("cancel", event)} type="button">Cancelar reprodução</button>
              </div>}
              {isTerminal && <div aria-label="Ações da reprodução" className="reproduction-detail-actions">
                <button className="auth-secondary-action" onClick={(event) => openDialog("correct-notes", event)} type="button">Corrigir observações</button>
              </div>}
            </div>
          </header>

          {actionNotice && <p className="reproduction-action-notice" ref={actionNoticeRef} role="status" tabIndex={-1}>{actionNotice}</p>}

          <div className="reproduction-detail-pair" aria-label="Casal registrado">
            <ReproductionBirdSnapshot bird={detail.maleBird} label="Macho" />
            <span aria-hidden="true" className="reproduction-detail-pair-mark">×</span>
            <ReproductionBirdSnapshot bird={detail.femaleBird} label="Fêmea" />
          </div>

          <dl className="reproduction-detail-record">
            <div><dt>Data de início</dt><dd>{formatReproductionDate(detail.startDate)}</dd></div>
            <div><dt>Data de término</dt><dd>{formatReproductionDate(detail.endDate)}</dd></div>
            <div><dt>Criada em</dt><dd>{formatReproductionTimestamp(detail.createdAtUtc)}</dd></div>
            <div><dt>Última atualização</dt><dd>{formatReproductionTimestamp(detail.updatedAtUtc)}</dd></div>
          </dl>

          <section aria-labelledby="titulo-observacoes-reproducao" className="reproduction-detail-notes">
            <h3 id="titulo-observacoes-reproducao">Observações</h3>
            <p>{detail.notes?.trim() || "Nenhuma observação informada."}</p>
          </section>
          <p className="document-wizard-privacy-note"><span aria-hidden="true">i</span>Os dados do casal são os fornecidos pelo endpoint de histórico na origem. Esta tela não consulta fichas atuais de aves transferidas.</p>
        </section>

        {dialogMode && <div
          className="bird-status-dialog-backdrop"
          onKeyDown={handleDialogKeyDown}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
        >
          <section
            aria-describedby="reproduction-action-intro"
            aria-labelledby="reproduction-action-title"
            aria-modal="true"
            className="bird-status-dialog"
            ref={dialogRef}
            role="dialog"
          >
            <div className="bird-status-dialog-heading">
              <div><p className="eyebrow">Histórico do criatório</p><h2 id="reproduction-action-title">{dialogTitle}</h2></div>
              <button aria-label="Fechar ação da reprodução" className="bird-status-dialog-close" disabled={isSubmitting} onClick={closeDialog} type="button">×</button>
            </div>
            <p className="bird-status-dialog-intro" id="reproduction-action-intro">{dialogIntro}</p>

            {actionError && <div className="document-preview-dialog-error" role="alert">
              <strong>Não foi possível concluir</strong>
              <span>{actionError}</span>
              {refreshAfterActionError && <button className="auth-secondary-action" onClick={refreshAfterConflict} type="button">Atualizar reprodução</button>}
            </div>}

            <form
              aria-label={dialogTitle}
              aria-busy={isSubmitting}
              className="bird-status-dialog-form"
              noValidate
              onSubmit={(event) => void submitDialog(event)}
            >
              {dialogMode === "edit" && <>
                <div className="reproduction-edit-pair"><strong>Casal mantido</strong><span>{detail.maleBird.name} × {detail.femaleBird.name}</span></div>
                <div className="reproduction-date-grid">
                  <label className="reproduction-field" htmlFor="reproduction-edit-start-date">
                    <span>Data de início <b aria-hidden="true">*</b></span>
                    <input
                      aria-describedby={fieldErrors.startDate ? "erro-data-inicio-edicao" : undefined}
                      aria-invalid={Boolean(fieldErrors.startDate)}
                      disabled={isSubmitting}
                      id="reproduction-edit-start-date"
                      max={todayUtc()}
                      onChange={(event) => { setEditStartDate(event.target.value); setFieldErrors({}); setActionError(undefined); }}
                      ref={firstInputRef}
                      type="date"
                      value={editStartDate}
                    />
                    {fieldErrors.startDate && <small className="reproduction-field-error" id="erro-data-inicio-edicao">{fieldErrors.startDate}</small>}
                  </label>
                  <label className="reproduction-field" htmlFor="reproduction-edit-end-date">
                    <span>Data de término <em>Opcional</em></span>
                    <input
                      aria-describedby={fieldErrors.endDate ? "erro-data-termino-edicao" : undefined}
                      aria-invalid={Boolean(fieldErrors.endDate)}
                      disabled={isSubmitting}
                      id="reproduction-edit-end-date"
                      max={todayUtc()}
                      min={editStartDate || undefined}
                      onChange={(event) => { setEditEndDate(event.target.value); setFieldErrors({}); setActionError(undefined); }}
                      type="date"
                      value={editEndDate}
                    />
                    {fieldErrors.endDate && <small className="reproduction-field-error" id="erro-data-termino-edicao">{fieldErrors.endDate}</small>}
                  </label>
                </div>
                <label className="bird-status-dialog-field" htmlFor="reproduction-edit-notes">
                  <span>Observações <small>{editNotes.length}/2000 caracteres</small></span>
                  <textarea
                    aria-describedby={fieldErrors.notes ? "erro-observacoes-edicao" : undefined}
                    aria-invalid={Boolean(fieldErrors.notes)}
                    disabled={isSubmitting}
                    id="reproduction-edit-notes"
                    maxLength={2000}
                    onChange={(event) => { setEditNotes(event.target.value); setFieldErrors({}); setActionError(undefined); }}
                    value={editNotes}
                  />
                  {fieldErrors.notes && <small className="reproduction-field-error" id="erro-observacoes-edicao">{fieldErrors.notes}</small>}
                </label>
              </>}

              {dialogMode === "correct-notes" && <label className="bird-status-dialog-field" htmlFor="reproduction-correct-notes">
                <span>Observações <small>{editNotes.length}/2000 caracteres</small></span>
                <textarea
                  aria-describedby={fieldErrors.notes ? "erro-observacoes-correcao" : undefined}
                  aria-invalid={Boolean(fieldErrors.notes)}
                  disabled={isSubmitting}
                  id="reproduction-correct-notes"
                  maxLength={2000}
                  onChange={(event) => { setEditNotes(event.target.value); setFieldErrors({}); setActionError(undefined); }}
                  ref={firstTextAreaRef}
                  value={editNotes}
                />
                {fieldErrors.notes && <small className="reproduction-field-error" id="erro-observacoes-correcao">{fieldErrors.notes}</small>}
              </label>}

              {dialogMode === "finish" && <label className="reproduction-field" htmlFor="reproduction-finish-end-date">
                <span>Data de término <b aria-hidden="true">*</b></span>
                <input
                  aria-describedby={fieldErrors.endDate ? "erro-data-termino-encerramento" : undefined}
                  aria-invalid={Boolean(fieldErrors.endDate)}
                  disabled={isSubmitting}
                  id="reproduction-finish-end-date"
                  max={todayUtc()}
                  min={detail.startDate}
                  onChange={(event) => { setFinishEndDate(event.target.value); setFieldErrors({}); setActionError(undefined); }}
                  ref={firstInputRef}
                  type="date"
                  value={finishEndDate}
                />
                {fieldErrors.endDate && <small className="reproduction-field-error" id="erro-data-termino-encerramento">{fieldErrors.endDate}</small>}
              </label>}

              {(dialogMode === "finish" || dialogMode === "cancel") && <>
                <label className="bird-status-confirmation">
                  <input
                    aria-describedby={fieldErrors.confirmed ? "erro-confirmacao-reproducao" : undefined}
                    checked={isConfirmed}
                    disabled={isSubmitting}
                    onChange={(event) => { setIsConfirmed(event.target.checked); setFieldErrors({}); setActionError(undefined); }}
                    ref={dialogMode === "cancel" ? firstInputRef : undefined}
                    type="checkbox"
                  />
                  <span>{dialogMode === "finish" ? "Confirmo o encerramento desta reprodução." : "Confirmo o cancelamento desta reprodução."}</span>
                </label>
                {fieldErrors.confirmed && <small className="reproduction-field-error" id="erro-confirmacao-reproducao">{fieldErrors.confirmed}</small>}
              </>}

              <div className="bird-status-dialog-actions">
                <button className="auth-secondary-action" disabled={isSubmitting} onClick={closeDialog} type="button">Voltar</button>
                <button
                  className={`${dialogMode === "cancel" ? "reproduction-cancel-action" : "auth-primary-action"} ${isSubmitting ? "is-submitting" : canSubmitDialog ? "is-ready" : "is-disabled"}`}
                  disabled={!canSubmitDialog}
                  type="submit"
                >
                  {isSubmitting ? "Salvando…" : dialogMode === "finish" ? "Confirmar encerramento" : dialogMode === "cancel" ? "Confirmar cancelamento" : dialogMode === "correct-notes" ? "Salvar observações" : "Salvar alterações"}
                </button>
              </div>
            </form>
          </section>
        </div>}
      </main>
    </AuthenticatedShell>
  );
}
