"use client";

import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, StaleTenantResponseError } from "../../../lib/http/api-client";
import { DashboardIcon } from "../../components/dashboard-icons";

export type BirdStatus = "Active" | "Archived" | "Transferred" | "Deceased" | "Escaped";
type StatusOption = Exclude<BirdStatus, "Active" | "Transferred">;
type DialogState = "form" | "success";

export interface BirdStatusResponse {
  birdId?: string;
  deathDate: string | null;
  notes: string | null;
  status: BirdStatus;
  updatedAtUtc?: string;
}

interface BirdStatusActionProps {
  birdBirthDate: string | null;
  birdId: string;
  birdName: string;
  client: ApiClient;
  label?: string;
  onSessionExpired: () => Promise<unknown> | void;
  onUpdated?: (bird: BirdStatusResponse) => void;
  prepareMutation: () => Promise<void>;
  variant?: "detail" | "menu";
}

const statusOptions: Array<{ description: string; title: string; value: StatusOption }> = [
  {
    description: "Retira a ave do plantel ativo, mantendo a ficha para consulta.",
    title: "Arquivar ave",
    value: "Archived"
  },
  {
    description: "Registra a data e mantém a ficha disponível para consulta histórica.",
    title: "Registrar falecimento",
    value: "Deceased"
  },
  {
    description: "Marca a ave como escapada e preserva os dados já registrados.",
    title: "Registrar fuga",
    value: "Escaped"
  }
];

const statusLabels: Record<StatusOption, string> = {
  Archived: "arquivada",
  Deceased: "falecida",
  Escaped: "escapada"
};

function statusTitle(status: StatusOption): string {
  return statusOptions.find((option) => option.value === status)?.title ?? "Alterar situação";
}

function firstFieldError(fields: Record<string, string[]>, field: string): string | undefined {
  const key = Object.keys(fields).find((candidate) => candidate.toLowerCase() === field.toLowerCase());
  return key ? fields[key]?.[0] : undefined;
}

function localizeServerError(field: string, status: StatusOption, message: string): string {
  const normalized = message.toLowerCase();
  if (field === "deathDate") {
    if (normalized.includes("required")) return "Informe a data do falecimento.";
    if (normalized.includes("future")) return "A data do falecimento não pode ser futura.";
    if (normalized.includes("before")) return "A data do falecimento não pode ser anterior ao nascimento.";
    return "Confira a data do falecimento.";
  }
  if (field === "confirmed") return "Marque a confirmação para continuar.";
  if (field === "notes") return "As observações não podem exceder 2.000 caracteres.";
  if (field === "status") return "Escolha uma situação válida.";
  if (status === "Deceased") return "Confira os dados do falecimento.";
  return "Confira os dados informados.";
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Sua conta não tem permissão para alterar a situação desta ave.";
    if (error.status === 404) return "A ave não foi encontrada no criatório selecionado.";
    if (error.status === 409) {
      return error.message.toLowerCase().includes("transfer")
        ? "Esta ave está com uma transferência pendente. Cancele ou conclua o fluxo antes de alterar a situação."
        : "A situação desta ave não pode mais ser alterada a partir do estado atual.";
    }
    if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  }
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a ficha e tente novamente.";
  return "Não foi possível alterar a situação desta ave. Tente novamente.";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BirdStatusAction({
  birdBirthDate,
  birdId,
  birdName,
  client,
  label = "Inativar",
  onSessionExpired,
  onUpdated,
  prepareMutation,
  variant = "menu"
}: Readonly<BirdStatusActionProps>) {
  const [confirmed, setConfirmed] = useState(false);
  const [deathDate, setDeathDate] = useState("");
  const [dialogState, setDialogState] = useState<DialogState>("form");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<StatusOption>("Archived");
  const [successMessage, setSuccessMessage] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstControlRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isSubmitDisabled = isSubmitting || !confirmed || (status === "Deceased" && !deathDate);

  useEffect(() => {
    if (!isOpen) return;
    firstControlRef.current?.focus();
  }, [isOpen]);

  function closeDialog() {
    if (isSubmitting) return;
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function openDialog() {
    setConfirmed(false);
    setDeathDate("");
    setDialogState("form");
    setErrors({});
    setFormError(undefined);
    setNotes("");
    setStatus("Archived");
    setSuccessMessage(undefined);
    setIsOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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

  function changeStatus(nextStatus: StatusOption) {
    setStatus(nextStatus);
    setErrors((current) => {
      const next = { ...current };
      delete next.deathDate;
      delete next.notes;
      return next;
    });
    if (nextStatus !== "Deceased") {
      setDeathDate("");
      setNotes("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors: Record<string, string[]> = {};
    if (!confirmed) nextErrors.confirmed = ["Marque a confirmação para continuar."];
    if (status === "Deceased") {
      if (!deathDate) nextErrors.deathDate = ["Informe a data do falecimento."];
      else if (deathDate > today()) nextErrors.deathDate = ["A data do falecimento não pode ser futura."];
      else if (birdBirthDate && deathDate < birdBirthDate) nextErrors.deathDate = ["A data do falecimento não pode ser anterior ao nascimento."];
      if (notes.trim().length > 2000) nextErrors.notes = ["As observações não podem exceder 2.000 caracteres."];
    }
    setErrors(nextErrors);
    setFormError(undefined);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await prepareMutation();
      const updatedBird = await client.request<BirdStatusResponse>(`api/birds/${encodeURIComponent(birdId)}/status`, {
        body: JSON.stringify({
          confirmed: true,
          deathDate: status === "Deceased" ? deathDate : null,
          notes: status === "Deceased" ? notes.trim() || null : null,
          status
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      });
      onUpdated?.(updatedBird);
      setDialogState("success");
      setSuccessMessage(`Situação alterada para ${statusLabels[status]}.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await onSessionExpired();
        setFormError("Sua sessão expirou. Entre novamente para continuar.");
      } else if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        const nextFieldErrors: Record<string, string[]> = {};
        for (const field of ["confirmed", "deathDate", "notes", "status"]) {
          const message = firstFieldError(error.fields, field);
          if (message) nextFieldErrors[field] = [localizeServerError(field, status, message)];
        }
        setErrors(nextFieldErrors);
        setFormError(nextFieldErrors.request?.[0] ?? (Object.keys(nextFieldErrors).length === 0 ? failureMessage(error) : undefined));
      } else {
        setFormError(failureMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        className={variant === "detail" ? "bird-detail-status-action" : "bird-row-action is-danger"}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <DashboardIcon name="ban" />
        <span>{label}</span>
      </button>

      {isOpen && (
        <div
          className="bird-status-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            aria-labelledby="bird-status-dialog-title"
            aria-modal="true"
            className="bird-status-dialog"
            onKeyDown={handleKeyDown}
            ref={dialogRef}
            role="dialog"
          >
            <div className="bird-status-dialog-heading">
              <div>
                <p className="eyebrow">Alterar situação</p>
                <h2 id="bird-status-dialog-title">{birdName}</h2>
              </div>
              <button aria-label="Fechar alteração de situação" className="bird-status-dialog-close" disabled={isSubmitting} onClick={closeDialog} type="button">×</button>
            </div>

            {dialogState === "success" ? (
              <div className="bird-status-dialog-success" role="status">
                <span aria-hidden="true" className="bird-status-dialog-success-mark">✓</span>
                <div>
                  <h3>Alteração concluída</h3>
                  <p>{successMessage}</p>
                  <p>A ficha continua disponível para consulta no modo não ativo.</p>
                </div>
                <button className="auth-primary-action" onClick={closeDialog} type="button">Fechar</button>
              </div>
            ) : (
              <form aria-label={`Alterar situação de ${birdName}`} className="bird-status-dialog-form" noValidate onSubmit={handleSubmit}>
                <p className="bird-status-dialog-intro">Escolha a nova situação de <strong>{birdName}</strong>. Essa alteração fica registrada no sistema e não pode ser desfeita neste fluxo.</p>
                {formError && <div className="form-error" role="alert">{formError}</div>}

                <fieldset aria-describedby={firstFieldError(errors, "status") ? "bird-status-error" : undefined} className="bird-status-options">
                  <legend>Nova situação</legend>
                  {statusOptions.map((option, index) => (
                    <label className={`bird-status-option${status === option.value ? " is-selected" : ""}`} key={option.value}>
                      <input
                        aria-label={option.title}
                        checked={status === option.value}
                        disabled={isSubmitting}
                        name="bird-status"
                        onChange={() => changeStatus(option.value)}
                        ref={index === 0 ? firstControlRef : undefined}
                        type="radio"
                        value={option.value}
                      />
                      <span><strong>{option.title}</strong><small>{option.description}</small></span>
                    </label>
                  ))}
                  {firstFieldError(errors, "status") && <p className="field-error" id="bird-status-error">{firstFieldError(errors, "status")}</p>}
                </fieldset>

                {status === "Deceased" && (
                  <>
                    <div className="bird-status-dialog-field">
                      <label htmlFor="bird-death-date">Data do falecimento <span>(obrigatória)</span></label>
                      <input
                        aria-describedby={firstFieldError(errors, "deathDate") ? "bird-death-date-error" : undefined}
                        aria-invalid={Boolean(firstFieldError(errors, "deathDate"))}
                        disabled={isSubmitting}
                        id="bird-death-date"
                        max={today()}
                        min={birdBirthDate ?? undefined}
                        onChange={(event) => setDeathDate(event.target.value)}
                        type="date"
                        value={deathDate}
                      />
                      {firstFieldError(errors, "deathDate") && <p className="field-error" id="bird-death-date-error">{firstFieldError(errors, "deathDate")}</p>}
                    </div>
                    <div className="bird-status-dialog-field">
                      <label htmlFor="bird-status-notes">Observações <span>(opcional)</span></label>
                      <textarea
                        aria-describedby="bird-status-notes-help"
                        aria-invalid={Boolean(firstFieldError(errors, "notes"))}
                        disabled={isSubmitting}
                        id="bird-status-notes"
                        maxLength={2000}
                        onChange={(event) => setNotes(event.target.value)}
                        value={notes}
                      />
                      <p className="bird-field-help" id="bird-status-notes-help">Até 2.000 caracteres.</p>
                      {firstFieldError(errors, "notes") && <p className="field-error">{firstFieldError(errors, "notes")}</p>}
                    </div>
                  </>
                )}

                <label className="bird-status-confirmation">
                  <input
                    aria-describedby={firstFieldError(errors, "confirmed") ? "bird-status-confirmed-error" : undefined}
                    checked={confirmed}
                    disabled={isSubmitting}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Confirmo que desejo alterar a situação desta ave para <strong>{statusTitle(status).toLowerCase()}</strong>.</span>
                </label>
                {firstFieldError(errors, "confirmed") && <p className="field-error" id="bird-status-confirmed-error">{firstFieldError(errors, "confirmed")}</p>}

                <div className="bird-status-dialog-actions">
                  <button className="auth-secondary-action" disabled={isSubmitting} onClick={closeDialog} type="button">Cancelar</button>
                  <button className="auth-primary-action" disabled={isSubmitDisabled} type="submit">{isSubmitting ? "Salvando…" : "Confirmar alteração"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
