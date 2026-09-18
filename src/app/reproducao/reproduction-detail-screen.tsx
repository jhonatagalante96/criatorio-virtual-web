"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, MissingCsrfTokenError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import { resolveBirdImageUrl } from "../plantel/aves/bird-image";
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
  type ReproductionOriginBirdOption,
  type ReproductionOriginBirdOptionsResponse,
  type ReproductionDetailsResponse
} from "./reproduction-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type DetailState = "error" | "loading" | "ready";
type OriginSearchState = "empty" | "error" | "idle" | "loading" | "ready";
type ReproductionDialogMode = "cancel" | "correct-notes" | "edit" | "finish" | "link-origin";

interface CurrentBirdPhotoResponse {
  birdId: string;
  breedingFarmId: string;
  imageUrl?: string | null;
}

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
  if (error instanceof MissingCsrfTokenError) {
    return "O token de segurança não está disponível. Atualize a página e tente novamente.";
  }
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

function reproductionOriginSearchErrorMessage(error: unknown): string {
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize a reprodução antes de buscar aves.";
  if (!(error instanceof ApiError)) return "Não foi possível buscar aves cadastradas. Verifique sua conexão e tente novamente.";
  if (error.status === 401) return "Sua sessão expirou. Atualize a sessão e tente buscar novamente.";
  if (error.status === 403) return "Sua conta não tem permissão para buscar aves deste criatório.";
  if (error.status === 404) return "O criatório selecionado não está disponível.";
  if (error.status === 409) return "Selecione novamente um criatório antes de buscar aves.";
  if (error.status >= 500) return "A busca está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível buscar aves cadastradas. Verifique sua conexão e tente novamente.";
}

function reproductionOriginMutationErrorMessage(error: unknown): string {
  if (error instanceof MissingCsrfTokenError) {
    return "O token de segurança não está disponível. Atualize a página e tente novamente.";
  }
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Atualize os dados antes de vincular a origem.";
  if (!(error instanceof ApiError)) return "Não foi possível vincular a origem reprodutiva. Verifique sua conexão e tente novamente.";
  if (error.status === 400) {
    const birdError = firstFieldError(error.fields, "BirdId")?.toLowerCase() ?? "";
    if (birdError.includes("own offspring")) return "Uma das aves do casal não pode ser vinculada como filhote desta reprodução.";
    if (birdError.includes("cycle")) return "Esse vínculo criaria um ciclo na genealogia. Escolha outra ave.";
    if (birdError.includes("six-digit")) return "Escolha uma ave ativa com anilha válida de seis dígitos.";
    if (birdError.includes("not found")) return "A ave selecionada não está mais disponível. Busque outra ave.";
    if (firstFieldError(error.fields, "Confirmed")) return "Confirme o vínculo antes de continuar.";
    return "Revise a ave selecionada e tente confirmar o vínculo novamente.";
  }
  if (error.status === 401) return "Sua sessão expirou. Atualize a sessão e tente vincular novamente.";
  if (error.status === 403) return "Sua conta não tem permissão para alterar esta reprodução.";
  if (error.status === 404) return "Esta reprodução não está disponível no criatório selecionado. Atualize os dados antes de continuar.";
  if (error.status === 409) {
    const message = error.message.toLowerCase();
    if (message.includes("already has another genealogy origin")) return "Esta ave já possui outra origem genealógica. Escolha outra ave para vincular.";
    if (message.includes("changed by another request")) return "A ave foi alterada por outra solicitação. Atualize os dados e tente novamente.";
    if (message.includes("breeding farm must be selected")) return "Selecione novamente um criatório antes de vincular a origem.";
    return "O vínculo mudou desde a última consulta. Atualize os dados antes de tentar novamente.";
  }
  if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  return "Não foi possível vincular a origem reprodutiva. Confira os dados e tente novamente.";
}

function isEligibleOriginBird(option: ReproductionOriginBirdOption, detail: ReproductionDetailsResponse): boolean {
  return /^\d{6}$/.test(option.ringNumber ?? "") &&
    option.birdId !== detail.maleBird.birdId &&
    option.birdId !== detail.femaleBird.birdId;
}

function formatOriginBirdOption(option: ReproductionOriginBirdOption): string {
  const details = [
    "Anilha " + (option.ringNumber ?? "Não informada"),
    birdSexLabel(option.sex),
    option.birthDate ? "Nascimento " + formatReproductionDate(option.birthDate) : undefined
  ].filter(Boolean);
  return details.join(" · ");
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
  bird,
  imageUrl
}: Readonly<{ label: string; bird: ReproductionDetailsResponse["maleBird"]; imageUrl?: string | null }>) {
  return (
    <article className="reproduction-detail-bird">
      <header><span aria-hidden="true" className="reproduction-detail-bird-icon">{imageUrl ? <img alt="" src={resolveBirdImageUrl(imageUrl)} /> : <DashboardIcon name="bird" />}</span><div><p className="eyebrow">{label}</p><h3>{bird.name}</h3></div></header>
      <dl>
        <div><dt>Sexo</dt><dd>{birdSexLabel(bird.sex)}</dd></div>
        <div><dt>Anilha</dt><dd>{bird.ringNumber || "Não informada"}</dd></div>
        <div><dt>Nascimento</dt><dd>{formatReproductionDate(bird.birthDate)}</dd></div>
        <div><dt>Situação</dt><dd>{birdStatusLabel(bird.status)}</dd></div>
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
  const [birdImageUrls, setBirdImageUrls] = useState<Record<string, string | null>>({});
  const [detailError, setDetailError] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [originQuery, setOriginQuery] = useState("");
  const [originOptions, setOriginOptions] = useState<ReproductionOriginBirdOption[]>([]);
  const [selectedOriginBird, setSelectedOriginBird] = useState<ReproductionOriginBirdOption>();
  const [originSearchState, setOriginSearchState] = useState<OriginSearchState>("idle");
  const [originSearchError, setOriginSearchError] = useState<string>();
  const [originSearchRetry, setOriginSearchRetry] = useState(0);
  const [isOriginConfirmed, setIsOriginConfirmed] = useState(false);
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
  const originSearchId = useId();
  const originOptionsId = useId();
  const csrfToken = useRef<string | undefined>(undefined);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const ensureCsrfToken = useCallback(async (force = false): Promise<string> => {
    if (!csrfToken.current || force) {
      try {
        csrfToken.current = await client.current!.fetchAntiforgeryToken();
      } catch (error) {
        throw new MissingCsrfTokenError();
      }
    }
    return csrfToken.current;
  }, []);

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
    setBirdImageUrls({});
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
    if (detailState !== "ready" || !detail || !selectedFarmId) return;
    const controller = new AbortController();
    const birds = [detail.maleBird, detail.femaleBird].filter((bird) => bird.status.toLowerCase() !== "transferred");

    void Promise.all(birds.map(async (bird) => {
      try {
        const profile = await client.current!.request<CurrentBirdPhotoResponse>(
          `api/birds/${encodeURIComponent(bird.birdId)}`,
          { signal: controller.signal }
        );
        const belongsToSelectedFarm = profile.breedingFarmId.toLowerCase() === selectedFarmId.toLowerCase();
        const matchesBird = profile.birdId.toLowerCase() === bird.birdId.toLowerCase();
        return [bird.birdId, belongsToSelectedFarm && matchesBird ? profile.imageUrl ?? null : null] as const;
      } catch {
        return [bird.birdId, null] as const;
      }
    })).then((entries) => {
      if (!controller.signal.aborted) setBirdImageUrls(Object.fromEntries(entries));
    });

    return () => controller.abort();
  }, [detail, detailState, selectedFarmId]);

  useEffect(() => {
    if (dialogMode !== "link-origin" || !selectedFarmId || !detail) return;
    const query = originQuery.trim();
    if (query.length < 2) {
      setOriginOptions([]);
      setOriginSearchError(undefined);
      setOriginSearchState("idle");
      return;
    }

    const controller = new AbortController();
    setOriginOptions([]);
    setOriginSearchError(undefined);
    setOriginSearchState("loading");
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await client.current!.request<ReproductionOriginBirdOptionsResponse>(
          "api/birds/parent-options?search=" + encodeURIComponent(query) + "&limit=20",
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        const options = Array.isArray(response.items)
          ? response.items.filter((option) => isEligibleOriginBird(option, detail))
          : [];
        setOriginOptions(options);
        setOriginSearchState(options.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          const recovered = await refresh({ showLoading: false });
          if (controller.signal.aborted) return;
          if (recovered.ok) {
            setOriginSearchRetry((value) => value + 1);
            return;
          }
        }
        setOriginSearchError(reproductionOriginSearchErrorMessage(error));
        setOriginSearchState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [detail, dialogMode, originQuery, originSearchRetry, refresh, selectedFarmId]);

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
    setOriginQuery("");
    setOriginOptions([]);
    setSelectedOriginBird(undefined);
    setOriginSearchState("idle");
    setOriginSearchError(undefined);
    setIsOriginConfirmed(false);
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
    setOriginQuery("");
    setOriginOptions([]);
    setSelectedOriginBird(undefined);
    setIsOriginConfirmed(false);
    window.setTimeout(() => actionTriggerRef.current?.focus(), 0);
  }

  function chooseOriginBird(option: ReproductionOriginBirdOption) {
    setSelectedOriginBird(option);
    setOriginQuery("");
    setOriginOptions([]);
    setOriginSearchState("idle");
    setOriginSearchError(undefined);
    setIsOriginConfirmed(false);
    setActionError(undefined);
    setFieldErrors({});
  }

  function changeOriginBird() {
    setSelectedOriginBird(undefined);
    setIsOriginConfirmed(false);
    setActionError(undefined);
    setFieldErrors({});
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
    if (dialogMode === "link-origin" && !selectedOriginBird) errors.birdId = "Busque e selecione uma ave que possa ser vinculada.";
    if (dialogMode === "link-origin" && !isOriginConfirmed) errors.confirmed = "Confirme o vínculo antes de continuar.";
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
      await ensureCsrfToken();
      return await client.current!.request<ReproductionMutationResponse>(
        `api/reproductions/${encodeURIComponent(reproductionId)}${method === "PATCH" ? "/status" : ""}`,
        {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method,
          requiresCsrf: true
        }
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok) {
          await ensureCsrfToken(true);
          return requestMutation(method, body, false);
        }
      }
      throw error;
    }
  }

  async function requestOriginMutation(birdId: string, recoverSession = true): Promise<void> {
    try {
      await ensureCsrfToken();
      await client.current!.request<unknown>(
        "api/reproductions/" + encodeURIComponent(reproductionId) + "/origin",
        {
          body: JSON.stringify({ birdId, confirmed: true }),
          headers: { "content-type": "application/json" },
          method: "POST",
          requiresCsrf: true
        }
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok) {
          await ensureCsrfToken(true);
          return requestOriginMutation(birdId, false);
        }
      }
      throw error;
    }
  }

  async function submitOriginMutation() {
    if (!selectedOriginBird) return;
    setIsSubmitting(true);
    setActionError(undefined);
    setFieldErrors({});
    setRefreshAfterActionError(false);
    try {
      await requestOriginMutation(selectedOriginBird.birdId);
      setActionNotice("Origem reprodutiva vinculada a " + selectedOriginBird.name + ".");
      setDialogMode(undefined);
      window.setTimeout(() => actionNoticeRef.current?.focus(), 0);
    } catch (error) {
      const hasFieldValidation = error instanceof ApiError && error.status === 400 && (
        Boolean(firstFieldError(error.fields, "BirdId")) || Boolean(firstFieldError(error.fields, "Confirmed"))
      );
      setActionError(hasFieldValidation ? "Revise os dados do vínculo destacados abaixo." : reproductionOriginMutationErrorMessage(error));
      if (error instanceof ApiError) {
        if (error.status === 400) {
          const serverErrors: Record<string, string> = {};
          if (firstFieldError(error.fields, "BirdId")) {
            serverErrors.birdId = reproductionOriginMutationErrorMessage(error);
          }
          if (firstFieldError(error.fields, "Confirmed")) {
            serverErrors.confirmed = "Confirme o vínculo antes de continuar.";
          }
          setFieldErrors(serverErrors);
        }
        const alreadyLinked = error.status === 409 && error.message.toLowerCase().includes("already has another genealogy origin");
        setRefreshAfterActionError(error.status === 404 || (error.status === 409 && !alreadyLinked));
      } else if (error instanceof StaleTenantResponseError) {
        setRefreshAfterActionError(true);
      }
    } finally {
      setIsSubmitting(false);
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

    if (dialogMode === "link-origin") {
      await submitOriginMutation();
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
  const dialogTitle = dialogMode === "link-origin"
    ? "Vincular ave como filhote"
    : dialogMode === "finish"
    ? "Encerrar reprodução?"
    : dialogMode === "cancel"
      ? "Cancelar reprodução?"
      : dialogMode === "correct-notes"
        ? "Corrigir observações"
        : "Editar reprodução";
  const dialogIntro = dialogMode === "link-origin"
    ? "Escolha uma ave ativa do criatório selecionado e confira a origem antes de confirmar o vínculo."
    : dialogMode === "finish"
    ? "Informe a data de término. Depois do encerramento, o casal e o período ficam preservados e somente as observações podem ser corrigidas."
    : dialogMode === "cancel"
      ? "A reprodução será marcada como cancelada e permanecerá no histórico. Depois disso, somente as observações poderão ser corrigidas."
      : dialogMode === "correct-notes"
        ? "O casal e o período deste registro são preservados. O contrato permite corrigir somente as observações de uma reprodução encerrada ou cancelada."
        : "Ajuste o período e as observações. O casal registrado será mantido nesta edição.";
  const canSubmitDialog = !isSubmitting && (dialogMode === "link-origin"
    ? Boolean(selectedOriginBird && isOriginConfirmed)
    : (!(dialogMode === "finish" || dialogMode === "cancel") || isConfirmed));

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
              <div aria-label="Ações da reprodução" className="reproduction-detail-actions">
                {isActive && <>
                  <button className="auth-secondary-action" onClick={(event) => openDialog("edit", event)} type="button">Editar dados</button>
                  <button className="auth-primary-action" onClick={(event) => openDialog("finish", event)} type="button">Encerrar reprodução</button>
                  <button className="reproduction-cancel-action" onClick={(event) => openDialog("cancel", event)} type="button">Cancelar reprodução</button>
                </>}
                {isTerminal && <button className="auth-secondary-action" onClick={(event) => openDialog("correct-notes", event)} type="button">Corrigir observações</button>}
                <button className="auth-secondary-action" onClick={(event) => openDialog("link-origin", event)} type="button">Vincular origem reprodutiva</button>
              </div>
            </div>
          </header>

          {actionNotice && <p className="reproduction-action-notice" ref={actionNoticeRef} role="status" tabIndex={-1}>{actionNotice}</p>}

          <div className="reproduction-detail-pair" aria-label="Casal registrado">
            <ReproductionBirdSnapshot bird={detail.maleBird} imageUrl={birdImageUrls[detail.maleBird.birdId]} label="Macho" />
            <span aria-hidden="true" className="reproduction-detail-pair-mark">×</span>
            <ReproductionBirdSnapshot bird={detail.femaleBird} imageUrl={birdImageUrls[detail.femaleBird.birdId]} label="Fêmea" />
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
          <p className="document-wizard-privacy-note"><span aria-hidden="true">i</span>As informações do casal vêm do histórico do criatório de origem. Quando uma ave foi transferida, esta tela não mostra a ficha atual dela.</p>
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
              {dialogMode === "link-origin" && <>
                <section aria-label="Buscar ave que possa ser vinculada" className="reproduction-origin-search">
                  <label className="bird-status-dialog-field" htmlFor={originSearchId}>
                    <span>Buscar ave por nome ou anilha</span>
                    <input
                      aria-controls={originOptionsId}
                      aria-describedby={originSearchId + "-help"}
                      autoComplete="off"
                      disabled={isSubmitting || Boolean(selectedOriginBird)}
                      id={originSearchId}
                      maxLength={100}
                      onChange={(event) => {
                        setOriginQuery(event.target.value);
                        setSelectedOriginBird(undefined);
                        setIsOriginConfirmed(false);
                        setActionError(undefined);
                        setFieldErrors({});
                      }}
                      placeholder="Ex.: Filhote Azul ou 930001"
                      ref={firstInputRef}
                      type="search"
                      value={originQuery}
                    />
                  </label>
                  <p className="external-ancestor-help" id={originSearchId + "-help"}>Digite ao menos dois caracteres. A busca considera aves ativas do criatório selecionado com anilha de seis dígitos.</p>
                  {selectedOriginBird && <div className="external-ancestor-selected" role="status">
                    <span><strong>{selectedOriginBird.name}</strong><small>{formatOriginBirdOption(selectedOriginBird)}</small></span>
                    <button className="text-action" disabled={isSubmitting} onClick={changeOriginBird} type="button">Alterar seleção</button>
                  </div>}
                  <div aria-live="polite" className="external-ancestor-results" id={originOptionsId}>
                    {originSearchState === "loading" && <p role="status">Buscando aves…</p>}
                    {originSearchState === "idle" && !selectedOriginBird && <p role="status">Digite ao menos dois caracteres para buscar.</p>}
                    {originSearchState === "empty" && <p role="status">Nenhuma ave que possa ser vinculada foi encontrada. Confira o nome ou a anilha informada.</p>}
                    {originSearchState === "error" && <div className="external-ancestor-search-error">
                      <p role="alert">{originSearchError}</p>
                      <button className="auth-secondary-action" disabled={isSubmitting} onClick={() => setOriginSearchRetry((value) => value + 1)} type="button">Tentar novamente</button>
                    </div>}
                    {originSearchState === "ready" && <ul aria-label="Aves disponíveis para vínculo" className="external-ancestor-options" role="listbox">
                      {originOptions.map((option) => <li key={option.birdId}>
                        <button aria-selected={false} disabled={isSubmitting} onClick={() => chooseOriginBird(option)} role="option" type="button">
                          <strong>{option.name}</strong>
                          <span>{formatOriginBirdOption(option)}</span>
                        </button>
                      </li>)}
                    </ul>}
                  </div>
                  {fieldErrors.birdId && <small className="reproduction-field-error" role="alert">{fieldErrors.birdId}</small>}
                </section>

                <section aria-labelledby="reproduction-origin-review-title" className="reproduction-origin-review">
                  <h3 id="reproduction-origin-review-title">Revisar vínculo</h3>
                  <dl>
                    <div><dt>Ave vinculada</dt><dd>{selectedOriginBird?.name ?? "Selecione uma ave que possa ser vinculada"}</dd></div>
                    <div><dt>Anilha</dt><dd>{selectedOriginBird?.ringNumber ?? "Não informada"}</dd></div>
                    <div><dt>Sexo</dt><dd>{selectedOriginBird ? birdSexLabel(selectedOriginBird.sex) : "Não informado"}</dd></div>
                    <div><dt>Origem reprodutiva</dt><dd>{detail.maleBird.name} × {detail.femaleBird.name}</dd></div>
                  </dl>
                </section>

                <label className="bird-status-confirmation">
                  <input
                    aria-describedby={fieldErrors.confirmed ? "erro-confirmacao-origem" : undefined}
                    checked={isOriginConfirmed}
                    disabled={isSubmitting || !selectedOriginBird}
                    onChange={(event) => { setIsOriginConfirmed(event.target.checked); setFieldErrors({}); setActionError(undefined); }}
                    type="checkbox"
                  />
                  <span>Confirmo que esta ave é filha do casal desta reprodução.</span>
                </label>
                {fieldErrors.confirmed && <small className="reproduction-field-error" id="erro-confirmacao-origem">{fieldErrors.confirmed}</small>}
              </>}

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
                {isSubmitting ? dialogMode === "link-origin" ? "Vinculando…" : "Salvando…" : dialogMode === "link-origin" ? "Confirmar vínculo" : dialogMode === "finish" ? "Confirmar encerramento" : dialogMode === "cancel" ? "Confirmar cancelamento" : dialogMode === "correct-notes" ? "Salvar observações" : "Salvar alterações"}
                </button>
              </div>
            </form>
          </section>
        </div>}
      </main>
    </AuthenticatedShell>
  );
}
