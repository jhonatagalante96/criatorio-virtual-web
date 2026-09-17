"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../lib/http/api-client";
import type { ApiRequestOptions } from "../../../../lib/http/api-client";
import { AppLoadingState } from "../../../components/app-loading-state";
import { AuthenticatedShell } from "../../../components/authenticated-shell";
import { DashboardIcon } from "../../../components/dashboard-icons";
import { resolveBirdImageUrl } from "../../../plantel/aves/bird-image";

type BirdSex = "Female" | "Male" | "Unknown";
type BirdStatus = "Active" | "Archived" | "Deceased" | "Escaped" | "Transferred";
type FarmState = "blocked" | "error" | "loading" | "ready";
type SearchState = "empty" | "error" | "idle" | "loading" | "ready";
type EligibilityState = "error" | "loading" | "ready";
type WizardStep = 0 | 1 | 2;
type Notice = { kind: "error" | "info" | "success"; text: string };

interface FarmSummary {
  breedingFarmId: string;
  isSelected: boolean;
  name: string;
}

interface FarmSelectionResponse {
  breedingFarms?: FarmSummary[];
  selectedBreedingFarmId: string | null;
}

interface BirdSummary {
  ageInYears: number | null;
  birthDate: string | null;
  birdId: string;
  identificationPending: boolean;
  imageUrl?: string | null;
  name: string;
  ringNumber: string | null;
  sex: BirdSex;
  speciesPopularName: string;
  status: BirdStatus;
}

interface BirdListResponse {
  items: BirdSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface BirdEligibilityIssue {
  code: string;
  message: string;
}

interface BirdEligibilityResponse {
  birdId: string;
  identificationPending: boolean;
  isEligible: boolean;
  issues: BirdEligibilityIssue[];
}

interface ExternalTransferResponse {
  externalTransferId: string;
  birdId: string;
  breedingFarmId: string;
  recipientName: string;
  notes: string | null;
  status: string;
  completedAtUtc: string;
}

const wizardSteps = ["Ave", "Dados", "Revisão"] as const;
const PAGE_SIZE = 10;

async function requestWithSessionRecovery<T>(
  client: ApiClient,
  refresh: () => Promise<{ ok: boolean }>,
  path: string,
  options?: ApiRequestOptions
): Promise<T> {
  try {
    return await client.request<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const refreshed = await refresh();
      if (refreshed.ok) return client.request<T>(path, options);
    }
    throw error;
  }
}

function sexLabel(sex: BirdSex): string {
  if (sex === "Male") return "Macho";
  if (sex === "Female") return "Fêmea";
  return "Não identificado";
}

function eligibilityIssueTitle(code: string): string {
  if (code === "MissingRingNumber") return "Anilha não informada";
  if (code === "InactiveStatus") return "Ave inativa";
  return "Confira estes dados antes de transferir";
}

function eligibilityIssueMessage(code: string): string {
  if (code === "MissingRingNumber") return "A ave precisa ter uma anilha válida de seis dígitos.";
  if (code === "InactiveStatus") return "Somente aves ativas podem ser transferidas.";
  return "Revise a identificação e a situação desta ave antes de continuar.";
}

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível para esta conta.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de solicitar a transferência.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado.";
}

function birdSearchErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar as aves deste criatório.";
  if (error instanceof ApiError && [404, 409].includes(error.status)) return "O criatório selecionado não está disponível. Selecione-o novamente para continuar.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível buscar as aves. Tente novamente.";
}

function eligibilityErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar esta ave.";
  if (error instanceof ApiError && error.status === 404) return "A ave não está disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de verificar a ave.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível confirmar se esta ave pode ser transferida.";
}

function externalTransferErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente antes de confirmar a transferência.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para concluir esta transferência.";
  if (error instanceof ApiError && error.status === 404) return "A ave não está mais disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 409) {
    const message = error.message.toLowerCase();
    if (message.includes("pending internal transfer")) return "Esta ave tem uma transferência interna pendente. Resolva essa solicitação antes de continuar.";
    if (message.includes("already been completed")) return "Esta ave já teve uma transferência externa concluída.";
    return "O criatório selecionado mudou. Atualize os dados e tente novamente.";
  }
  if (error instanceof ApiError && error.status === 400) {
    const fields = Object.keys(error.fields).join(" ").toLowerCase();
    if (fields.includes("recipientname")) return "Informe um nome de recebedor com até 200 caracteres.";
    if (fields.includes("notes")) return "As observações devem ter até 2.000 caracteres.";
    if (fields.includes("birdid")) return "A ave não pode mais ser transferida. Confira os dados e tente novamente.";
    if (fields.includes("confirmed")) return "Confirme que deseja concluir a transferência antes de continuar.";
    return "Revise os dados da transferência e tente novamente.";
  }
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível concluir a transferência. Tente novamente.";
}

function TransferStateCard({
  actionHref,
  actionLabel,
  heading,
  message,
  onRetry
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return (
    <main className="document-wizard-page">
      <section className="document-wizard-state" role={onRetry ? "alert" : undefined}>
        <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="transfer" /></span>
        <h1>{heading}</h1>
        <p>{message}</p>
        {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
        {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
      </section>
    </main>
  );
}

function Progress({ activeStep, onSelect }: Readonly<{ activeStep: WizardStep; onSelect: (step: WizardStep) => void }>) {
  return (
    <ol aria-label="Etapas da transferência externa" className="document-wizard-progress internal-transfer-progress">
      {wizardSteps.map((label, index) => {
        const step = index as WizardStep;
        const active = activeStep === step;
        const complete = step < activeStep;
        return (
          <li className={`${active ? "is-active is-current" : ""}${complete ? " is-complete" : ""}`} key={label}>
            <button aria-current={active ? "step" : undefined} disabled={!complete} onClick={() => onSelect(step)} type="button">
              <span aria-hidden="true">{complete ? "✓" : index + 1}</span>
              <strong>{label}</strong>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function BirdSummaryCard({ bird }: Readonly<{ bird: BirdSummary }>) {
  return (
    <div className="internal-transfer-bird-summary">
      <img alt="" aria-hidden="true" src={resolveBirdImageUrl(bird.imageUrl)} />
      <div><strong>{bird.name}</strong><span>{bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Anilha não informada"}</span><span>{sexLabel(bird.sex)} · {bird.speciesPopularName}</span><span>{bird.status === "Active" ? "Ativa" : "Inativa"}</span></div>
    </div>
  );
}

function BirdOption({ bird, onSelect }: Readonly<{ bird: BirdSummary; onSelect: () => void }>) {
  return (
    <li>
      <button className="internal-transfer-option" onClick={onSelect} type="button">
        <img alt="" aria-hidden="true" src={resolveBirdImageUrl(bird.imageUrl)} />
        <span><strong>{bird.name}</strong><small>{bird.speciesPopularName} · {sexLabel(bird.sex)}</small><small>{bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Anilha não informada"}</small></span>
        <span aria-hidden="true" className="internal-transfer-option-mark">＋</span>
      </button>
    </li>
  );
}

function EligibilityPanel({
  birdId,
  error,
  onRetry,
  response,
  state
}: Readonly<{ birdId: string; error?: string; onRetry: () => void; response?: BirdEligibilityResponse; state: EligibilityState }>) {
  if (state === "loading") return <p className="internal-transfer-eligibility is-loading" role="status">Conferindo se a ave pode ser transferida…</p>;
  if (state === "error") return <div className="internal-transfer-eligibility is-blocked" role="alert"><p>{error}</p><button className="internal-transfer-text-action" onClick={onRetry} type="button">Tentar novamente</button></div>;
  if (response?.isEligible) return <p className="internal-transfer-eligibility is-eligible" role="status">Esta ave pode ser transferida para outro criatório.</p>;
  return (
    <div className="internal-transfer-eligibility is-blocked" role="status">
      <strong>Esta ave não pode ser transferida agora.</strong>
      {response?.issues.length ? <ul>{response.issues.map((issue) => <li key={issue.code}><strong>{eligibilityIssueTitle(issue.code)}</strong><span>{eligibilityIssueMessage(issue.code)}</span></li>)}</ul> : <p>Confira a situação e a anilha da ave antes de continuar.</p>}
      <Link className="internal-transfer-text-action" href={`/plantel/aves/${encodeURIComponent(birdId)}/editar`}>Revisar cadastro da ave</Link>
    </div>
  );
}

function Pagination({ currentPage, onPageChange, totalPages }: Readonly<{ currentPage: number; onPageChange: (page: number) => void; totalPages: number }>) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação das aves" className="internal-transfer-pagination">
      <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} type="button">Anterior</button>
      <span>Página {currentPage} de {totalPages}</span>
      <button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} type="button">Próxima</button>
    </nav>
  );
}

function ExternalTransferForm() {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const farmRequestId = useRef(0);
  const birdSearchRequestId = useRef(0);
  const eligibilityRequestId = useRef(0);
  const [routeReady, setRouteReady] = useState(false);
  const [preselectedBirdId, setPreselectedBirdId] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [farmError, setFarmError] = useState("Consultando o criatório selecionado.");
  const [farmActionHref, setFarmActionHref] = useState("/onboarding/criatorio/selecionar");
  const [farmActionLabel, setFarmActionLabel] = useState("Selecionar criatório");
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [step, setStep] = useState<WizardStep>(0);
  const [notice, setNotice] = useState<Notice>();
  const [birdSearch, setBirdSearch] = useState("");
  const [debouncedBirdSearch, setDebouncedBirdSearch] = useState("");
  const [birdSearchRetry, setBirdSearchRetry] = useState(0);
  const [birdPage, setBirdPage] = useState(1);
  const [birds, setBirds] = useState<BirdSummary[]>([]);
  const [birdTotalPages, setBirdTotalPages] = useState(0);
  const [birdSearchState, setBirdSearchState] = useState<SearchState>("idle");
  const [birdSearchError, setBirdSearchError] = useState<string>();
  const [selectedBird, setSelectedBird] = useState<BirdSummary>();
  const [eligibility, setEligibility] = useState<BirdEligibilityResponse>();
  const [eligibilityState, setEligibilityState] = useState<EligibilityState>("loading");
  const [eligibilityError, setEligibilityError] = useState<string>();
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<ExternalTransferResponse>();

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    const requestedBirdId = new URLSearchParams(window.location.search).get("birdId")?.trim();
    setPreselectedBirdId(requestedBirdId || undefined);
    setRouteReady(true);
  }, []);

  const loadFarm = useCallback(async () => {
    const requestId = ++farmRequestId.current;
    setFarmState("loading");
    setFarmError("Consultando o criatório selecionado.");
    try {
      const response = await requestWithSessionRecovery<FarmSelectionResponse>(client.current!, refresh, "api/breeding-farms");
      if (requestId !== farmRequestId.current) return;
      const farms = Array.isArray(response.breedingFarms) ? response.breedingFarms : [];
      const selectedFarm = farms.find((farm) => farm.breedingFarmId === response.selectedBreedingFarmId && farm.isSelected);
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setSelectedFarmId(undefined);
        setFarmActionHref(farms.length > 0 ? "/onboarding/criatorio/selecionar" : "/onboarding/criatorio");
        setFarmActionLabel(farms.length > 0 ? "Selecionar criatório" : "Criar meu criatório");
        setFarmError(farms.length > 0
          ? "Selecione um criatório para concluir uma transferência."
          : "Crie seu primeiro criatório antes de solicitar uma transferência.");
        setFarmState("blocked");
        return;
      }
      client.current!.setTenant(selectedFarm.breedingFarmId);
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");
    } catch (error) {
      if (error instanceof StaleTenantResponseError || requestId !== farmRequestId.current) return;
      setFarmError(farmErrorMessage(error));
      setFarmActionHref("/onboarding/criatorio/selecionar");
      setFarmActionLabel("Selecionar criatório");
      setFarmState(error instanceof ApiError && [403, 404, 409].includes(error.status) ? "blocked" : "error");
    }
  }, [refresh]);

  useEffect(() => {
    if (status !== "authenticated" || !routeReady) return;
    void loadFarm();
    return () => { farmRequestId.current += 1; };
  }, [loadFarm, routeReady, status]);

  const checkEligibility = useCallback(async (birdId: string, requestId: number) => {
    setEligibilityState("loading");
    setEligibility(undefined);
    setEligibilityError(undefined);
    try {
      const response = await requestWithSessionRecovery<BirdEligibilityResponse>(
        client.current!,
        refresh,
        `api/birds/${encodeURIComponent(birdId)}/eligibility`
      );
      if (requestId !== eligibilityRequestId.current) return;
      setEligibility(response);
      setEligibilityState("ready");
    } catch (error) {
      if (error instanceof StaleTenantResponseError || requestId !== eligibilityRequestId.current) return;
      setEligibilityError(eligibilityErrorMessage(error));
      setEligibilityState("error");
    }
  }, [refresh]);

  const loadPreselectedBird = useCallback(async (birdId: string) => {
    const requestId = ++eligibilityRequestId.current;
    setSelectedBird(undefined);
    setEligibility(undefined);
    setEligibilityState("loading");
    setEligibilityError(undefined);
    try {
      const [details, eligibilityResponse] = await Promise.all([
        requestWithSessionRecovery<BirdSummary>(client.current!, refresh, `api/birds/${encodeURIComponent(birdId)}`),
        requestWithSessionRecovery<BirdEligibilityResponse>(client.current!, refresh, `api/birds/${encodeURIComponent(birdId)}/eligibility`)
      ]);
      if (requestId !== eligibilityRequestId.current) return;
      setSelectedBird(details);
      setEligibility(eligibilityResponse);
      setEligibilityState("ready");
    } catch (error) {
      if (error instanceof StaleTenantResponseError || requestId !== eligibilityRequestId.current) return;
      const message = eligibilityErrorMessage(error);
      setEligibilityError(message);
      setNotice({ kind: "error", text: message });
      setEligibilityState("error");
    }
  }, [refresh]);

  useEffect(() => {
    if (farmState !== "ready" || !selectedFarmId || !preselectedBirdId) return;
    void loadPreselectedBird(preselectedBirdId);
  }, [farmState, loadPreselectedBird, preselectedBirdId, selectedFarmId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedBirdSearch(birdSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [birdSearch]);

  useEffect(() => {
    if (farmState !== "ready" || !selectedFarmId) return;
    if (debouncedBirdSearch.length < 2) {
      setBirds([]);
      setBirdTotalPages(0);
      setBirdSearchState("idle");
      setBirdSearchError(undefined);
      return;
    }

    const controller = new AbortController();
    const requestId = ++birdSearchRequestId.current;
    const params = new URLSearchParams({
      page: String(birdPage),
      pageSize: String(PAGE_SIZE),
      search: debouncedBirdSearch,
      sortBy: "name",
      sortDirection: "asc",
      status: "Active"
    });
    setBirdSearchState("loading");
    setBirdSearchError(undefined);

    async function loadBirds() {
      try {
        const response = await requestWithSessionRecovery<BirdListResponse>(
          client.current!,
          refresh,
          `api/birds?${params.toString()}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted || requestId !== birdSearchRequestId.current) return;
        setBirds(response.items ?? []);
        setBirdTotalPages(response.totalPages ?? 0);
        setBirdSearchState(response.items?.length ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted || requestId !== birdSearchRequestId.current || error instanceof StaleTenantResponseError) return;
        setBirdSearchError(birdSearchErrorMessage(error));
        setBirdSearchState("error");
      }
    }

    void loadBirds();
    return () => controller.abort();
  }, [birdPage, birdSearchRetry, debouncedBirdSearch, farmState, refresh, selectedFarmId]);

  async function selectBird(bird: BirdSummary) {
    const requestId = ++eligibilityRequestId.current;
    setSelectedBird(bird);
    setEligibility(undefined);
    setEligibilityState("loading");
    setEligibilityError(undefined);
    setNotice(undefined);
    setConfirmed(false);
    await checkEligibility(bird.birdId, requestId);
  }

  function chooseAnotherBird() {
    eligibilityRequestId.current += 1;
    setSelectedBird(undefined);
    setEligibility(undefined);
    setEligibilityState("loading");
    setEligibilityError(undefined);
    setBirdSearch("");
    setDebouncedBirdSearch("");
    setBirdPage(1);
    setConfirmed(false);
    setStep(0);
    setNotice(undefined);
  }

  function advance() {
    if (step === 0 && (!selectedBird || eligibilityState !== "ready" || !eligibility?.isEligible)) {
      setNotice({ kind: "error", text: eligibilityError ?? "Confira se a ave pode ser transferida antes de continuar." });
      return;
    }
    if (step === 1) {
      if (!recipientName.trim()) {
        setNotice({ kind: "error", text: "Informe o nome do recebedor externo para continuar." });
        return;
      }
      if (recipientName.trim().length > 200 || notes.trim().length > 2000) {
        setNotice({ kind: "error", text: "Confira os limites de caracteres dos dados da transferência." });
        return;
      }
    }
    setNotice(undefined);
    setStep((current) => Math.min(2, current + 1) as WizardStep);
  }

  function goBack() {
    setNotice(undefined);
    setStep((current) => Math.max(0, current - 1) as WizardStep);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) {
      advance();
      return;
    }
    if (isSubmitting || !selectedFarmId || !selectedBird || !eligibility?.isEligible) return;
    if (!recipientName.trim() || !confirmed) {
      setNotice({ kind: "error", text: "Informe o recebedor e confirme a conclusão da transferência." });
      return;
    }

    setIsSubmitting(true);
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<ExternalTransferResponse>("api/external-transfers", {
        body: JSON.stringify({
          birdId: selectedBird.birdId,
          recipientName: recipientName.trim(),
          notes: notes.trim() || null,
          confirmed: true
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      client.current!.clearCache();
      setCreatedTransfer(response);
      setNotice({ kind: "success", text: "A transferência externa foi concluída." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        csrfToken.current = undefined;
        await refresh();
      }
      setNotice({ kind: "error", text: externalTransferErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out" || !routeReady) {
    return <AppLoadingState activeNav="transfers" email={session?.email} farmName={farmName} label="Preparando transferência externa" message="Consultando o criatório e as aves disponíveis." />;
  }
  if (status === "unauthenticated") {
    return <TransferStateCard actionHref="/login" actionLabel="Entrar" heading="Entre para solicitar uma transferência" message="Sua sessão é necessária para consultar o criatório e confirmar a transferência." />;
  }
  if (status === "forbidden" || status === "error") {
    return <TransferStateCard heading="Não foi possível abrir a transferência" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="transfers" email={session.email} farmName={farmName} label="Preparando transferência externa" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><TransferStateCard actionHref={farmActionHref} actionLabel={farmActionLabel} heading="Selecione um criatório" message={farmError} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><TransferStateCard heading="Não foi possível consultar o criatório" message={farmError} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }

  const canContinue = step === 0
    ? Boolean(selectedBird && eligibilityState === "ready" && eligibility?.isEligible)
    : step === 1
      ? Boolean(recipientName.trim() && recipientName.trim().length <= 200 && notes.trim().length <= 2000)
      : confirmed && !isSubmitting;
  const submitLabel = step === 2 ? (isSubmitting ? "Concluindo…" : "Concluir transferência") : "Continuar";

  return (
    <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}>
      <main className="document-wizard-page internal-transfer-page external-transfer-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/transferencias">Transferências</Link><span aria-hidden="true">›</span><span aria-current="page">Transferência externa</span></nav>
        <header className="document-wizard-header internal-transfer-header">
          <div>
            <p className="eyebrow">Transferências · Criatório selecionado</p>
            <h1>Nova transferência externa</h1>
            <p>Registre a saída da ave para um recebedor fora da plataforma.</p>
          </div>
        </header>

        {createdTransfer ? (
          <section aria-labelledby="titulo-transferencia-concluida" className="document-wizard-card internal-transfer-success">
            <div className="document-wizard-success">
              <span aria-hidden="true" className="document-wizard-success-icon">✓</span>
              <p className="eyebrow">Transferência concluída</p>
              <h2 id="titulo-transferencia-concluida">A transferência foi concluída</h2>
              <p>{selectedBird?.name} foi registrada como transferida para {createdTransfer.recipientName}. A ave permanece vinculada ao criatório de origem.</p>
              <dl>
                <div><dt>Ave</dt><dd>{selectedBird?.name}</dd></div>
                <div><dt>Recebedor</dt><dd>{createdTransfer.recipientName}</dd></div>
                <div><dt>Situação</dt><dd>Transferida</dd></div>
                <div><dt>Número da transferência</dt><dd>{createdTransfer.externalTransferId}</dd></div>
              </dl>
              <div className="internal-transfer-success-actions">
                {selectedBird && <Link className="auth-primary-action" href={`/plantel/aves/${encodeURIComponent(selectedBird.birdId)}`}>Ver ficha da ave</Link>}
                <Link className="auth-secondary-action" href="/transferencias">Voltar às transferências</Link>
              </div>
            </div>
          </section>
        ) : (
          <form className="document-wizard-card internal-transfer-card" onSubmit={submit}>
            <Progress activeStep={step} onSelect={setStep} />
            {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

            <div className={`internal-transfer-layout${selectedBird ? " has-selected-bird" : ""}`}>
              <div className="internal-transfer-main">
                {step === 0 && (
                  <section aria-labelledby="titulo-etapa-ave-externa">
                    <div className="document-wizard-section-heading">
                      <div><p className="eyebrow">Etapa 1 de 3</p><h2 id="titulo-etapa-ave-externa">Selecione a ave</h2><p>Escolha uma ave ativa com anilha válida. Antes de concluir, o sistema confere se ela pode ser transferida.</p></div>
                    </div>
                    {selectedBird ? (
                      <div className="internal-transfer-selected-card">
                        <BirdSummaryCard bird={selectedBird} />
                        <button className="internal-transfer-text-action" onClick={chooseAnotherBird} type="button">Escolher outra ave</button>
                        <EligibilityPanel birdId={selectedBird.birdId} error={eligibilityError} onRetry={() => void checkEligibility(selectedBird.birdId, ++eligibilityRequestId.current)} response={eligibility} state={eligibilityState} />
                      </div>
                    ) : (
                      <>
                        <label className="document-wizard-search" htmlFor="buscar-ave-transferencia-externa">
                          <span>Buscar por nome, anilha ou espécie</span>
                          <input autoComplete="off" id="buscar-ave-transferencia-externa" maxLength={100} onChange={(event) => { setBirdSearch(event.target.value); setBirdPage(1); }} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Ex.: Aurora ou 123456" value={birdSearch} />
                        </label>
                        {debouncedBirdSearch.length < 2 ? (
                          <p className="internal-transfer-search-hint" role="status">Digite pelo menos dois caracteres para buscar aves ativas.</p>
                        ) : birdSearchState === "loading" ? (
                          <p className="internal-transfer-search-hint" role="status">Buscando aves…</p>
                        ) : birdSearchState === "error" ? (
                          <div className="internal-transfer-search-state" role="alert"><p>{birdSearchError}</p><button className="auth-secondary-action" onClick={() => setBirdSearchRetry((attempt) => attempt + 1)} type="button">Tentar novamente</button></div>
                        ) : birdSearchState === "empty" ? (
                          <p className="internal-transfer-search-hint" role="status">Nenhuma ave ativa corresponde à busca.</p>
                        ) : (
                          <>
                            <ul aria-label="Aves ativas encontradas" className="internal-transfer-options">{birds.map((bird) => <BirdOption bird={bird} key={bird.birdId} onSelect={() => void selectBird(bird)} />)}</ul>
                            <Pagination currentPage={birdPage} onPageChange={setBirdPage} totalPages={birdTotalPages} />
                          </>
                        )}
                      </>
                    )}
                  </section>
                )}

                {step === 1 && (
                  <section aria-labelledby="titulo-etapa-dados-externos">
                    <div className="document-wizard-section-heading">
                      <div><p className="eyebrow">Etapa 2 de 3</p><h2 id="titulo-etapa-dados-externos">Informe os dados da transferência</h2><p>Informe somente o nome do recebedor e, se necessário, uma observação.</p></div>
                    </div>
                    <div className="external-transfer-fields">
                      <label className="document-wizard-search" htmlFor="nome-recebedor-externo">
                        <span>Nome do recebedor <strong aria-hidden="true">*</strong></span>
                        <input autoComplete="off" id="nome-recebedor-externo" maxLength={200} onChange={(event) => { setRecipientName(event.target.value); setConfirmed(false); setNotice(undefined); }} placeholder="Nome completo do recebedor" required value={recipientName} />
                        <small>{recipientName.length}/200 caracteres</small>
                      </label>
                      <label className="document-wizard-search external-transfer-notes" htmlFor="observacoes-transferencia-externa">
                        <span>Observações <small>Opcional</small></span>
                        <textarea id="observacoes-transferencia-externa" maxLength={2000} onChange={(event) => { setNotes(event.target.value); setConfirmed(false); setNotice(undefined); }} placeholder="Informações úteis sobre a transferência" rows={4} value={notes} />
                        <small>{notes.length}/2.000 caracteres</small>
                      </label>
                    </div>
                    <p className="internal-transfer-security-note"><span aria-hidden="true">i</span>A confirmação conclui a transferência imediatamente. Não é necessário informar contato nem aguardar aceite externo.</p>
                  </section>
                )}

                {step === 2 && selectedBird && (
                  <section aria-labelledby="titulo-etapa-revisao-externa">
                    <div className="document-wizard-section-heading">
                      <div><p className="eyebrow">Etapa 3 de 3</p><h2 id="titulo-etapa-revisao-externa">Revise e confirme</h2><p>Confira os dados. Esta ação conclui a transferência da ave.</p></div>
                    </div>
                    <dl className="internal-transfer-review">
                      <div><dt>Ave</dt><dd><BirdSummaryCard bird={selectedBird} /><button className="internal-transfer-text-action" onClick={() => setStep(0)} type="button">Alterar ave</button></dd></div>
                      <div><dt>Tipo</dt><dd>Transferência externa<small>Para um recebedor fora da plataforma.</small></dd></div>
                      <div><dt>Recebedor</dt><dd><strong>{recipientName.trim()}</strong><button className="internal-transfer-text-action" onClick={() => setStep(1)} type="button">Alterar dados</button></dd></div>
                      {notes.trim() && <div><dt>Observações</dt><dd className="external-transfer-review-notes">{notes.trim()}</dd></div>}
                    </dl>
                    <label className="internal-transfer-confirmation" htmlFor="confirmar-transferencia-externa">
                      <input checked={confirmed} id="confirmar-transferencia-externa" onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
                      <span>Confirmo que desejo concluir a transferência externa desta ave.</span>
                    </label>
                    <p className="internal-transfer-security-note"><span aria-hidden="true">i</span>A ave será marcada como transferida e continuará vinculada ao criatório de origem. Um pedido de transferência interna pendente impede a conclusão.</p>
                  </section>
                )}

                <div className="document-wizard-actions">
                  <Link className="settings-cancel-action" href="/transferencias">Cancelar</Link>
                  {step > 0 && <button className="settings-cancel-action" disabled={isSubmitting} onClick={goBack} type="button">Voltar</button>}
                  <span>Etapa {step + 1} de 3</span>
                  <button className="auth-primary-action" disabled={!canContinue} type="submit">{submitLabel}</button>
                </div>
              </div>

              <aside aria-label="Resumo da transferência externa" className="internal-transfer-aside">
                <div className="internal-transfer-aside-heading"><DashboardIcon name="bird" /><div><strong>{selectedBird ? "Ave selecionada" : "Origem da transferência"}</strong><span>{farmName}</span></div></div>
                {selectedBird ? <BirdSummaryCard bird={selectedBird} /> : <p>Selecione uma ave ativa para conferir se ela pode ser transferida.</p>}
                {selectedBird && eligibilityState === "ready" && eligibility && <span className={`internal-transfer-eligibility-badge${eligibility.isEligible ? " is-eligible" : " is-blocked"}`}>{eligibility.isEligible ? "Pode ser transferida" : "Não pode ser transferida"}</span>}
                {recipientName.trim() && <div className="external-transfer-aside-recipient"><span>Recebedor</span><strong>{recipientName.trim()}</strong>{notes.trim() && <small>Com observações</small>}</div>}
              </aside>
            </div>
          </form>
        )}
      </main>
    </AuthenticatedShell>
  );
}

export function ExternalTransferWizard() {
  return <AuthProvider><ExternalTransferForm /></AuthProvider>;
}
