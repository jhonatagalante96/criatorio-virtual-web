"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AuthStatus, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../lib/http/api-client";
import { AppLoadingContent, AppLoadingState } from "../../components/app-loading-state";
import { AuthenticatedShell } from "../../components/authenticated-shell";
import { DashboardIcon } from "../../components/dashboard-icons";
import { resolveBirdImageUrl } from "../../plantel/aves/bird-image";

type FarmState = "blocked" | "error" | "loading" | "ready";
type BirdsState = "empty" | "error" | "loading" | "ready";
type CompetitionStep = 0 | 1 | 2 | 3;
type SubmissionState = "idle" | "loading" | "success";
type Notice = { kind: "error" | "success"; text: string };
type CompetitionField = "birdId" | "category" | "date" | "form" | "location" | "name" | "notes" | "placement";

interface BreedingFarmSummary {
  breedingFarmId: string;
  isSelected: boolean;
  name: string;
  responsibleName: string;
}

interface BreedingFarmSelectionResponse {
  breedingFarms: BreedingFarmSummary[];
  selectedBreedingFarmId: string | null;
}

interface CompetitionBird {
  ageInYears: number | null;
  birdId: string;
  breedingFarmId?: string;
  identificationPending: boolean;
  imageUrl?: string | null;
  name: string;
  ringNumber: string | null;
  sex: "Female" | "Male" | "Unknown";
  speciesPopularName: string;
  status?: "Active" | "Archived" | "Transferred" | "Deceased" | "Escaped";
}

interface BirdListResponse {
  breedingFarmId: string;
  items: CompetitionBird[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface BirdDetailsResponse extends CompetitionBird {
  breedingFarmId: string;
  birthDate: string | null;
  createdAtUtc: string;
  deathDate: string | null;
  externalFatherName: string | null;
  externalFatherSex: "Female" | "Male" | "Unknown" | null;
  externalMotherName: string | null;
  externalMotherSex: "Female" | "Male" | "Unknown" | null;
  father: unknown;
  fatherBirdId: string | null;
  genealogyRootId: string | null;
  isDefaultImage?: boolean;
  mother: unknown;
  motherBirdId: string | null;
  notes: string | null;
  ringNumber: string | null;
  speciesId: string;
  speciesScientificName: string;
  updatedAtUtc: string;
}

interface BirdCompetitionResponse {
  birdId: string;
  category: string | null;
  competitionId: string;
  createdAtUtc: string;
  date: string | null;
  location: string | null;
  name: string;
  notes: string | null;
  placement: number | null;
  updatedAtUtc: string;
}

interface CompetitionWizardProps {
  initialBirdId?: string;
}

const PAGE_SIZE = 50;
const STEP_LABELS = ["Ave", "Dados", "Resultado", "Revisão"] as const;
const AUTH_LOADING_STATUSES: AuthStatus[] = ["loading", "authenticating", "signing-out"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Não informada";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function sexLabel(value: CompetitionBird["sex"]): string {
  if (value === "Female") return "Fêmea";
  if (value === "Male") return "Macho";
  return "Sexo não informado";
}

function statusLabel(value: CompetitionBird["status"]): string {
  if (value === "Archived") return "Arquivada";
  if (value === "Transferred") return "Transferida";
  if (value === "Deceased") return "Falecida";
  if (value === "Escaped") return "Escapada";
  return "Ativa";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (error.status === 403) return "Você não tem acesso a esta ação.";
    if (error.status === 404) return "A ave ou o criatório selecionado não está disponível.";
    if (error.status === 409) return "O criatório selecionado mudou. Confira o contexto e tente novamente.";
    if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  }
  return "Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.";
}

function toBirdListItem(bird: BirdDetailsResponse): CompetitionBird {
  return {
    ageInYears: bird.ageInYears,
    birdId: bird.birdId,
    breedingFarmId: bird.breedingFarmId,
    identificationPending: bird.identificationPending,
    imageUrl: bird.imageUrl,
    name: bird.name,
    ringNumber: bird.ringNumber,
    sex: bird.sex,
    speciesPopularName: bird.speciesPopularName,
    status: bird.status
  };
}

function mapServerFieldErrors(fields: Record<string, string[]>): Partial<Record<CompetitionField, string>> {
  const mapped: Partial<Record<CompetitionField, string>> = {};
  for (const [key, messages] of Object.entries(fields)) {
    const normalizedKey = key.toLocaleLowerCase("pt-BR");
    const message = messages[0] ?? "Revise este campo.";
    if (normalizedKey === "name") mapped.name = message;
    else if (normalizedKey === "date") mapped.date = message;
    else if (normalizedKey === "category") mapped.category = message;
    else if (normalizedKey === "placement") mapped.placement = message;
    else if (normalizedKey === "location") mapped.location = message;
    else if (normalizedKey === "notes") mapped.notes = message;
    else mapped.form = message;
  }
  return mapped;
}

function Progress({ activeStep, onSelect }: Readonly<{ activeStep: CompetitionStep; onSelect: (step: CompetitionStep) => void }>) {
  return (
    <ol aria-label="Etapas do registro da competição" className="document-wizard-progress competition-wizard-progress">
      {STEP_LABELS.map((label, index) => {
        const step = index as CompetitionStep;
        const isActive = step === activeStep;
        const isComplete = step < activeStep;
        return (
          <li className={isActive ? "is-current" : isComplete ? "is-complete" : undefined} key={label}>
            <button aria-current={isActive ? "step" : undefined} disabled={!isComplete} onClick={() => onSelect(step)} type="button">
              <span aria-hidden="true">{isComplete ? "✓" : index + 1}</span>
              <strong>{label}</strong>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StateCard({
  actionHref,
  actionLabel,
  heading,
  message,
  onRetry
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return (
    <main className="document-wizard-page competition-wizard-page">
      <section className="document-wizard-state" role={onRetry ? "alert" : undefined}>
        <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="trophy" /></span>
        <h1>{heading}</h1>
        <p>{message}</p>
        {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
        {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
      </section>
    </main>
  );
}

function BirdOption({ bird, selected, onSelect }: Readonly<{ bird: CompetitionBird; selected: boolean; onSelect: () => void }>) {
  return (
    <li>
      <button aria-pressed={selected} className={`competition-bird-option${selected ? " is-selected" : ""}`} onClick={onSelect} type="button">
        <img alt="" aria-hidden="true" src={resolveBirdImageUrl(bird.imageUrl)} />
        <span className="competition-bird-copy">
          <strong>{bird.name}</strong>
          <small>{bird.speciesPopularName} · {bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Sem anilha"}</small>
          <small>{sexLabel(bird.sex)} · {statusLabel(bird.status)}</small>
        </span>
        <span aria-hidden="true" className="competition-bird-check">{selected ? "✓" : "○"}</span>
      </button>
    </li>
  );
}

export function CompetitionWizard({ initialBirdId }: CompetitionWizardProps) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const loadRequestId = useRef(0);
  const pageRequestId = useRef(0);
  const initialBirdResolved = useRef(false);
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [birdsState, setBirdsState] = useState<BirdsState>("loading");
  const [farmError, setFarmError] = useState<string>();
  const [birdsError, setBirdsError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [birds, setBirds] = useState<CompetitionBird[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [birdSearch, setBirdSearch] = useState("");
  const [selectedBirdId, setSelectedBirdId] = useState("");
  const [selectedBird, setSelectedBird] = useState<CompetitionBird>();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [placement, setPlacement] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<CompetitionStep>(0);
  const [notice, setNotice] = useState<Notice>();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CompetitionField, string>>>({});
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [createdCompetition, setCreatedCompetition] = useState<BirdCompetitionResponse>();

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const loadBirdPage = useCallback(async (breedingFarmId: string, nextPage: number, recoverSession = true) => {
    const requestId = ++pageRequestId.current;
    setBirdsState("loading");
    setBirdsError(undefined);
    try {
      const response = await client.current!.request<BirdListResponse>(
        `api/birds?sortBy=name&sortDirection=asc&page=${nextPage}&pageSize=${PAGE_SIZE}`
      );
      if (requestId !== pageRequestId.current) return;
      if (response.breedingFarmId !== breedingFarmId) throw new StaleTenantResponseError();
      setBirds(response.items);
      setPage(response.page);
      setTotalPages(Math.max(1, response.totalPages));
      setBirdsState(response.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (requestId !== pageRequestId.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) {
          await loadBirdPage(breedingFarmId, nextPage, false);
          return;
        }
      }
      setBirdsState("error");
      setBirdsError(errorMessage(error));
    }
  }, [refresh]);

  const loadData = useCallback(async (recoverSession = true) => {
    const requestId = ++loadRequestId.current;
    let hasSelectedFarm = false;
    pageRequestId.current += 1;
    setFarmState("loading");
    setBirdsState("loading");
    setFarmError(undefined);
    setBirdsError(undefined);
    try {
      const response = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (requestId !== loadRequestId.current) return;
      const selectedFarm = response.breedingFarms.find((farm) => farm.breedingFarmId === response.selectedBreedingFarmId && farm.isSelected);
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setSelectedFarmId(undefined);
        setFarmState("blocked");
        setBirdsState("empty");
        setFarmError(response.breedingFarms.length > 0
          ? "Selecione um criatório para consultar as aves disponíveis."
          : "Crie seu primeiro criatório antes de registrar uma competição.");
        return;
      }

      client.current!.setTenant(selectedFarm.breedingFarmId);
      hasSelectedFarm = true;
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");

      const birdsResponse = await client.current!.request<BirdListResponse>(
        `api/birds?sortBy=name&sortDirection=asc&page=1&pageSize=${PAGE_SIZE}`
      );
      if (requestId !== loadRequestId.current) return;
      if (birdsResponse.breedingFarmId !== selectedFarm.breedingFarmId) throw new StaleTenantResponseError();

      let nextBirds = birdsResponse.items;
      let nextSelectedBird = initialBirdId ? nextBirds.find((bird) => bird.birdId === initialBirdId) : undefined;
      if (initialBirdId && !nextSelectedBird && !initialBirdResolved.current) {
        try {
          const details = await client.current!.request<BirdDetailsResponse>(`api/birds/${encodeURIComponent(initialBirdId)}`);
          if (requestId !== loadRequestId.current) return;
          if (details.birdId === initialBirdId && details.breedingFarmId === selectedFarm.breedingFarmId) {
            nextSelectedBird = toBirdListItem(details);
            nextBirds = [nextSelectedBird, ...nextBirds];
          }
        } catch (error) {
          if (error instanceof StaleTenantResponseError) return;
          if (error instanceof ApiError && error.status === 401 && recoverSession) {
            const result = await refresh();
            if (result.ok) {
              await loadData(false);
              return;
            }
          }
          // A missing or inaccessible initial bird is not authority to reveal another tenant's data.
        }
      }
      initialBirdResolved.current = true;
      setBirds(nextBirds);
      setPage(1);
      setTotalPages(Math.max(1, birdsResponse.totalPages));
      if (nextSelectedBird) {
        setSelectedBird(nextSelectedBird);
        setSelectedBirdId(nextSelectedBird.birdId);
      }
      setBirdsState(nextBirds.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (requestId !== loadRequestId.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) {
          await loadData(false);
          return;
        }
      }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409)) {
        setFarmState("blocked");
        setFarmError(errorMessage(error));
      } else if (hasSelectedFarm) {
        setBirdsState("error");
        setBirdsError(errorMessage(error));
      } else {
        setFarmState("error");
        setFarmError(errorMessage(error));
      }
    }
  }, [initialBirdId, refresh]);

  useEffect(() => {
    if (status === "authenticated") void loadData();
    return () => {
      loadRequestId.current += 1;
      pageRequestId.current += 1;
    };
  }, [loadData, status]);

  const visibleBirds = useMemo(() => {
    const search = birdSearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return birds;
    return birds.filter((bird) => `${bird.name} ${bird.ringNumber ?? ""} ${bird.speciesPopularName}`.toLocaleLowerCase("pt-BR").includes(search));
  }, [birdSearch, birds]);

  function selectBird(bird: CompetitionBird) {
    setSelectedBirdId(bird.birdId);
    setSelectedBird(bird);
    setFieldErrors((current) => ({ ...current, birdId: undefined }));
    setNotice(undefined);
  }

  function validateStep(): boolean {
    const errors: Partial<Record<CompetitionField, string>> = {};
    if (step === 0 && !selectedBirdId) errors.birdId = "Selecione uma ave para continuar.";
    if (step === 1) {
      if (!name.trim()) errors.name = "Informe o nome da competição.";
      else if (name.trim().length > 200) errors.name = "Use até 200 caracteres.";
      if (date && date > todayIso()) errors.date = "A data da competição não pode estar no futuro.";
    }
    if (step === 2) {
      if (category.trim().length > 200) errors.category = "Use até 200 caracteres.";
      if (placement && (!Number.isSafeInteger(Number(placement)) || Number(placement) <= 0 || Number(placement) > 2147483647)) {
        errors.placement = "Informe uma colocação inteira entre 1 e 2.147.483.647.";
      }
      if (location.trim().length > 200) errors.location = "Use até 200 caracteres.";
      if (notes.trim().length > 2000) errors.notes = "Use até 2000 caracteres.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setNotice({ kind: "error", text: "Revise os dados destacados antes de continuar." });
      return false;
    }
    setNotice(undefined);
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    setStep((current) => Math.min(3, current + 1) as CompetitionStep);
  }

  function goBack() {
    setNotice(undefined);
    setFieldErrors({});
    setStep((current) => Math.max(0, current - 1) as CompetitionStep);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      goNext();
      return;
    }
    if (!selectedBirdId || !selectedBird || submissionState === "loading" || !validateStep()) return;

    setSubmissionState("loading");
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<BirdCompetitionResponse>(
        `api/birds/${encodeURIComponent(selectedBirdId)}/competitions`,
        {
          body: JSON.stringify({
            name: name.trim(),
            date: date || null,
            category: category.trim() || null,
            placement: placement ? Number(placement) : null,
            location: location.trim() || null,
            notes: notes.trim() || null
          }),
          headers: { "content-type": "application/json" },
          method: "POST"
        }
      );
      setCreatedCompetition(response);
      setSubmissionState("success");
      setNotice({ kind: "success", text: "Competição registrada com sucesso." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      const mappedErrors = error instanceof ApiError ? mapServerFieldErrors(error.fields) : {};
      setFieldErrors(mappedErrors);
      if (mappedErrors.name || mappedErrors.date) setStep(1);
      else if (mappedErrors.category || mappedErrors.placement || mappedErrors.location || mappedErrors.notes) setStep(2);
      const message = Object.keys(mappedErrors).length > 0
        ? "O servidor pediu para revisar os dados destacados."
        : errorMessage(error);
      setNotice({ kind: "error", text: message });
    } finally {
      setSubmissionState((current) => current === "success" ? current : "idle");
    }
  }

  function resetWizard() {
    setName("");
    setDate("");
    setCategory("");
    setPlacement("");
    setLocation("");
    setNotes("");
    setFieldErrors({});
    setNotice(undefined);
    setCreatedCompetition(undefined);
    setSubmissionState("idle");
    setStep(0);
  }

  if (AUTH_LOADING_STATUSES.includes(status)) {
    return <AppLoadingState activeNav="birds" email={session?.email} farmName={farmName} label="Preparando competição" message="Conferindo sua sessão e o criatório selecionado." />;
  }
  if (status === "unauthenticated") {
    return <StateCard actionHref="/login" actionLabel="Entrar" heading="Entre para registrar uma competição" message="Sua sessão é necessária para consultar as aves do criatório." />;
  }
  if (status === "forbidden" || status === "error") {
    return <StateCard heading="Não foi possível abrir o formulário" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="birds" email={session.email} farmName={farmName} label="Preparando competição" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="birds" email={session.email} farmName={farmName}><StateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para registrar uma competição."} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="birds" email={session.email} farmName={farmName}><StateCard heading="Não foi possível abrir o formulário" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadData()} /></AuthenticatedShell>;
  }
  if (birdsState === "loading") {
    return <AuthenticatedShell activeNav="birds" email={session.email} farmName={farmName}><main className="document-wizard-page competition-wizard-page"><AppLoadingContent label="Carregando aves" message="Buscando as aves do criatório selecionado." /></main></AuthenticatedShell>;
  }
  if (birdsState === "error") {
    return <AuthenticatedShell activeNav="birds" email={session.email} farmName={farmName}><StateCard heading="Não foi possível carregar as aves" message={birdsError ?? "Tente novamente para escolher uma ave."} onRetry={() => selectedFarmId && void loadBirdPage(selectedFarmId, page)} /></AuthenticatedShell>;
  }
  if (birdsState === "empty") {
    return <AuthenticatedShell activeNav="birds" email={session.email} farmName={farmName}><StateCard actionHref="/plantel/aves/novo" actionLabel="Cadastrar ave" heading="Nenhuma ave disponível" message="Cadastre ao menos uma ave no criatório para registrar uma competição." /></AuthenticatedShell>;
  }

  const birdDetailsHref = selectedBirdId ? `/plantel/aves/${encodeURIComponent(selectedBirdId)}` : "/plantel/aves";

  return (
    <AuthenticatedShell activeNav="birds" email={session.email} farmName={farmName}>
      <main className="document-wizard-page competition-wizard-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb">
          <Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">›</span><span aria-current="page">Registrar competição</span>
        </nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Histórico da ave</p><h1>Registrar competição</h1><p>Registre o resultado e os detalhes da participação da ave.</p></div>
          {!createdCompetition && <Link className="document-wizard-back-link" href={birdDetailsHref}>Voltar à ficha da ave</Link>}
        </header>

        {!createdCompetition && <Progress activeStep={step} onSelect={(nextStep) => { setNotice(undefined); setFieldErrors({}); setStep(nextStep); }} />}
        {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

        <form className="document-wizard-card competition-wizard-card" onSubmit={submit}>
          {!createdCompetition && step === 0 && (
            <section aria-labelledby="titulo-etapa-ave">
              <div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 1 de 4</p><h2 id="titulo-etapa-ave">Selecione a ave</h2><p>Escolha a ave cujo histórico receberá este resultado.</p></div></div>
              <label className="competition-search-field" htmlFor="buscar-ave"><span>Buscar ave</span><input id="buscar-ave" onChange={(event) => setBirdSearch(event.target.value)} placeholder="Nome, anilha ou espécie" type="search" value={birdSearch} /></label>
              {visibleBirds.length > 0 ? (
              <ul aria-label="Aves disponíveis" className="competition-bird-grid">
                  {visibleBirds.map((bird) => <BirdOption bird={bird} key={bird.birdId} onSelect={() => selectBird(bird)} selected={selectedBirdId === bird.birdId} />)}
                </ul>
              ) : <p className="competition-empty-search">Nenhuma ave corresponde à busca nesta página.</p>}
              {selectedBird && !birds.some((bird) => bird.birdId === selectedBird.birdId) && <p className="competition-selected-context">Ave pré-selecionada: <strong>{selectedBird.name}</strong></p>}
              {fieldErrors.birdId && <p className="document-wizard-field-error" role="alert">{fieldErrors.birdId}</p>}
              {totalPages > 1 && (
                <div aria-label="Paginação das aves" className="competition-pagination">
                  <button disabled={page <= 1} onClick={() => selectedFarmId && void loadBirdPage(selectedFarmId, page - 1)} type="button">Anterior</button>
                  <span>Página {page} de {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => selectedFarmId && void loadBirdPage(selectedFarmId, page + 1)} type="button">Próxima</button>
                </div>
              )}
            </section>
          )}

          {!createdCompetition && step === 1 && (
            <section aria-labelledby="titulo-etapa-dados">
              <div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 2 de 4</p><h2 id="titulo-etapa-dados">Dados da competição</h2><p>Informe o nome do evento e, se souber, quando aconteceu.</p></div></div>
              <div className="competition-fields-grid">
                <label className="competition-field competition-field-wide" htmlFor="nome-competicao"><span>Nome da competição <b aria-hidden="true">*</b></span><input aria-describedby={fieldErrors.name ? "erro-nome-competicao" : undefined} aria-invalid={Boolean(fieldErrors.name)} autoComplete="off" id="nome-competicao" maxLength={200} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: undefined })); }} placeholder="Ex.: Exposição Estadual de Aves" value={name} />{fieldErrors.name && <small className="competition-field-error" id="erro-nome-competicao">{fieldErrors.name}</small>}</label>
                <label className="competition-field" htmlFor="data-competicao"><span>Data <em>opcional</em></span><input aria-describedby={fieldErrors.date ? "erro-data-competicao" : undefined} aria-invalid={Boolean(fieldErrors.date)} id="data-competicao" onChange={(event) => { setDate(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })); }} type="date" value={date} />{fieldErrors.date && <small className="competition-field-error" id="erro-data-competicao">{fieldErrors.date}</small>}</label>
              </div>
              <div className="competition-tip-box"><span aria-hidden="true">i</span><p>A data é opcional e não pode ser posterior a hoje.</p></div>
            </section>
          )}

          {!createdCompetition && step === 2 && (
            <section aria-labelledby="titulo-etapa-resultado">
              <div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 3 de 4</p><h2 id="titulo-etapa-resultado">Resultado e detalhes</h2><p>Categoria, colocação, local e observações são opcionais.</p></div></div>
              <div className="competition-fields-grid">
                <label className="competition-field" htmlFor="categoria-competicao"><span>Categoria <em>opcional</em></span><input aria-describedby={fieldErrors.category ? "erro-categoria-competicao" : "ajuda-categoria-competicao"} aria-invalid={Boolean(fieldErrors.category)} id="categoria-competicao" maxLength={200} onChange={(event) => { setCategory(event.target.value); setFieldErrors((current) => ({ ...current, category: undefined })); }} placeholder="Ex.: Canário individual" value={category} /><small id={fieldErrors.category ? "erro-categoria-competicao" : "ajuda-categoria-competicao"} className={fieldErrors.category ? "competition-field-error" : undefined}>{fieldErrors.category ?? "Digite a categoria livremente."}</small></label>
                <label className="competition-field" htmlFor="colocacao-competicao"><span>Colocação <em>opcional</em></span><input aria-describedby={fieldErrors.placement ? "erro-colocacao-competicao" : undefined} aria-invalid={Boolean(fieldErrors.placement)} autoComplete="off" id="colocacao-competicao" inputMode="numeric" onChange={(event) => { setPlacement(event.target.value); setFieldErrors((current) => ({ ...current, placement: undefined })); }} placeholder="Ex.: 1" type="text" value={placement} />{fieldErrors.placement && <small className="competition-field-error" id="erro-colocacao-competicao">{fieldErrors.placement}</small>}</label>
                <label className="competition-field" htmlFor="local-competicao"><span>Local <em>opcional</em></span><input aria-describedby={fieldErrors.location ? "erro-local-competicao" : undefined} aria-invalid={Boolean(fieldErrors.location)} id="local-competicao" maxLength={200} onChange={(event) => { setLocation(event.target.value); setFieldErrors((current) => ({ ...current, location: undefined })); }} placeholder="Ex.: São Paulo, SP" value={location} />{fieldErrors.location && <small className="competition-field-error" id="erro-local-competicao">{fieldErrors.location}</small>}</label>
                <label className="competition-field competition-field-wide" htmlFor="notas-competicao"><span>Notas <em>opcional</em></span><textarea aria-describedby={fieldErrors.notes ? "erro-notas-competicao" : "contador-notas-competicao"} aria-invalid={Boolean(fieldErrors.notes)} id="notas-competicao" maxLength={2000} onChange={(event) => { setNotes(event.target.value); setFieldErrors((current) => ({ ...current, notes: undefined })); }} placeholder="Registre informações úteis sobre a participação." rows={5} value={notes} />{fieldErrors.notes ? <small className="competition-field-error" id="erro-notas-competicao">{fieldErrors.notes}</small> : <small className="competition-character-count" id="contador-notas-competicao">{notes.length}/2000 caracteres</small>}</label>
              </div>
            </section>
          )}

          {!createdCompetition && step === 3 && (
            <section aria-labelledby="titulo-etapa-revisao">
              <div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de 4</p><h2 id="titulo-etapa-revisao">Revise as informações</h2><p>Confira o resultado antes de salvá-lo no histórico da ave.</p></div></div>
              {fieldErrors.form && <p className="document-wizard-field-error" role="alert">{fieldErrors.form}</p>}
              <dl className="document-wizard-review competition-review">
                <div><dt>Ave</dt><dd><strong>{selectedBird?.name ?? "Ave não selecionada"}</strong><small>{selectedBird?.speciesPopularName} · {selectedBird?.ringNumber ? `Anilha ${selectedBird.ringNumber}` : "Sem anilha"}</small><button onClick={() => setStep(0)} type="button">Alterar</button></dd></div>
                <div><dt>Competição</dt><dd>{name.trim()}<small>{formatDate(date)}</small><button onClick={() => setStep(1)} type="button">Alterar</button></dd></div>
                <div><dt>Resultado</dt><dd>{category.trim() || "Categoria não informada"}<small>{placement ? `${placement}ª colocação` : "Colocação não informada"}</small><button onClick={() => setStep(2)} type="button">Alterar</button></dd></div>
                <div><dt>Local e notas</dt><dd>{location.trim() || "Local não informado"}<small>{notes.trim() || "Nenhuma nota adicionada"}</small><button onClick={() => setStep(2)} type="button">Alterar</button></dd></div>
              </dl>
              <div className="competition-confirmation-box"><span aria-hidden="true">✓</span><div><strong>Pronto para registrar?</strong><p>A competição ficará vinculada à ave selecionada. Você poderá consultar o histórico depois.</p></div></div>
            </section>
          )}

          {createdCompetition && (
            <section aria-labelledby="titulo-competicao-criada" className="document-wizard-success competition-success">
              <span aria-hidden="true" className="document-wizard-success-icon">✓</span><p className="eyebrow">Registro concluído</p>
              <h2 id="titulo-competicao-criada">Competição registrada com sucesso</h2>
              <p>{createdCompetition.name} foi adicionada ao histórico de {selectedBird?.name ?? "sua ave"}.</p>
              <dl><div><dt>Data</dt><dd>{formatDate(createdCompetition.date)}</dd></div><div><dt>Categoria</dt><dd>{createdCompetition.category || "Não informada"}</dd></div><div><dt>Colocação</dt><dd>{createdCompetition.placement ? `${createdCompetition.placement}ª` : "Não informada"}</dd></div></dl>
              <Link className="auth-primary-action" href={birdDetailsHref}>Voltar à ficha da ave</Link>
              <button className="auth-secondary-action" onClick={resetWizard} type="button">Registrar outra competição</button>
            </section>
          )}

          {!createdCompetition && (
            <div className="document-wizard-actions">
              <Link className="settings-cancel-action" href={birdDetailsHref}>Cancelar</Link>
              {step > 0 && <button className="settings-cancel-action" disabled={submissionState === "loading"} onClick={goBack} type="button">Anterior</button>}
              <span>Etapa {step + 1} de 4</span>
              {step < 3
                ? <button className="auth-primary-action" type="submit">Continuar</button>
                : <button className="auth-primary-action" disabled={submissionState === "loading"} type="submit">{submissionState === "loading" ? "Salvando…" : "Salvar competição"}</button>}
            </div>
          )}
        </form>
      </main>
    </AuthenticatedShell>
  );
}
