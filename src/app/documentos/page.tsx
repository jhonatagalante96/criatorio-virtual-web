"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient, getApiUrl } from "../../lib/http/api-client";
import { AppLoadingContent, AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";

type BirdSex = "Female" | "Male" | "Unknown";
type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type BadgeModelId = "Classic" | "Minimalist" | "Competition" | "Photographic";
type BadgePrintSize = "Small" | "Medium" | "Large";
type DocumentField = "Name" | "RingNumber" | "Sex" | "Species" | "BirthDate" | "BirdPhoto" | "BreedingFarmName" | "GenealogyTree";
type FarmState = "blocked" | "error" | "loading" | "ready";
type BirdsState = "empty" | "error" | "loading" | "ready";
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
  name: string;
  ringNumber: string | null;
  sex: BirdSex;
  speciesPopularName: string;
}

interface BirdListResponse {
  items: BirdListItem[];
  totalCount: number;
}

interface BirdDocumentResponse {
  contentType: string;
  documentId: string;
  downloadUrl: string;
  fileName: string;
  generatedAtUtc: string;
  length: number;
  modelId: BadgeModelId;
  pageCount: number;
  printSize: BadgePrintSize;
  selectedFields: DocumentField[];
  type: "Badge";
  widthMillimeters: number;
  heightMillimeters: number;
}

const wizardSteps = ["Ave", "Modelo", "Campos", "Tamanho", "Prévia", "Revisão", "Gerar"] as const;

const modelOptions: Array<{ id: BadgeModelId; description: string; name: string }> = [
  { id: "Classic", description: "Identificação completa e atemporal.", name: "Clássico" },
  { id: "Minimalist", description: "Visual limpo para destacar o essencial.", name: "Minimalista" },
  { id: "Competition", description: "Leitura rápida para eventos e avaliações.", name: "Competição" },
  { id: "Photographic", description: "Mais espaço para a foto principal da ave.", name: "Fotográfico" }
];

const fieldOptions: Array<{ id: DocumentField; description: string; name: string }> = [
  { id: "Name", description: "Nome registrado da ave.", name: "Nome" },
  { id: "RingNumber", description: "Anilha de seis dígitos.", name: "Anilha" },
  { id: "Sex", description: "Sexo informado no plantel.", name: "Sexo" },
  { id: "Species", description: "Espécie do catálogo.", name: "Espécie" },
  { id: "BirthDate", description: "Data de nascimento, quando informada.", name: "Nascimento" },
  { id: "BirdPhoto", description: "Foto principal, quando cadastrada.", name: "Foto" },
  { id: "BreedingFarmName", description: "Nome do criatório selecionado.", name: "Criatório" },
  { id: "GenealogyTree", description: "Árvore genealógica disponível para a ave.", name: "Árvore genealógica" }
];

const sizeOptions: Array<{ id: BadgePrintSize; dimensions: string; description: string; name: string }> = [
  { id: "Small", dimensions: "85,60 × 53,98 mm", description: "Compacto para uso diário.", name: "Small" },
  { id: "Medium", dimensions: "105 × 74 mm", description: "Equilíbrio entre leitura e espaço.", name: "Medium" },
  { id: "Large", dimensions: "125 × 88 mm", description: "Maior área para foto e árvore.", name: "Large" }
];

const defaultFields: DocumentField[] = ["Name", "RingNumber", "Species", "Sex"];

function formatDate(value: string | null): string {
  if (!value) return "Nascimento não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Nascimento não informado" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function sexLabel(value: BirdSex): string {
  if (value === "Female") return "Fêmea";
  if (value === "Male") return "Macho";
  return "Não identificado";
}

function modelLabel(id: BadgeModelId): string {
  return modelOptions.find((option) => option.id === id)?.name ?? id;
}

function fieldLabel(id: DocumentField): string {
  return fieldOptions.find((option) => option.id === id)?.name ?? id;
}

function sizeLabel(id: BadgePrintSize): string {
  const option = sizeOptions.find((candidate) => candidate.id === id);
  return option ? `${option.name} · ${option.dimensions}` : id;
}

function generationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return error.fields.selectedFields?.length
      ? "Escolha pelo menos um campo válido e sem repetição."
      : "Os dados do crachá não foram aceitos. Revise a configuração e tente novamente.";
  }
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente antes de gerar o crachá.";
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return "A ave não está disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de gerar o crachá.";
  if (error instanceof ApiError && error.status === 503) return "O armazenamento privado está indisponível. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível gerar o crachá. Revise os dados e tente novamente.";
}

function FarmBlockedState({ email, farmName, message }: Readonly<{ email: string; farmName: string; message: string }>) {
  return (
    <AuthenticatedShell activeNav="documents" email={email} farmName={farmName}>
      <main className="document-wizard-page">
        <section className="document-wizard-state" role="alert">
          <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="document" /></span>
          <h1>Selecione um criatório</h1>
          <p>{message}</p>
          <Link className="auth-primary-action" href="/onboarding/criatorio/selecionar">Selecionar criatório</Link>
        </section>
      </main>
    </AuthenticatedShell>
  );
}

function BadgeWizard() {
  const { refresh, session } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const [clientReady, setClientReady] = useState(false);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [birds, setBirds] = useState<BirdListItem[]>([]);
  const [birdsError, setBirdsError] = useState<string>();
  const [birdsState, setBirdsState] = useState<BirdsState>("loading");
  const [birdSearch, setBirdSearch] = useState("");
  const [selectedBirdId, setSelectedBirdId] = useState("");
  const [requestedBirdId, setRequestedBirdId] = useState("");
  const [step, setStep] = useState<WizardStep>(0);
  const [modelId, setModelId] = useState<BadgeModelId>("Classic");
  const [selectedFields, setSelectedFields] = useState<DocumentField[]>(defaultFields);
  const [printSize, setPrintSize] = useState<BadgePrintSize>("Medium");
  const [notice, setNotice] = useState<Notice>();
  const [generated, setGenerated] = useState<BirdDocumentResponse>();
  const [generationState, setGenerationState] = useState<"idle" | "loading">("idle");

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    const queryBirdId = new URLSearchParams(window.location.search).get("birdId")?.trim() ?? "";
    setRequestedBirdId(queryBirdId);
    setClientReady(true);
  }, []);

  const loadData = useCallback(async (recoverSession = true) => {
    setFarmState("loading");
    setFarmError(undefined);
    setBirdsState("loading");
    setBirdsError(undefined);
    let hasSelectedFarm = false;
    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (!selection.selectedBreedingFarmId) {
        setFarmState("blocked");
        setBirdsState("empty");
        setFarmError(selection.breedingFarms.length > 0
          ? "Escolha um criatório para consultar as aves disponíveis para o crachá."
          : "Crie seu primeiro criatório antes de gerar um crachá.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      hasSelectedFarm = true;
      setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name ?? "Criatório selecionado");
      setFarmState("ready");

      const response = await client.current!.request<BirdListResponse>("api/birds?status=Active&sortBy=name&sortDirection=asc&page=1&pageSize=50");
      setBirds(response.items);
      setSelectedBirdId(response.items.some((bird) => bird.birdId === requestedBirdId) ? requestedBirdId : "");
      setBirdsState(response.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) {
          await loadData(false);
          return;
        }
      }
      if (error instanceof ApiError && error.status === 409) {
        setFarmState("blocked");
        setBirdsState("empty");
        setFarmError("Selecione novamente um criatório para gerar o crachá.");
        return;
      }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setFarmState("blocked");
        setBirdsState("empty");
        setFarmError("Sua conta não tem permissão para acessar este criatório.");
        return;
      }
      setFarmState(hasSelectedFarm ? "ready" : error instanceof ApiError && error.status >= 500 ? "error" : "ready");
      setBirdsState("error");
      setBirdsError(error instanceof ApiError && error.status >= 500
        ? "O serviço está indisponível no momento. Tente novamente em instantes."
        : "Verifique sua conexão e tente novamente.");
    }
  }, [refresh, requestedBirdId]);

  useEffect(() => {
    if (clientReady) void loadData();
  }, [clientReady, loadData]);

  const selectedBird = useMemo(() => birds.find((bird) => bird.birdId === selectedBirdId), [birds, selectedBirdId]);
  const filteredBirds = useMemo(() => {
    const normalized = birdSearch.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return birds;
    return birds.filter((bird) => `${bird.name} ${bird.ringNumber ?? ""} ${bird.speciesPopularName}`.toLocaleLowerCase("pt-BR").includes(normalized));
  }, [birdSearch, birds]);

  function selectBird(bird: BirdListItem) {
    setSelectedBirdId(bird.birdId);
    setNotice(undefined);
  }

  function toggleField(field: DocumentField) {
    setSelectedFields((current) => current.includes(field) ? current.filter((value) => value !== field) : [...current, field]);
    setNotice(undefined);
  }

  function canContinue(): boolean {
    if (step === 0) return Boolean(selectedBird?.ringNumber);
    if (step === 2) return selectedFields.length > 0;
    return true;
  }

  function goNext() {
    if (!selectedBird) {
      setNotice({ kind: "error", text: "Selecione uma ave para continuar." });
      return;
    }
    if (step === 0 && !selectedBird.ringNumber) {
      setNotice({ kind: "error", text: "Uma anilha válida de seis dígitos é necessária para gerar o crachá." });
      return;
    }
    if (step === 2 && selectedFields.length === 0) {
      setNotice({ kind: "error", text: "Selecione pelo menos um campo para o crachá." });
      return;
    }
    setNotice(undefined);
    setStep((current) => Math.min(6, current + 1) as WizardStep);
  }

  function goBack() {
    setNotice(undefined);
    setStep((current) => Math.max(0, current - 1) as WizardStep);
  }

  function resetWizard() {
    setGenerated(undefined);
    setNotice(undefined);
    setStep(0);
  }

  async function generateBadge() {
    if (!selectedBird || selectedFields.length === 0 || generationState === "loading") return;
    setGenerationState("loading");
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const result = await client.current!.request<BirdDocumentResponse>(`api/birds/${encodeURIComponent(selectedBird.birdId)}/documents`, {
        body: JSON.stringify({ type: "Badge", modelId, printSize, selectedFields }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setGenerated(result);
      setStep(6);
      setNotice({ kind: "success", text: "Crachá gerado e armazenado com acesso privado." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      setNotice({ kind: "error", text: generationError(error) });
    } finally {
      setGenerationState("idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 5) {
      void generateBadge();
      return;
    }
    if (step < 6) goNext();
  }

  if (!session) return null;
  if (!clientReady || farmState === "loading") {
    return <AppLoadingState activeNav="documents" email={session.email} farmName={farmName} label="Preparando geração de crachá" message="Consultando o criatório e as aves disponíveis." />;
  }
  if (farmState === "blocked") return <FarmBlockedState email={session.email} farmName={farmName} message={farmError ?? "Selecione um criatório para continuar."} />;
  if (farmState === "error") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state" role="alert"><h1>Não foi possível abrir os documentos</h1><p>{birdsError ?? "Tente novamente para continuar."}</p><button className="auth-secondary-action" onClick={() => void loadData()} type="button">Tentar novamente</button></section></main>
      </AuthenticatedShell>
    );
  }
  if (birdsState === "loading") {
    return <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}><main className="document-wizard-page"><AppLoadingContent label="Carregando aves" message="Buscando aves ativas e identificadas." /></main></AuthenticatedShell>;
  }
  if (birdsState === "error") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state" role="alert"><h1>Não foi possível carregar as aves</h1><p>{birdsError ?? "Tente novamente para escolher a ave do crachá."}</p><button className="auth-secondary-action" onClick={() => void loadData()} type="button">Tentar novamente</button></section></main>
      </AuthenticatedShell>
    );
  }
  if (birdsState === "empty") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state"><span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="bird" /></span><h1>Nenhuma ave disponível</h1><p>Cadastre uma ave ativa com anilha para liberar a geração de crachás.</p><Link className="auth-primary-action" href="/plantel/aves/novo">Cadastrar ave</Link></section></main>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
      <main className="document-wizard-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Dashboard</Link><span aria-hidden="true">›</span><span aria-current="page">Documentos</span></nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Documentos internos</p><h1>Gerar crachá</h1><p>Monte um crachá privado da ave em poucos passos, com campos e tamanho adequados ao uso.</p></div>
          <Link className="document-wizard-back-link" href="/plantel/aves">Voltar para Aves</Link>
        </header>

        <ol aria-label="Etapas da geração do crachá" className="document-wizard-progress">
          {wizardSteps.map((label, index) => <li key={label} className={index === step ? "is-current" : index < step ? "is-complete" : ""}>{index <= step ? <button aria-current={index === step ? "step" : undefined} onClick={() => { if (index < step) { setNotice(undefined); setStep(index as WizardStep); } }} type="button">{index < step ? "✓" : index + 1}<span>{label}</span></button> : <span><span aria-hidden="true">{index + 1}</span>{label}</span>}</li>)}
        </ol>

        {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

        <form className="document-wizard-card" onSubmit={handleSubmit}>
          {step === 0 && <section aria-labelledby="titulo-etapa-ave"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 1 de 6</p><h2 id="titulo-etapa-ave">Escolha a ave</h2><p>Somente aves ativas com anilha podem receber um crachá.</p></div></div><label className="document-wizard-search" htmlFor="buscar-ave"><span>Buscar por nome, anilha ou espécie</span><input id="buscar-ave" onChange={(event) => setBirdSearch(event.target.value)} placeholder="Ex.: Canário ou 123456" value={birdSearch} /></label><ul aria-label="Aves ativas disponíveis" className="document-wizard-bird-list" role="listbox">{filteredBirds.map((bird) => <li key={bird.birdId}><button aria-selected={selectedBirdId === bird.birdId} className={selectedBirdId === bird.birdId ? "is-selected" : ""} disabled={!bird.ringNumber} onClick={() => selectBird(bird)} role="option" type="button"><span className="document-wizard-bird-icon" aria-hidden="true"><DashboardIcon name="bird" /></span><span className="document-wizard-bird-copy"><strong>{bird.name}</strong><span>{bird.speciesPopularName} · {sexLabel(bird.sex)}</span><span>{bird.ringNumber ? `Anilha ${bird.ringNumber} · ${formatDate(bird.birthDate)}` : "Identificação pendente · anilha necessária"}</span></span><span aria-hidden="true" className="document-wizard-selection-mark">{selectedBirdId === bird.birdId ? "✓" : bird.ringNumber ? "＋" : "!"}</span></button></li>)}</ul>{filteredBirds.length === 0 && <p className="document-wizard-inline-empty" role="status">Nenhuma ave corresponde à busca.</p>}</section>}

          {step === 1 && <section aria-labelledby="titulo-etapa-modelo"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 2 de 6</p><h2 id="titulo-etapa-modelo">Escolha o modelo</h2><p>O modelo define a hierarquia visual do crachá, sem alterar os dados da ave.</p></div></div><div aria-label="Modelos de crachá" className="document-wizard-option-grid" role="radiogroup">{modelOptions.map((option) => <label className={`document-wizard-choice-card${modelId === option.id ? " is-selected" : ""}`} key={option.id}><input checked={modelId === option.id} name="badge-model" onChange={() => setModelId(option.id)} type="radio" value={option.id} /><span className="document-wizard-choice-check" aria-hidden="true">{modelId === option.id ? "✓" : ""}</span><span className={`document-wizard-mini-badge document-wizard-mini-badge-${option.id.toLowerCase()}`} aria-hidden="true"><strong>{selectedBird?.name ?? "Sua ave"}</strong><small>{selectedBird?.ringNumber ? `#${selectedBird.ringNumber}` : "Crachá"}</small></span><span><strong>{option.name}</strong><small>{option.description}</small></span></label>)}</div></section>}

          {step === 2 && <section aria-labelledby="titulo-etapa-campos"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 3 de 6</p><h2 id="titulo-etapa-campos">Selecione os campos</h2><p>Escolha as informações autorizadas que aparecerão no crachá.</p></div><span className="document-wizard-count">{selectedFields.length} selecionado{selectedFields.length === 1 ? "" : "s"}</span></div><div aria-label="Campos permitidos no crachá" className="document-wizard-field-grid">{fieldOptions.map((field) => <label className={`document-wizard-field-choice${selectedFields.includes(field.id) ? " is-selected" : ""}`} key={field.id}><input checked={selectedFields.includes(field.id)} onChange={() => toggleField(field.id)} type="checkbox" /><span className="document-wizard-checkbox" aria-hidden="true">{selectedFields.includes(field.id) ? "✓" : ""}</span><span><strong>{field.name}</strong><small>{field.description}</small></span></label>)}</div>{selectedFields.length === 0 && <p className="document-wizard-field-error" role="alert">Selecione pelo menos um campo para continuar.</p>}</section>}

          {step === 3 && <section aria-labelledby="titulo-etapa-tamanho"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de 6</p><h2 id="titulo-etapa-tamanho">Escolha o tamanho</h2><p>Todos os tamanhos são horizontais e seguem o contrato do crachá V0.</p></div></div><div aria-label="Tamanhos do crachá" className="document-wizard-size-grid" role="radiogroup">{sizeOptions.map((option) => <label className={`document-wizard-size-choice${printSize === option.id ? " is-selected" : ""}`} key={option.id}><input checked={printSize === option.id} name="badge-size" onChange={() => setPrintSize(option.id)} type="radio" value={option.id} /><span className={`document-wizard-size-preview document-wizard-size-${option.id.toLowerCase()}`} aria-hidden="true" /><span><strong>{option.name}</strong><small>{option.dimensions}</small><small>{option.description}</small></span></label>)}</div></section>}

          {step === 4 && <section aria-labelledby="titulo-etapa-previa"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 5 de 6</p><h2 id="titulo-etapa-previa">Confira a prévia</h2><p>Veja a hierarquia dos dados antes de revisar e gerar o arquivo.</p></div></div><div aria-label={`Prévia do crachá ${selectedBird?.name ?? ""}`} className={`document-wizard-preview document-wizard-preview-${printSize.toLowerCase()}`}><div className="document-wizard-preview-brand"><span aria-hidden="true">CV</span><small>Criatório Virtual</small></div><div className="document-wizard-preview-body"><div className="document-wizard-preview-photo" aria-hidden="true"><DashboardIcon name="bird" /></div><div><h3>{selectedBird?.name}</h3><p>{selectedBird?.speciesPopularName} · {selectedBird ? sexLabel(selectedBird.sex) : ""}</p><div className="document-wizard-preview-fields">{selectedFields.map((field) => <span key={field}>{fieldLabel(field)}{field === "RingNumber" && selectedBird?.ringNumber ? ` · ${selectedBird.ringNumber}` : ""}</span>)}</div></div></div><div className="document-wizard-preview-footer"><span>{modelLabel(modelId)}</span><span>{sizeLabel(printSize)}</span></div></div></section>}

          {step === 5 && <section aria-labelledby="titulo-etapa-revisao"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 6 de 6</p><h2 id="titulo-etapa-revisao">Revise e gere</h2><p>O PDF será armazenado de forma privada no criatório selecionado.</p></div></div><dl className="document-wizard-review"><div><dt>Ave</dt><dd>{selectedBird?.name}<small>{selectedBird?.speciesPopularName} · Anilha {selectedBird?.ringNumber}</small><button onClick={() => setStep(0)} type="button">Alterar</button></dd></div><div><dt>Modelo</dt><dd>{modelLabel(modelId)}<button onClick={() => setStep(1)} type="button">Alterar</button></dd></div><div><dt>Campos</dt><dd>{selectedFields.map(fieldLabel).join(", ")}<button onClick={() => setStep(2)} type="button">Alterar</button></dd></div><div><dt>Tamanho</dt><dd>{sizeLabel(printSize)}<button onClick={() => setStep(3)} type="button">Alterar</button></dd></div></dl><p className="document-wizard-privacy-note"><span aria-hidden="true">✓</span> O crachá não cria um QR genérico e não substitui registros oficiais.</p></section>}

          {step === 6 && generated && <section aria-labelledby="titulo-etapa-gerada" className="document-wizard-success"><span aria-hidden="true" className="document-wizard-success-icon">✓</span><p className="eyebrow">Documento pronto</p><h2 id="titulo-etapa-gerada">Crachá gerado com sucesso</h2><p>{generated.fileName} foi salvo como documento privado de {selectedBird?.name}.</p><dl><div><dt>Modelo</dt><dd>{modelLabel(generated.modelId)}</dd></div><div><dt>Tamanho</dt><dd>{sizeLabel(generated.printSize)}</dd></div><div><dt>Dimensões</dt><dd>{generated.widthMillimeters} × {generated.heightMillimeters} mm</dd></div></dl><a className="auth-primary-action" href={getApiUrl(generated.downloadUrl)} rel="noreferrer" target="_blank">Baixar crachá em PDF</a><button className="auth-secondary-action" onClick={resetWizard} type="button">Gerar outro crachá</button></section>}

          {step < 6 && <div className="document-wizard-actions"><button className="settings-cancel-action" disabled={step === 0 || generationState === "loading"} onClick={goBack} type="button">Anterior</button><span>Etapa {step + 1} de 6</span>{step < 5 ? <button className="auth-primary-action" disabled={!canContinue()} type="submit">Continuar</button> : <button className="auth-primary-action" disabled={generationState === "loading" || !canContinue()} type="submit">{generationState === "loading" ? "Gerando…" : "Gerar crachá"}</button>}</div>}
        </form>
      </main>
    </AuthenticatedShell>
  );
}

export default function DocumentsPage() {
  return <AuthProvider><BadgeWizard /></AuthProvider>;
}
