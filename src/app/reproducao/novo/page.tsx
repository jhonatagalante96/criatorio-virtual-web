"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../lib/http/api-client";
import { AppLoadingContent, AppLoadingState } from "../../components/app-loading-state";
import { AuthenticatedShell } from "../../components/authenticated-shell";
import { DashboardIcon } from "../../components/dashboard-icons";
import { resolveBirdImageUrl } from "../../plantel/aves/bird-image";

type BirdSex = "Female" | "Male" | "Unknown";
type WizardStep = 0 | 1 | 2 | 3;
type FarmState = "blocked" | "error" | "loading" | "ready";
type BirdsState = "empty" | "error" | "loading" | "ready";
type SubmissionState = "idle" | "loading" | "success";
type Notice = { kind: "error" | "info" | "success"; text: string };

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

interface BirdListItem {
  birthDate: string | null;
  birdId: string;
  identificationPending: boolean;
  imageUrl?: string | null;
  name: string;
  ringNumber: string | null;
  sex: BirdSex;
  speciesPopularName: string;
}

interface BirdListResponse {
  items: BirdListItem[];
  totalCount: number;
}

interface ReproductionResponse {
  breedingFarmId: string;
  createdAtUtc: string;
  endDate: string | null;
  femaleBirdId: string;
  maleBirdId: string;
  notes: string | null;
  reproductionId: string;
  startDate: string;
  status: string;
  updatedAtUtc: string;
}

const wizardSteps = ["Aves", "Período", "Dados da reprodução", "Revisão"] as const;

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Não informado" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function sexLabel(value: BirdSex): string {
  if (value === "Male") return "Macho";
  if (value === "Female") return "Fêmea";
  return "Não identificado";
}

function birdMatchesSearch(bird: BirdListItem, search: string): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  if (!normalizedSearch) return true;
  return `${bird.name} ${bird.ringNumber ?? ""} ${bird.speciesPopularName}`
    .toLocaleLowerCase("pt-BR")
    .includes(normalizedSearch);
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível para esta conta.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de continuar.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível carregar os dados da reprodução. Tente novamente.";
}

function submissionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente antes de salvar a reprodução.";
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return "As aves não estão disponíveis no criatório selecionado.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de salvar a reprodução.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível registrar a reprodução. Revise os dados e tente novamente.";
}

function normalizeFarmResponse(value: BreedingFarmSelectionResponse): BreedingFarmSelectionResponse {
  return {
    breedingFarms: Array.isArray(value.breedingFarms) ? value.breedingFarms : [],
    selectedBreedingFarmId: value.selectedBreedingFarmId ?? null
  };
}

function normalizeBirdResponse(value: BirdListResponse): BirdListResponse {
  return {
    items: Array.isArray(value.items) ? value.items : [],
    totalCount: typeof value.totalCount === "number" ? value.totalCount : 0
  };
}

function BirdOption({
  bird,
  selected,
  onSelect
}: Readonly<{ bird: BirdListItem; onSelect: () => void; selected: boolean }>) {
  const unavailable = !bird.ringNumber || bird.identificationPending;
  return (
    <li>
      <button
        aria-selected={selected}
        className={`reproduction-bird-option${selected ? " is-selected" : ""}`}
        disabled={unavailable}
        onClick={onSelect}
        role="option"
        title={unavailable ? "Uma anilha válida é necessária para registrar a reprodução." : undefined}
        type="button"
      >
        <img alt="" aria-hidden="true" className="reproduction-bird-image" src={resolveBirdImageUrl(bird.imageUrl)} />
        <span className="reproduction-bird-copy">
          <strong>{bird.name}</strong>
          <span>{bird.speciesPopularName} · {sexLabel(bird.sex)}</span>
          <span>{unavailable ? "Identificação pendente · anilha necessária" : `Anilha ${bird.ringNumber}`}</span>
        </span>
        <span aria-hidden="true" className="reproduction-selection-mark">{selected ? "✓" : unavailable ? "!" : "＋"}</span>
      </button>
    </li>
  );
}

function BirdSelector({
  birds,
  label,
  search,
  selectedBirdId,
  onSearchChange,
  onSelect
}: Readonly<{
  birds: BirdListItem[];
  label: "fêmea" | "macho";
  onSearchChange: (value: string) => void;
  onSelect: (bird: BirdListItem) => void;
  search: string;
  selectedBirdId: string | undefined;
}>) {
  const filteredBirds = useMemo(() => birds.filter((bird) => birdMatchesSearch(bird, search)), [birds, search]);
  const headingId = `titulo-ave-${label}`;
  const searchId = `buscar-ave-${label}`;

  return (
        <section aria-labelledby={headingId} className="reproduction-bird-selector">
      <div className="reproduction-selector-heading">
        <span aria-hidden="true" className="reproduction-selector-icon"><DashboardIcon name="bird" /></span>
        <div>
          <h3 id={headingId}>Ave {label}</h3>
          <p>Escolha uma ave ativa e identificada.</p>
        </div>
      </div>
      <label className="document-wizard-search" htmlFor={searchId}>
        <span>Buscar por nome, anilha ou espécie</span>
        <input id={searchId} onChange={(event) => onSearchChange(event.target.value)} placeholder="Ex.: Aurora ou 123456" value={search} />
      </label>
      {filteredBirds.length > 0 ? (
        <ul aria-label={`Aves ${label === "macho" ? "machos" : "fêmeas"} disponíveis`} className="reproduction-bird-list" role="listbox">
          {filteredBirds.map((bird) => <BirdOption bird={bird} key={bird.birdId} onSelect={() => onSelect(bird)} selected={selectedBirdId === bird.birdId} />)}
        </ul>
      ) : (
        <p className="document-wizard-inline-empty" role="status">{birds.length > 0 ? "Nenhuma ave corresponde à busca." : `Nenhuma ave ${label} elegível foi encontrada.`}</p>
      )}
    </section>
  );
}

function Progress({ activeStep, onSelect }: Readonly<{ activeStep: WizardStep; onSelect: (step: WizardStep) => void }>) {
  return (
    <ol aria-label="Etapas da nova reprodução" className="document-wizard-progress reproduction-wizard-progress">
      {wizardSteps.map((label, index) => {
        const step = index as WizardStep;
        const isActive = activeStep === step;
        const isComplete = step < activeStep;
        return (
          <li className={`${isActive ? "is-active is-current" : ""}${isComplete ? " is-complete" : ""}`} key={label}>
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
    <main className="reproduction-wizard-page">
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

function ReproductionWizard() {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const loadRequestId = useRef(0);
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [birdsState, setBirdsState] = useState<BirdsState>("loading");
  const [farmError, setFarmError] = useState<string | undefined>();
  const [birdsError, setBirdsError] = useState<string | undefined>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [maleBirds, setMaleBirds] = useState<BirdListItem[]>([]);
  const [femaleBirds, setFemaleBirds] = useState<BirdListItem[]>([]);
  const [maleSearch, setMaleSearch] = useState("");
  const [femaleSearch, setFemaleSearch] = useState("");
  const [maleBirdId, setMaleBirdId] = useState<string>();
  const [femaleBirdId, setFemaleBirdId] = useState<string>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<WizardStep>(0);
  const [notice, setNotice] = useState<Notice>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [createdReproduction, setCreatedReproduction] = useState<ReproductionResponse>();

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const loadBirds = useCallback(async (breedingFarmId: string, recoverSession = true) => {
    if (!client.current) return;
    setBirdsState("loading");
    setBirdsError(undefined);
    try {
      const [maleResponse, femaleResponse] = await Promise.all([
        client.current.request<BirdListResponse>("api/birds?sex=Male&status=Active&sortBy=name&sortDirection=asc&page=1&pageSize=50"),
        client.current.request<BirdListResponse>("api/birds?sex=Female&status=Active&sortBy=name&sortDirection=asc&page=1&pageSize=50")
      ]);
      const males = normalizeBirdResponse(maleResponse).items.filter((bird) => bird.sex === "Male");
      const females = normalizeBirdResponse(femaleResponse).items.filter((bird) => bird.sex === "Female");
      setMaleBirds(males);
      setFemaleBirds(females);
      setMaleBirdId((current) => males.some((bird) => bird.birdId === current) ? current : undefined);
      setFemaleBirdId((current) => females.some((bird) => bird.birdId === current) ? current : undefined);
      setBirdsState(males.length === 0 || females.length === 0 ? "empty" : "ready");
      client.current.setTenant(breedingFarmId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) {
          await loadBirds(breedingFarmId, false);
          return;
        }
      }
      if (error instanceof StaleTenantResponseError) return;
      setBirdsState("error");
      setBirdsError(requestErrorMessage(error));
    }
  }, [refresh]);

  const loadData = useCallback(async (recoverSession = true) => {
    const requestId = ++loadRequestId.current;
    if (!client.current) return;
    setFarmState("loading");
    setBirdsState("loading");
    setFarmError(undefined);
    try {
      const response = normalizeFarmResponse(await client.current.request<BreedingFarmSelectionResponse>("api/breeding-farms"));
      if (requestId !== loadRequestId.current) return;
      const selectedFarm = response.breedingFarms.find((farm) => farm.breedingFarmId === response.selectedBreedingFarmId && farm.isSelected);
      if (!selectedFarm) {
        client.current.setTenant(undefined);
        setSelectedFarmId(undefined);
        setFarmState("blocked");
        setBirdsState("empty");
        return;
      }
      client.current.setTenant(selectedFarm.breedingFarmId);
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");
      await loadBirds(selectedFarm.breedingFarmId, recoverSession);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) {
          await loadData(false);
          return;
        }
      }
      if (error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409)) setFarmState("blocked");
      else setFarmState("error");
      setFarmError(requestErrorMessage(error));
    }
  }, [loadBirds, refresh]);

  useEffect(() => {
    if (status === "authenticated") void loadData();
    return () => { loadRequestId.current += 1; };
  }, [loadData, status]);

  const selectedMale = useMemo(() => maleBirds.find((bird) => bird.birdId === maleBirdId), [maleBirdId, maleBirds]);
  const selectedFemale = useMemo(() => femaleBirds.find((bird) => bird.birdId === femaleBirdId), [femaleBirdId, femaleBirds]);

  function validateStep(): boolean {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!selectedMale) errors.maleBirdId = "Selecione uma ave macho para continuar.";
      if (!selectedFemale) errors.femaleBirdId = "Selecione uma ave fêmea para continuar.";
    }
    if (step === 1) {
      const today = todayIso();
      if (!startDate) errors.startDate = "Informe a data de início.";
      else if (startDate > today) errors.startDate = "A data de início não pode estar no futuro.";
      if (endDate && endDate > today) errors.endDate = "A data de término não pode estar no futuro.";
      else if (endDate && startDate && endDate < startDate) errors.endDate = "A data de término deve ser igual ou posterior à data de início.";
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
    setStep((current) => Math.min(3, current + 1) as WizardStep);
  }

  function goBack() {
    setNotice(undefined);
    setFieldErrors({});
    setStep((current) => Math.max(0, current - 1) as WizardStep);
  }

  function selectBird(kind: "female" | "male", bird: BirdListItem) {
    if (kind === "male") setMaleBirdId(bird.birdId);
    else setFemaleBirdId(bird.birdId);
    setFieldErrors((current) => ({ ...current, maleBirdId: "", femaleBirdId: "", pair: "" }));
    setNotice(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      goNext();
      return;
    }
    if (!selectedFarmId || !selectedMale || !selectedFemale || submissionState === "loading") return;
    if (!validateStep()) return;
    setSubmissionState("loading");
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<ReproductionResponse>("api/reproductions", {
        body: JSON.stringify({
          maleBirdId: selectedMale.birdId,
          femaleBirdId: selectedFemale.birdId,
          startDate,
          endDate: endDate || null,
          notes: notes.trim() || null
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setCreatedReproduction(response);
      setSubmissionState("success");
      setNotice({ kind: "success", text: "Reprodução registrada com sucesso." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      const serverErrors = error instanceof ApiError ? error.fields : {};
      const mappedErrors: Record<string, string> = {};
      Object.entries(serverErrors).forEach(([key, messages]) => {
        const message = messages[0] ?? "Revise este campo.";
        const normalizedKey = key.toLocaleLowerCase("pt-BR");
        if (normalizedKey.includes("male") || normalizedKey.includes("female") || normalizedKey === "birds" || normalizedKey === "request") mappedErrors.pair = message;
        else if (normalizedKey.includes("start")) mappedErrors.startDate = message;
        else if (normalizedKey.includes("end")) mappedErrors.endDate = message;
        else if (normalizedKey.includes("note")) mappedErrors.notes = message;
      });
      setFieldErrors(mappedErrors);
      if (mappedErrors.pair) setStep(0);
      else if (mappedErrors.startDate || mappedErrors.endDate) setStep(1);
      else if (mappedErrors.notes) setStep(2);
      setNotice({ kind: "error", text: error instanceof ApiError && error.details ? error.details : submissionErrorMessage(error) });
    } finally {
      setSubmissionState((current) => current === "success" ? current : "idle");
    }
  }

  function resetWizard() {
    setMaleBirdId(undefined);
    setFemaleBirdId(undefined);
    setStartDate("");
    setEndDate("");
    setNotes("");
    setFieldErrors({});
    setNotice(undefined);
    setCreatedReproduction(undefined);
    setSubmissionState("idle");
    setStep(0);
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="reproduction" email={session?.email} farmName={farmName} label="Preparando reprodução" message="Consultando o criatório e as aves elegíveis." />;
  }
  if (status === "unauthenticated") return <StateCard actionHref="/login" actionLabel="Entrar" heading="Entre para registrar uma reprodução" message="Sua sessão é necessária para consultar o criatório selecionado." />;
  if (status === "forbidden" || status === "error") return <StateCard heading="Não foi possível abrir a reprodução" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  if (!session) return null;
  if (farmState === "loading") return <AppLoadingState activeNav="reproduction" email={session.email} farmName={farmName} label="Preparando reprodução" message="Consultando o criatório selecionado." />;
  if (farmState === "blocked") return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para registrar uma reprodução."} /></AuthenticatedShell>;
  if (farmState === "error") return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard heading="Não foi possível abrir a reprodução" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadData()} /></AuthenticatedShell>;
  if (birdsState === "loading") return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><main className="reproduction-wizard-page"><AppLoadingContent label="Carregando aves" message="Buscando machos e fêmeas ativos no criatório selecionado." /></main></AuthenticatedShell>;
  if (birdsState === "error") return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard heading="Não foi possível carregar as aves" message={birdsError ?? "Tente novamente para escolher o casal."} onRetry={() => selectedFarmId && void loadBirds(selectedFarmId)} /></AuthenticatedShell>;
  if (birdsState === "empty") return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref="/plantel/aves/novo" actionLabel="Cadastrar ave" heading="Nenhum casal elegível disponível" message="É necessário ter ao menos um macho e uma fêmea ativos, identificados com anilha, para registrar uma reprodução." /></AuthenticatedShell>;

  return (
    <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}>
      <main className="document-wizard-page reproduction-wizard-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Nova reprodução</span></nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Reprodução do criatório</p><h1>Nova reprodução</h1><p>Registre uma nova reprodução no criatório selecionado.</p></div>
          <Link className="document-wizard-back-link" href="/dashboard">Voltar para o painel</Link>
        </header>

        <Progress activeStep={step} onSelect={(nextStep) => { setNotice(undefined); setFieldErrors({}); setStep(nextStep); }} />
        {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

        <form className="document-wizard-card reproduction-wizard-card" onSubmit={submit}>
          {step === 0 && <section aria-labelledby="titulo-etapa-aves"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 1 de 4</p><h2 id="titulo-etapa-aves">Escolha o casal</h2><p>Selecione um macho e uma fêmea elegíveis para iniciar o registro.</p></div></div><div className="reproduction-parent-grid"><BirdSelector birds={maleBirds} label="macho" onSearchChange={setMaleSearch} onSelect={(bird) => selectBird("male", bird)} search={maleSearch} selectedBirdId={maleBirdId} /><BirdSelector birds={femaleBirds} label="fêmea" onSearchChange={setFemaleSearch} onSelect={(bird) => selectBird("female", bird)} search={femaleSearch} selectedBirdId={femaleBirdId} /></div>{(fieldErrors.maleBirdId || fieldErrors.femaleBirdId || fieldErrors.pair) && <p className="document-wizard-field-error" role="alert">{fieldErrors.pair ?? fieldErrors.maleBirdId ?? fieldErrors.femaleBirdId}</p>}<div className="reproduction-rule-box"><span aria-hidden="true"><DashboardIcon name="alert" /></span><div><strong>Regra do casal</strong><p>A reprodução precisa de um macho e uma fêmea ativos e identificados. A API confirma a elegibilidade e o pertencimento ao criatório ao salvar.</p></div></div></section>}

          {step === 1 && <section aria-labelledby="titulo-etapa-periodo"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 2 de 4</p><h2 id="titulo-etapa-periodo">Defina o período</h2><p>Informe quando a reprodução começou. A data de término pode ser preenchida depois.</p></div></div><div className="reproduction-date-grid"><label className="reproduction-field" htmlFor="data-inicio"><span>Data de início <b aria-hidden="true">*</b></span><input aria-describedby={fieldErrors.startDate ? "erro-data-inicio" : undefined} aria-invalid={Boolean(fieldErrors.startDate)} id="data-inicio" max={todayIso()} onChange={(event) => { setStartDate(event.target.value); setFieldErrors((current) => ({ ...current, startDate: "" })); }} type="date" value={startDate} />{fieldErrors.startDate && <small id="erro-data-inicio" className="reproduction-field-error">{fieldErrors.startDate}</small>}</label><label className="reproduction-field" htmlFor="data-termino"><span>Data de término <em>(opcional)</em></span><input aria-describedby={fieldErrors.endDate ? "erro-data-termino" : undefined} aria-invalid={Boolean(fieldErrors.endDate)} id="data-termino" max={todayIso()} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setFieldErrors((current) => ({ ...current, endDate: "" })); }} type="date" value={endDate} />{fieldErrors.endDate && <small id="erro-data-termino" className="reproduction-field-error">{fieldErrors.endDate}</small>}</label></div><div className="reproduction-tip-box"><span aria-hidden="true">i</span><p>Deixe a data de término em branco enquanto a reprodução estiver em andamento. Você poderá atualizar o registro depois.</p></div></section>}

          {step === 2 && <section aria-labelledby="titulo-etapa-dados"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 3 de 4</p><h2 id="titulo-etapa-dados">Dados da reprodução</h2><p>Adicione uma observação para contextualizar o registro, se necessário.</p></div></div><div className="reproduction-status-field"><span>Status inicial</span><strong><i aria-hidden="true" /> Em andamento</strong><small>O status é definido pelo servidor no momento do cadastro.</small></div><label className="reproduction-field reproduction-notes-field" htmlFor="observacoes-reproducao"><span>Observações <em>(opcional)</em></span><textarea aria-describedby={fieldErrors.notes ? "erro-observacoes" : "contador-observacoes"} aria-invalid={Boolean(fieldErrors.notes)} id="observacoes-reproducao" maxLength={2000} onChange={(event) => { setNotes(event.target.value); setFieldErrors((current) => ({ ...current, notes: "" })); }} placeholder="Ex.: casal separado para acompanhamento no viveiro 2." rows={6} value={notes} />{fieldErrors.notes ? <small className="reproduction-field-error" id="erro-observacoes">{fieldErrors.notes}</small> : <small id="contador-observacoes" className="reproduction-character-count">{notes.length}/2000 caracteres</small>}</label><div className="reproduction-tip-box"><span aria-hidden="true">i</span><p>Não inclua dados sensíveis nas observações. Use este espaço apenas para informações úteis sobre o acompanhamento do casal.</p></div></section>}

          {step === 3 && !createdReproduction && <section aria-labelledby="titulo-etapa-revisao"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de 4</p><h2 id="titulo-etapa-revisao">Revise os dados</h2><p>Confira as informações antes de salvar o registro.</p></div></div>{fieldErrors.pair && <p className="document-wizard-field-error" role="alert">{fieldErrors.pair}</p>}<dl className="document-wizard-review reproduction-review"><div><dt>Casal</dt><dd><span className="reproduction-review-pair"><img alt="" aria-hidden="true" src={resolveBirdImageUrl(selectedMale?.imageUrl)} /><span><strong>{selectedMale?.name}</strong><small>Macho · {selectedMale?.speciesPopularName}</small></span><b aria-hidden="true">×</b><img alt="" aria-hidden="true" src={resolveBirdImageUrl(selectedFemale?.imageUrl)} /><span><strong>{selectedFemale?.name}</strong><small>Fêmea · {selectedFemale?.speciesPopularName}</small></span></span><button onClick={() => setStep(0)} type="button">Alterar</button></dd></div><div><dt>Período</dt><dd>{formatDate(startDate)}<small>{endDate ? `Término em ${formatDate(endDate)}` : "Em andamento · sem data de término"}</small><button onClick={() => setStep(1)} type="button">Alterar</button></dd></div><div><dt>Status</dt><dd>Em andamento<small>Definido pelo servidor ao salvar</small><button onClick={() => setStep(2)} type="button">Ver dados</button></dd></div><div><dt>Observações</dt><dd>{notes.trim() || "Nenhuma observação"}<button onClick={() => setStep(2)} type="button">Alterar</button></dd></div></dl><div className="reproduction-confirmation-box"><span aria-hidden="true">✓</span><div><strong>Tudo certo?</strong><p>O registro ficará vinculado ao criatório selecionado e será validado pela API antes de ser criado.</p></div></div></section>}

          {step === 3 && createdReproduction && <section aria-labelledby="titulo-reproducao-criada" className="document-wizard-success reproduction-success"><span aria-hidden="true" className="document-wizard-success-icon">✓</span><p className="eyebrow">Registro concluído</p><h2 id="titulo-reproducao-criada">Reprodução registrada com sucesso</h2><p>{selectedMale?.name} e {selectedFemale?.name} foram registrados no criatório.</p><dl><div><dt>Início</dt><dd>{formatDate(createdReproduction.startDate)}</dd></div><div><dt>Status</dt><dd>Em andamento</dd></div><div><dt>Identificador</dt><dd>{createdReproduction.reproductionId}</dd></div></dl><div className="reproduction-success-actions"><button className="auth-primary-action" onClick={resetWizard} type="button">Registrar outra reprodução</button><Link className="auth-secondary-action" href="/dashboard">Voltar para o painel</Link></div></section>}

          {!createdReproduction && <div className="document-wizard-actions"><Link className="settings-cancel-action" href="/dashboard">Cancelar</Link>{step > 0 && <button className="settings-cancel-action" disabled={submissionState === "loading"} onClick={goBack} type="button">Anterior</button>}<span>Etapa {step + 1} de 4</span>{step < 3 ? <button className="auth-primary-action" type="submit">Continuar</button> : <button className="auth-primary-action" disabled={submissionState === "loading"} type="submit">{submissionState === "loading" ? "Salvando…" : "Salvar reprodução"}</button>}</div>}
        </form>
      </main>
    </AuthenticatedShell>
  );
}

export default function ReproductionPage() {
  return <AuthProvider><ReproductionWizard /></AuthProvider>;
}
