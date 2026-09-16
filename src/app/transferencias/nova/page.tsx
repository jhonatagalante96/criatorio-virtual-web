"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../lib/http/api-client";
import type { ApiRequestOptions } from "../../../lib/http/api-client";
import { AppLoadingState } from "../../components/app-loading-state";
import { AuthenticatedShell } from "../../components/authenticated-shell";
import { DashboardIcon } from "../../components/dashboard-icons";
import { resolveBirdImageUrl } from "../../plantel/aves/bird-image";

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
  responsibleName: string;
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

interface BirdDetailsResponse {
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

interface Destination {
  breedingFarmId: string;
  name: string;
  responsibleName: string;
}

interface DestinationListResponse {
  items: Destination[];
  page: number;
  pageSize: number;
  sourceBreedingFarmId: string;
  totalCount: number;
  totalPages: number;
}

interface TransferRequestResponse {
  birdId: string;
  createdAtUtc: string;
  destinationBreedingFarmId: string;
  sourceBreedingFarmId: string;
  status: string;
  transferRequestId: string;
  updatedAtUtc: string;
}

const wizardSteps = ["Ave", "Destino", "Revisão"] as const;
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

function birdStatusLabel(status: BirdStatus): string {
  if (status === "Active") return "Ativa";
  if (status === "Transferred") return "Transferida";
  if (status === "Archived") return "Arquivada";
  if (status === "Deceased") return "Falecida";
  return "Escapada";
}

function eligibilityIssueTitle(code: string): string {
  if (code === "MissingRingNumber") return "Anilha não informada";
  if (code === "InactiveStatus") return "Ave inativa";
  return "Pendência de elegibilidade";
}

function eligibilityIssueMessage(issue: BirdEligibilityIssue): string {
  if (issue.code === "MissingRingNumber") return "Informe uma anilha válida de seis dígitos para liberar a transferência.";
  if (issue.code === "InactiveStatus") return "A ave precisa estar ativa para ser transferida.";
  return "Revise a identificação e a situação desta ave antes de solicitar a transferência.";
}

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível para esta conta.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de solicitar a transferência.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado.";
}

function eligibilityErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar esta ave.";
  if (error instanceof ApiError && error.status === 404) return "A ave não está disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório para consultar a elegibilidade da ave.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível verificar a elegibilidade desta ave.";
}

function destinationErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar criatórios de destino.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível para transferências.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de buscar destinos.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível buscar criatórios de destino.";
}

function transferErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente antes de confirmar a transferência.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para solicitar esta transferência.";
  if (error instanceof ApiError && error.status === 404) return "A ave ou o criatório de destino não está mais disponível.";
  if (error instanceof ApiError && error.status === 409) {
    if (error.message.toLowerCase().includes("pending")) return "Esta ave já tem uma transferência pendente. Atualize a ficha antes de tentar novamente.";
    return "O criatório selecionado mudou. Atualize os dados e tente novamente.";
  }
  if (error instanceof ApiError && error.status === 400) {
    const fields = Object.keys(error.fields).join(" ").toLowerCase();
    if (fields.includes("destination")) return "Escolha outro criatório de destino e confira a revisão.";
    if (fields.includes("bird")) return "A ave deixou de atender aos critérios. Verifique a elegibilidade antes de tentar novamente.";
    if (fields.includes("confirmed")) return "Confirme a solicitação antes de continuar.";
    return "Revise os dados da solicitação antes de tentar novamente.";
  }
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível solicitar a transferência. Tente novamente.";
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
    <ol aria-label="Etapas da nova transferência" className="document-wizard-progress internal-transfer-progress">
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

function InternalTransferWizard() {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const farmRequestId = useRef(0);
  const birdSearchRequestId = useRef(0);
  const destinationSearchRequestId = useRef(0);
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
  const [destinationSearch, setDestinationSearch] = useState("");
  const [debouncedDestinationSearch, setDebouncedDestinationSearch] = useState("");
  const [destinationSearchRetry, setDestinationSearchRetry] = useState(0);
  const [destinationPage, setDestinationPage] = useState(1);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationTotalPages, setDestinationTotalPages] = useState(0);
  const [destinationSearchState, setDestinationSearchState] = useState<SearchState>("idle");
  const [destinationSearchError, setDestinationSearchError] = useState<string>();
  const [selectedDestination, setSelectedDestination] = useState<Destination>();
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<TransferRequestResponse>();

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
          ? "Selecione um criatório para solicitar uma transferência."
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
        requestWithSessionRecovery<BirdDetailsResponse>(client.current!, refresh, `api/birds/${encodeURIComponent(birdId)}`),
        requestWithSessionRecovery<BirdEligibilityResponse>(client.current!, refresh, `api/birds/${encodeURIComponent(birdId)}/eligibility`)
      ]);
      if (requestId !== eligibilityRequestId.current) return;
      setSelectedBird({
        ageInYears: details.ageInYears,
        birthDate: details.birthDate,
        birdId: details.birdId,
        identificationPending: details.identificationPending,
        imageUrl: details.imageUrl,
        name: details.name,
        ringNumber: details.ringNumber,
        sex: details.sex,
        speciesPopularName: details.speciesPopularName,
        status: details.status
      });
      setEligibility(eligibilityResponse);
      setEligibilityState("ready");
    } catch (error) {
      if (error instanceof StaleTenantResponseError || requestId !== eligibilityRequestId.current) return;
      setEligibilityError(eligibilityErrorMessage(error));
      setNotice({ kind: "error", text: eligibilityErrorMessage(error) });
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
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          setFarmError("Selecione novamente um criatório antes de consultar as aves.");
          setFarmState("blocked");
          return;
        }
        setBirdSearchError(error instanceof ApiError && error.status === 401
          ? "Sua sessão expirou. Entre novamente para continuar."
          : error instanceof ApiError && error.status === 403
            ? "Sua conta não tem permissão para consultar as aves deste criatório."
            : error instanceof ApiError && error.status >= 500
              ? "O serviço está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível buscar as aves. Verifique sua conexão e tente novamente.");
        setBirdSearchState("error");
      }
    }

    void loadBirds();
    return () => controller.abort();
  }, [birdPage, birdSearchRetry, debouncedBirdSearch, farmState, refresh, selectedFarmId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDestinationSearch(destinationSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [destinationSearch]);

  useEffect(() => {
    if (farmState !== "ready" || !selectedFarmId || step !== 1) return;
    if (debouncedDestinationSearch.length < 2) {
      setDestinations([]);
      setDestinationTotalPages(0);
      setDestinationSearchState("idle");
      setDestinationSearchError(undefined);
      return;
    }

    const controller = new AbortController();
    const requestId = ++destinationSearchRequestId.current;
    const params = new URLSearchParams({
      page: String(destinationPage),
      pageSize: String(PAGE_SIZE),
      search: debouncedDestinationSearch
    });
    setDestinationSearchState("loading");
    setDestinationSearchError(undefined);

    async function loadDestinations() {
      try {
        const response = await requestWithSessionRecovery<DestinationListResponse>(
          client.current!,
          refresh,
          `api/internal-transfers/destinations?${params.toString()}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted || requestId !== destinationSearchRequestId.current) return;
        setDestinations(response.items ?? []);
        setDestinationTotalPages(response.totalPages ?? 0);
        setDestinationSearchState(response.items?.length ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted || requestId !== destinationSearchRequestId.current || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          setFarmError(destinationErrorMessage(error));
          setFarmActionHref("/onboarding/criatorio/selecionar");
          setFarmActionLabel("Selecionar criatório");
          setFarmState("blocked");
          return;
        }
        setDestinationSearchError(destinationErrorMessage(error));
        setDestinationSearchState("error");
      }
    }

    void loadDestinations();
    return () => controller.abort();
  }, [debouncedDestinationSearch, destinationPage, destinationSearchRetry, farmState, refresh, selectedFarmId, step]);

  async function selectBird(bird: BirdSummary) {
    const requestId = ++eligibilityRequestId.current;
    setSelectedBird(bird);
    setSelectedDestination(undefined);
    setDestinationSearch("");
    setDebouncedDestinationSearch("");
    setDestinationPage(1);
    setEligibilityState("loading");
    setEligibility(undefined);
    setEligibilityError(undefined);
    setNotice(undefined);
    setStep(0);
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
    setSelectedDestination(undefined);
    setDestinationSearch("");
    setDebouncedDestinationSearch("");
    setDestinationPage(1);
    setStep(0);
    setNotice(undefined);
  }

  function changeDestinationSearch(value: string) {
    setDestinationSearch(value);
    setDestinationPage(1);
    setSelectedDestination(undefined);
    setConfirmed(false);
    setNotice(undefined);
  }

  function advance() {
    if (step === 0) {
      if (!selectedBird) {
        setNotice({ kind: "error", text: "Selecione uma ave para continuar." });
        return;
      }
      if (eligibilityState !== "ready" || !eligibility?.isEligible) {
        setNotice({ kind: "error", text: eligibilityError ?? "A ave precisa estar elegível para solicitar a transferência." });
        return;
      }
    }
    if (step === 1 && !selectedDestination) {
      setNotice({ kind: "error", text: "Busque e selecione um criatório de destino para continuar." });
      return;
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
    if (isSubmitting || !selectedFarmId || !selectedBird || !eligibility?.isEligible || !selectedDestination) return;
    if (!confirmed) {
      setNotice({ kind: "error", text: "Marque a confirmação antes de solicitar a transferência." });
      return;
    }

    setIsSubmitting(true);
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<TransferRequestResponse>("api/internal-transfers", {
        body: JSON.stringify({
          birdId: selectedBird.birdId,
          destinationBreedingFarmId: selectedDestination.breedingFarmId,
          confirmed: true
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      client.current!.clearCache();
      setCreatedTransfer(response);
      setNotice({ kind: "success", text: "A solicitação foi enviada para validação do criatório de destino." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        csrfToken.current = undefined;
        await refresh();
      }
      setNotice({ kind: "error", text: transferErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out" || !routeReady) {
    return <AppLoadingState activeNav="transfers" email={session?.email} farmName={farmName} label="Preparando transferência" message="Consultando o criatório e as aves disponíveis." />;
  }
  if (status === "unauthenticated") {
    return <StateCard actionHref="/login" actionLabel="Entrar" heading="Entre para solicitar uma transferência" message="Sua sessão é necessária para consultar o criatório e confirmar a solicitação." />;
  }
  if (status === "forbidden" || status === "error") {
    return <StateCard heading="Não foi possível abrir a transferência" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="transfers" email={session.email} farmName={farmName} label="Preparando transferência" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><StateCard actionHref={farmActionHref} actionLabel={farmActionLabel} heading="Selecione um criatório" message={farmError} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><StateCard heading="Não foi possível consultar o criatório" message={farmError} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }

  const submitLabel = step === 2 ? (isSubmitting ? "Enviando…" : "Solicitar transferência") : "Continuar";
  const canContinue = step === 0
    ? Boolean(selectedBird && eligibilityState === "ready" && eligibility?.isEligible)
    : step === 1
      ? Boolean(selectedDestination)
      : confirmed && !isSubmitting;

  return (
    <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}>
      <main className="document-wizard-page internal-transfer-page">
        <nav aria-label="Caminho da página" className="document-wizard-breadcrumb">
          <Link href="/plantel/aves">Aves</Link><span aria-hidden="true">›</span><span>Nova transferência</span>
        </nav>
        <header className="document-wizard-header internal-transfer-header">
          <div>
            <p className="eyebrow">Transferências · Criatório selecionado</p>
            <h1>Nova transferência</h1>
            <p>Solicite a transferência interna de uma ave para outro criatório cadastrado na plataforma.</p>
          </div>
        </header>

        {createdTransfer ? (
          <section aria-labelledby="titulo-transferencia-criada" className="document-wizard-card internal-transfer-success">
            <div className="document-wizard-success">
              <span aria-hidden="true" className="document-wizard-success-icon">✓</span>
              <p className="eyebrow">Solicitação enviada</p>
              <h2 id="titulo-transferencia-criada">Transferência solicitada com sucesso</h2>
              <p>{selectedBird?.name} foi encaminhada para análise de {selectedDestination?.name}. A plataforma mantém a solicitação pendente até a conclusão pelo criatório de destino.</p>
              <dl>
                <div><dt>Ave</dt><dd>{selectedBird?.name}</dd></div>
                <div><dt>Destino</dt><dd>{selectedDestination?.name}<small>{selectedDestination?.responsibleName}</small></dd></div>
                <div><dt>Status</dt><dd>{createdTransfer.status === "Pending" ? "Pendente" : createdTransfer.status}</dd></div>
                <div><dt>Protocolo</dt><dd>{createdTransfer.transferRequestId}</dd></div>
              </dl>
              <div className="internal-transfer-success-actions">
                {selectedBird && <Link className="auth-primary-action" href={`/plantel/aves/${encodeURIComponent(selectedBird.birdId)}`}>Ver ficha da ave</Link>}
                <Link className="auth-secondary-action" href="/plantel/aves">Voltar ao plantel</Link>
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
                  <section aria-labelledby="titulo-etapa-ave">
                    <div className="document-wizard-section-heading">
                      <div><p className="eyebrow">Etapa 1 de 3</p><h2 id="titulo-etapa-ave">Selecione a ave</h2><p>Escolha uma ave ativa. A API confirma a elegibilidade antes de aceitar a solicitação.</p></div>
                    </div>
                    {selectedBird ? (
                      <div className="internal-transfer-selected-card">
                        <BirdSummaryCard bird={selectedBird} />
                        <button className="internal-transfer-text-action" onClick={chooseAnotherBird} type="button">Escolher outra ave</button>
                        <EligibilityPanel birdId={selectedBird.birdId} error={eligibilityError} onRetry={() => void checkEligibility(selectedBird.birdId, ++eligibilityRequestId.current)} response={eligibility} state={eligibilityState} />
                      </div>
                    ) : (
                      <>
                        <label className="document-wizard-search" htmlFor="buscar-ave-transferencia">
                          <span>Buscar por nome, anilha ou espécie</span>
                          <input autoComplete="off" id="buscar-ave-transferencia" maxLength={100} onChange={(event) => { setBirdSearch(event.target.value); setBirdPage(1); }} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Ex.: Aurora ou 123456" value={birdSearch} />
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
                            <ul aria-label="Aves ativas encontradas" className="internal-transfer-options">
                              {birds.map((bird) => <BirdOption bird={bird} key={bird.birdId} onSelect={() => void selectBird(bird)} />)}
                            </ul>
                            <Pagination currentPage={birdPage} onPageChange={setBirdPage} totalPages={birdTotalPages} />
                          </>
                        )}
                      </>
                    )}
                  </section>
                )}

                {step === 1 && (
                  <section aria-labelledby="titulo-etapa-destino">
                    <div className="document-wizard-section-heading">
                      <div><p className="eyebrow">Etapa 2 de 3</p><h2 id="titulo-etapa-destino">Escolha o criatório de destino</h2><p>Busque pelo nome do criatório ou pelo nome do responsável.</p></div>
                    </div>
                    <label className="document-wizard-search" htmlFor="buscar-criatorio-destino">
                      <span>Buscar criatório ou responsável</span>
                      <input autoComplete="off" id="buscar-criatorio-destino" maxLength={100} onChange={(event) => changeDestinationSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Digite ao menos dois caracteres" value={destinationSearch} />
                    </label>
                    {debouncedDestinationSearch.length < 2 ? (
                      <p className="internal-transfer-search-hint" role="status">Digite pelo menos dois caracteres. Os resultados são carregados por página.</p>
                    ) : destinationSearchState === "loading" ? (
                      <p className="internal-transfer-search-hint" role="status">Buscando criatórios…</p>
                    ) : destinationSearchState === "error" ? (
                      <div className="internal-transfer-search-state" role="alert"><p>{destinationSearchError}</p><button className="auth-secondary-action" onClick={() => setDestinationSearchRetry((attempt) => attempt + 1)} type="button">Tentar novamente</button></div>
                    ) : destinationSearchState === "empty" ? (
                      <p className="internal-transfer-search-hint" role="status">Nenhum criatório corresponde à busca.</p>
                    ) : (
                      <>
                        <ul aria-label="Criatórios de destino encontrados" className="internal-transfer-options">
                          {destinations.map((destination) => <DestinationOption destination={destination} key={destination.breedingFarmId} onSelect={() => { setSelectedDestination(destination); setConfirmed(false); setNotice(undefined); }} selected={selectedDestination?.breedingFarmId === destination.breedingFarmId} />)}
                        </ul>
                        <Pagination currentPage={destinationPage} onPageChange={setDestinationPage} totalPages={destinationTotalPages} />
                      </>
                    )}
                    {selectedDestination && <p className="internal-transfer-selected-destination" role="status">Destino selecionado: <strong>{selectedDestination.name}</strong></p>}
                  </section>
                )}

                {step === 2 && selectedBird && selectedDestination && (
                  <section aria-labelledby="titulo-etapa-revisao">
                    <div className="document-wizard-section-heading">
                      <div><p className="eyebrow">Etapa 3 de 3</p><h2 id="titulo-etapa-revisao">Revise a solicitação</h2><p>Confira a ave e o destino antes de confirmar.</p></div>
                    </div>
                    <dl className="internal-transfer-review">
                      <div><dt>Ave</dt><dd><BirdSummaryCard bird={selectedBird} /><button className="internal-transfer-text-action" onClick={() => setStep(0)} type="button">Alterar ave</button></dd></div>
                      <div><dt>Tipo</dt><dd>Transferência interna<small>Para um criatório cadastrado na plataforma.</small></dd></div>
                      <div><dt>Destino</dt><dd><strong>{selectedDestination.name}</strong><small>{selectedDestination.responsibleName}</small><button className="internal-transfer-text-action" onClick={() => setStep(1)} type="button">Alterar destino</button></dd></div>
                    </dl>
                    <label className="internal-transfer-confirmation" htmlFor="confirmar-transferencia">
                      <input checked={confirmed} id="confirmar-transferencia" onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
                      <span>Confirmo que desejo solicitar a transferência desta ave para o criatório de destino.</span>
                    </label>
                    <p className="internal-transfer-security-note"><span aria-hidden="true">i</span>A API confirma novamente o criatório, a elegibilidade da ave e a ausência de outra transferência pendente antes de registrar o pedido.</p>
                  </section>
                )}

                <div className="document-wizard-actions">
                  <Link className="settings-cancel-action" href="/plantel/aves">Cancelar</Link>
                  {step > 0 && <button className="settings-cancel-action" disabled={isSubmitting} onClick={goBack} type="button">Voltar</button>}
                  <span>Etapa {step + 1} de 3</span>
                  <button className="auth-primary-action" disabled={!canContinue} type="submit">{submitLabel}</button>
                </div>
              </div>

              <aside aria-label="Resumo da transferência" className="internal-transfer-aside">
                <div className="internal-transfer-aside-heading"><DashboardIcon name="bird" /><div><strong>{selectedBird ? "Ave selecionada" : "Origem da transferência"}</strong><span>{farmName}</span></div></div>
                {selectedBird ? <BirdSummaryCard bird={selectedBird} /> : <p>Selecione uma ave ativa para conferir sua identificação e elegibilidade.</p>}
                {selectedBird && eligibilityState === "ready" && eligibility && <span className={`internal-transfer-eligibility-badge${eligibility.isEligible ? " is-eligible" : " is-blocked"}`}>{eligibility.isEligible ? "Elegível" : "Requer atenção"}</span>}
                {selectedDestination && <div className="internal-transfer-aside-destination"><span>Destino escolhido</span><strong>{selectedDestination.name}</strong><small>{selectedDestination.responsibleName}</small></div>}
              </aside>
            </div>
          </form>
        )}
      </main>
    </AuthenticatedShell>
  );
}

function BirdSummaryCard({ bird }: Readonly<{ bird: BirdSummary }>) {
  return (
    <div className="internal-transfer-bird-summary">
      <img alt="" aria-hidden="true" src={resolveBirdImageUrl(bird.imageUrl)} />
      <div><strong>{bird.name}</strong><span>{bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Anilha não informada"}</span><span>{sexLabel(bird.sex)} · {bird.speciesPopularName}</span><span>{birdStatusLabel(bird.status)}</span></div>
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

function DestinationOption({ destination, onSelect, selected }: Readonly<{ destination: Destination; onSelect: () => void; selected: boolean }>) {
  return (
    <li>
      <button aria-pressed={selected} className={`internal-transfer-option internal-transfer-destination-option${selected ? " is-selected" : ""}`} onClick={onSelect} type="button">
        <span aria-hidden="true" className="internal-transfer-destination-avatar">{destination.name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "C"}</span>
        <span><strong>{destination.name}</strong><small>Responsável: {destination.responsibleName}</small></span>
        <span aria-hidden="true" className="internal-transfer-option-mark">{selected ? "✓" : "＋"}</span>
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
  if (state === "loading") return <p className="internal-transfer-eligibility is-loading" role="status">Verificando a elegibilidade da ave…</p>;
  if (state === "error") return <div className="internal-transfer-eligibility is-blocked" role="alert"><p>{error}</p><button className="internal-transfer-text-action" onClick={onRetry} type="button">Tentar novamente</button></div>;
  if (response?.isEligible) return <p className="internal-transfer-eligibility is-eligible" role="status">Esta ave atende aos critérios para solicitar uma transferência.</p>;
  return (
    <div className="internal-transfer-eligibility is-blocked" role="status">
      <strong>Esta ave não pode ser transferida agora.</strong>
      {response?.issues.length ? <ul>{response.issues.map((issue) => <li key={issue.code}><strong>{eligibilityIssueTitle(issue.code)}</strong><span>{eligibilityIssueMessage(issue)}</span></li>)}</ul> : <p>Confira a situação e a identificação da ave antes de continuar.</p>}
      <Link className="internal-transfer-text-action" href={`/plantel/aves/${encodeURIComponent(birdId)}/editar`}>Revisar cadastro da ave</Link>
    </div>
  );
}

function Pagination({ currentPage, onPageChange, totalPages }: Readonly<{ currentPage: number; onPageChange: (page: number) => void; totalPages: number }>) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação dos resultados" className="internal-transfer-pagination">
      <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} type="button">Anterior</button>
      <span>Página {currentPage} de {totalPages}</span>
      <button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} type="button">Próxima</button>
    </nav>
  );
}

export default function NewInternalTransferPage() {
  return <AuthProvider><InternalTransferWizard /></AuthProvider>;
}
