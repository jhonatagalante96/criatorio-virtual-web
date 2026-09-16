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
type BatchStep = 0 | 1 | 2 | 3 | 4;
type FarmState = "blocked" | "error" | "loading" | "ready";
type BirdsState = "empty" | "error" | "loading" | "ready";
type BadgeModelId = "Classic" | "Minimalist" | "Competition" | "Photographic";
type BadgePrintSize = "Small" | "Medium" | "Large";
type DocumentField = "Name" | "RingNumber" | "Sex" | "Species" | "BirthDate" | "BirdPhoto" | "BreedingFarmName" | "BreedingFarmAddress" | "GenealogyTree";
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

interface BadgeBatchDocument {
  documentId: string;
  fileName: string;
  length: number;
  pageCount: number;
  widthMillimeters: number;
  heightMillimeters: number;
}

interface BadgeBatchItem {
  birdId: string;
  status: "Generated" | "BirdNotFound" | "MissingRingNumber" | "InvalidData" | "StorageUnavailable";
  errorCode: string | null;
  document: BadgeBatchDocument | null;
}

interface BadgeBatchPdf {
  contentBase64: string;
  contentType: string;
  fileName: string;
  heightMillimeters: number;
  length: number;
  pageCount: number;
  widthMillimeters: number;
}

interface BadgeBatchResponse {
  aggregatePdf: BadgeBatchPdf | null;
  breedingFarmId: string;
  items: BadgeBatchItem[];
  status: "Generated" | "NoDocumentsGenerated" | "StorageUnavailable";
}

const batchSteps = ["Aves", "Modelo", "Configuração", "Prévia", "Revisão"] as const;
const defaultFields: DocumentField[] = ["Name", "RingNumber", "Species", "Sex"];

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
  { id: "BreedingFarmAddress", description: "Endereço cadastrado do criatório.", name: "Endereço do criatório" },
  { id: "GenealogyTree", description: "Árvore genealógica disponível para a ave.", name: "Árvore genealógica" }
];

const sizeOptions: Array<{ id: BadgePrintSize; dimensions: string; description: string; name: string }> = [
  { id: "Small", dimensions: "85,60 × 53,98 mm", description: "Compacto para uso diário.", name: "Pequeno" },
  { id: "Medium", dimensions: "105 × 74 mm", description: "Equilíbrio entre leitura e espaço.", name: "Médio" },
  { id: "Large", dimensions: "125 × 88 mm", description: "Maior área para foto e árvore.", name: "Grande" }
];

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

function itemStatusLabel(item: BadgeBatchItem): string {
  if (item.status === "Generated") return "Gerado com sucesso";
  if (item.status === "MissingRingNumber") return "Não gerado: anilha ausente";
  if (item.status === "BirdNotFound") return "Não gerado: ave indisponível neste criatório";
  if (item.status === "StorageUnavailable") return "Não gerado: armazenamento indisponível";
  return "Não gerado: dados inválidos";
}

function batchGenerationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    if (error.fields.birdIds?.length) return "A quantidade de aves selecionadas não foi aceita. Revise a seleção e tente novamente.";
    if (error.fields.selectedFields?.length) return "Escolha pelo menos um campo válido e sem repetição.";
    return "A configuração do lote não foi aceita. Revise os dados e tente novamente.";
  }
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente antes de gerar os crachás.";
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return "As aves selecionadas não estão disponíveis no criatório atual.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de gerar os crachás.";
  if (error instanceof ApiError && error.status === 503) return "O serviço de documentos está indisponível. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível gerar os crachás. Revise os dados e tente novamente.";
}

function loadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return "Sua conta não tem permissão para acessar este criatório.";
  return "Verifique sua conexão e tente novamente.";
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

function BatchProgress() {
  return (
    <div aria-busy="true" className="badge-batch-progress" role="status">
      <span aria-hidden="true" className="document-preview-dialog-spinner" />
      <div>
        <strong>Gerando crachás…</strong>
        <span>Validando as aves e montando o PDF temporário. Não feche esta página.</span>
      </div>
    </div>
  );
}

function BatchResult({
  aggregateUrl,
  birds,
  onReset,
  result
}: Readonly<{
  aggregateUrl?: string;
  birds: BirdListItem[];
  onReset: () => void;
  result: BadgeBatchResponse;
}>) {
  const birdsById = useMemo(() => new Map(birds.map((bird) => [bird.birdId, bird])), [birds]);
  const generatedCount = result.items.filter((item) => item.status === "Generated").length;
  const pendingCount = result.items.length - generatedCount;
  const allFailed = generatedCount === 0;

  return (
    <section aria-labelledby="titulo-lote-concluido" className="badge-batch-result">
      <span aria-hidden="true" className={`badge-batch-result-icon${allFailed ? " is-error" : ""}`}>{allFailed ? "!" : "✓"}</span>
      <p className="eyebrow">Processamento concluído</p>
      <h2 id="titulo-lote-concluido">{allFailed ? "Nenhum crachá foi gerado" : "Crachás gerados com sucesso"}</h2>
      <p className="badge-batch-result-lede">
        {allFailed
          ? "O servidor recusou todas as aves selecionadas. Consulte os motivos abaixo e corrija as pendências antes de tentar novamente."
          : `${generatedCount} de ${result.items.length} ave${result.items.length === 1 ? "" : "s"} recebeu um crachá. As pendências individuais não impediram os demais documentos.`}
      </p>
      <dl className="badge-batch-summary">
        <div><dt>Gerados</dt><dd>{generatedCount}</dd></div>
        <div><dt>Com pendência</dt><dd>{pendingCount}</dd></div>
        <div><dt>PDF agregado</dt><dd>{result.aggregatePdf ? `${result.aggregatePdf.pageCount} página${result.aggregatePdf.pageCount === 1 ? "" : "s"}` : "Não disponível"}</dd></div>
      </dl>
      {result.aggregatePdf && aggregateUrl && (
        <div className="badge-batch-download">
          <div><strong>PDF agregado temporário</strong><span>O arquivo reúne somente os crachás gerados neste lote.</span></div>
          <a className="auth-primary-action" download={result.aggregatePdf.fileName} href={aggregateUrl}>Baixar PDF agregado</a>
        </div>
      )}
      <div className="badge-batch-item-results">
        <h3>Resultado por ave</h3>
        <ul aria-label="Resultado da geração por ave">
          {result.items.map((item) => {
            const bird = birdsById.get(item.birdId);
            return (
              <li className={item.status === "Generated" ? "is-generated" : "is-pending"} key={item.birdId}>
                <span aria-hidden="true">{item.status === "Generated" ? "✓" : "!"}</span>
                <div><strong>{bird?.name ?? "Ave não disponível"}</strong><small>{bird ? `${bird.speciesPopularName} · ${bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Identificação pendente"}` : "O servidor não retornou dados desta ave."}</small></div>
                <em>{itemStatusLabel(item)}</em>
              </li>
            );
          })}
        </ul>
      </div>
      <button className="auth-secondary-action" onClick={onReset} type="button">Gerar outro lote</button>
    </section>
  );
}

function BatchWizard() {
  const { refresh, session } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [farmError, setFarmError] = useState<string>();
  const [birds, setBirds] = useState<BirdListItem[]>([]);
  const [birdsError, setBirdsError] = useState<string>();
  const [birdsState, setBirdsState] = useState<BirdsState>("loading");
  const [birdSearch, setBirdSearch] = useState("");
  const [selectedBirdIds, setSelectedBirdIds] = useState<string[]>([]);
  const [step, setStep] = useState<BatchStep>(0);
  const [modelId, setModelId] = useState<BadgeModelId>("Classic");
  const [selectedFields, setSelectedFields] = useState<DocumentField[]>(defaultFields);
  const [printSize, setPrintSize] = useState<BadgePrintSize>("Medium");
  const [notice, setNotice] = useState<Notice>();
  const [generationState, setGenerationState] = useState<"idle" | "loading">("idle");
  const [batchResult, setBatchResult] = useState<BadgeBatchResponse>();
  const [aggregateUrl, setAggregateUrl] = useState<string>();

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

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
          ? "Escolha um criatório para consultar as aves do lote."
          : "Crie seu primeiro criatório antes de gerar crachás em lote.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      hasSelectedFarm = true;
      setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name ?? "Criatório selecionado");
      setFarmState("ready");

      const response = await client.current!.request<BirdListResponse>("api/birds?status=Active&sortBy=name&sortDirection=asc&page=1&pageSize=50");
      setBirds(response.items);
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
        setFarmError("Selecione novamente um criatório para gerar os crachás.");
        return;
      }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setFarmState("blocked");
        setBirdsState("empty");
        setFarmError(loadErrorMessage(error));
        return;
      }
      setFarmState(hasSelectedFarm ? "ready" : "error");
      setBirdsState("error");
      setBirdsError(loadErrorMessage(error));
    }
  }, [refresh]);

  useEffect(() => {
    if (session) void loadData();
  }, [loadData, session?.userId]);

  useEffect(() => {
    const pdf = batchResult?.aggregatePdf;
    if (!pdf || typeof URL.createObjectURL !== "function") {
      setAggregateUrl(undefined);
      return;
    }

    const binary = window.atob(pdf.contentBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: pdf.contentType }));
    setAggregateUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [batchResult]);

  const filteredBirds = useMemo(() => {
    const normalized = birdSearch.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return birds;
    return birds.filter((bird) => `${bird.name} ${bird.ringNumber ?? ""} ${bird.speciesPopularName}`.toLocaleLowerCase("pt-BR").includes(normalized));
  }, [birdSearch, birds]);

  const selectedBirds = useMemo(() => selectedBirdIds.map((id) => birds.find((bird) => bird.birdId === id)).filter((bird): bird is BirdListItem => Boolean(bird)), [birds, selectedBirdIds]);

  function toggleBird(birdId: string) {
    setSelectedBirdIds((current) => current.includes(birdId) ? current.filter((id) => id !== birdId) : [...current, birdId]);
    setNotice(undefined);
    setBatchResult(undefined);
  }

  function toggleField(field: DocumentField) {
    setSelectedFields((current) => current.includes(field) ? current.filter((value) => value !== field) : [...current, field]);
    setNotice(undefined);
  }

  function goNext() {
    if (step === 0 && selectedBirdIds.length === 0) {
      setNotice({ kind: "error", text: "Selecione pelo menos uma ave para continuar." });
      return;
    }
    if (step === 2 && selectedFields.length === 0) {
      setNotice({ kind: "error", text: "Selecione pelo menos um campo para o crachá." });
      return;
    }
    setNotice(undefined);
    setStep((current) => Math.min(4, current + 1) as BatchStep);
  }

  function goBack() {
    setNotice(undefined);
    setStep((current) => Math.max(0, current - 1) as BatchStep);
  }

  function resetWizard() {
    setBatchResult(undefined);
    setAggregateUrl(undefined);
    setNotice(undefined);
    setSelectedBirdIds([]);
    setModelId("Classic");
    setSelectedFields(defaultFields);
    setPrintSize("Medium");
    setStep(0);
  }

  async function generateBatch() {
    if (selectedBirdIds.length === 0 || selectedFields.length === 0 || generationState === "loading") return;
    setGenerationState("loading");
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const result = await client.current!.request<BadgeBatchResponse>("api/birds/documents/batch", {
        acceptedStatuses: [422],
        body: JSON.stringify({ birdIds: selectedBirdIds, modelId, printSize, selectedFields }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setBatchResult(result);
      setNotice({ kind: result.status === "Generated" ? "success" : "info", text: result.status === "Generated" ? "O lote foi processado. Confira o resultado por ave." : "Nenhuma ave elegível foi encontrada para gerar um crachá." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      setNotice({ kind: "error", text: batchGenerationError(error) });
    } finally {
      setGenerationState("idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 4) {
      void generateBatch();
      return;
    }
    goNext();
  }

  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="documents" email={session.email} farmName={farmName} label="Preparando geração em lote" message="Consultando o criatório e as aves disponíveis." />;
  }
  if (farmState === "blocked") return <FarmBlockedState email={session.email} farmName={farmName} message={farmError ?? "Selecione um criatório para continuar."} />;
  if (farmState === "error") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state" role="alert"><h1>Não foi possível abrir a geração em lote</h1><p>{birdsError ?? "Tente novamente para continuar."}</p><button className="auth-secondary-action" onClick={() => void loadData()} type="button">Tentar novamente</button></section></main>
      </AuthenticatedShell>
    );
  }
  if (birdsState === "loading") {
    return <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}><main className="document-wizard-page"><AppLoadingContent label="Carregando aves" message="Buscando aves ativas do criatório selecionado." /></main></AuthenticatedShell>;
  }
  if (birdsState === "error") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state" role="alert"><h1>Não foi possível carregar as aves</h1><p>{birdsError}</p><button className="auth-secondary-action" onClick={() => void loadData()} type="button">Tentar novamente</button></section></main>
      </AuthenticatedShell>
    );
  }
  if (birdsState === "empty") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state"><span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="bird" /></span><h1>Nenhuma ave disponível</h1><p>Cadastre uma ave ativa para liberar a geração de crachás em lote.</p><Link className="auth-primary-action" href="/plantel/aves/novo">Cadastrar ave</Link></section></main>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
      <main className="document-wizard-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/documentos">Documentos</Link><span aria-hidden="true">›</span><span aria-current="page">Crachás em lote</span></nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Documentos · lote de crachás</p><h1>Gerar crachás em lote</h1><p>Selecione aves, aplique uma única configuração e baixe o PDF agregado temporário.</p></div>
          <div className="document-wizard-header-actions"><Link className="document-wizard-back-link" href="/documentos">Voltar para documentos</Link><Link className="document-wizard-emit-link auth-primary-action" href="/documentos/novo">Emitir documento individual</Link></div>
        </header>
        {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
        {batchResult ? <div className="document-wizard-card"><BatchResult aggregateUrl={aggregateUrl} birds={birds} onReset={resetWizard} result={batchResult} /></div> : (
          <form className="document-wizard-card" onSubmit={handleSubmit}>
            <ol aria-label="Etapas da geração em lote" className="document-wizard-progress badge-batch-progress-steps">
              {batchSteps.map((label, index) => <li className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label}><span><span aria-hidden="true">{index < step ? "✓" : index + 1}</span>{label}</span></li>)}
            </ol>
            {step === 0 && <section aria-labelledby="titulo-lote-aves"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 1 de {batchSteps.length}</p><h2 id="titulo-lote-aves">Escolha as aves</h2><p>Você pode selecionar aves com pendências. A elegibilidade final será validada pelo servidor e explicada no resultado.</p></div><span className="document-wizard-count">{selectedBirdIds.length} selecionada{selectedBirdIds.length === 1 ? "" : "s"}</span></div><label className="document-wizard-search" htmlFor="buscar-ave-lote"><span>Buscar por nome, anilha ou espécie</span><input id="buscar-ave-lote" onChange={(event) => setBirdSearch(event.target.value)} placeholder="Ex.: Aurora ou 123456" value={birdSearch} /></label><ul aria-label="Aves ativas disponíveis para o lote" className="document-wizard-bird-list badge-batch-bird-list">{filteredBirds.map((bird) => <li key={bird.birdId}><label className={`badge-batch-bird-choice${selectedBirdIds.includes(bird.birdId) ? " is-selected" : ""}`}><input checked={selectedBirdIds.includes(bird.birdId)} onChange={() => toggleBird(bird.birdId)} type="checkbox" /><span aria-hidden="true" className="document-wizard-bird-icon"><DashboardIcon name="bird" /></span><span className="document-wizard-bird-copy"><strong>{bird.name}</strong><span>{bird.speciesPopularName} · {sexLabel(bird.sex)}</span><span>{bird.ringNumber ? `Anilha ${bird.ringNumber} · ${formatDate(bird.birthDate)}` : "Identificação pendente · o servidor validará a elegibilidade"}</span></span><span aria-hidden="true" className="document-wizard-selection-mark">{selectedBirdIds.includes(bird.birdId) ? "✓" : "＋"}</span></label></li>)}</ul>{filteredBirds.length === 0 && <p className="document-wizard-inline-empty" role="status">Nenhuma ave corresponde à busca.</p>}</section>}
            {step === 1 && <section aria-labelledby="titulo-lote-modelo"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 2 de {batchSteps.length}</p><h2 id="titulo-lote-modelo">Escolha o modelo</h2><p>O mesmo modelo será aplicado a todas as aves elegíveis deste lote.</p></div></div><div aria-label="Modelos de crachá" className="document-wizard-option-grid" role="radiogroup">{modelOptions.map((option) => <label className={`document-wizard-choice-card${modelId === option.id ? " is-selected" : ""}`} key={option.id}><input checked={modelId === option.id} name="badge-batch-model" onChange={() => setModelId(option.id)} type="radio" value={option.id} /><span className="document-wizard-choice-check" aria-hidden="true">{modelId === option.id ? "✓" : ""}</span><span className={`document-wizard-mini-badge document-wizard-mini-badge-${option.id.toLowerCase()}`} aria-hidden="true"><strong>Seu crachá</strong><small>{option.name}</small></span><span><strong>{option.name}</strong><small>{option.description}</small></span></label>)}</div></section>}
            {step === 2 && <section aria-labelledby="titulo-lote-configuracao"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 3 de {batchSteps.length}</p><h2 id="titulo-lote-configuracao">Defina os campos e o tamanho</h2><p>Essa configuração será compartilhada por todo o lote. Dados ausentes continuam sob validação do servidor.</p></div><span className="document-wizard-count">{selectedFields.length} campo{selectedFields.length === 1 ? "" : "s"}</span></div><div className="badge-batch-config-block"><h3>Campos do crachá</h3><div aria-label="Campos permitidos no crachá" className="document-wizard-field-grid">{fieldOptions.map((field) => <label className={`document-wizard-field-choice${selectedFields.includes(field.id) ? " is-selected" : ""}`} key={field.id}><input checked={selectedFields.includes(field.id)} onChange={() => toggleField(field.id)} type="checkbox" /><span className="document-wizard-checkbox" aria-hidden="true">{selectedFields.includes(field.id) ? "✓" : ""}</span><span><strong>{field.name}</strong><small>{field.description}</small></span></label>)}</div>{selectedFields.length === 0 && <p className="document-wizard-field-error" role="alert">Selecione pelo menos um campo para continuar.</p>}</div><div className="badge-batch-config-block"><h3>Tamanho</h3><div aria-label="Tamanhos do crachá" className="document-wizard-size-grid" role="radiogroup">{sizeOptions.map((option) => <label className={`document-wizard-size-choice${printSize === option.id ? " is-selected" : ""}`} key={option.id}><input checked={printSize === option.id} name="badge-batch-size" onChange={() => setPrintSize(option.id)} type="radio" value={option.id} /><span className={`document-wizard-size-preview document-wizard-size-${option.id.toLowerCase()}`} aria-hidden="true" /><span><strong>{option.name}</strong><small>{option.dimensions}</small><small>{option.description}</small></span></label>)}</div></div></section>}
            {step === 3 && <section aria-labelledby="titulo-lote-previa"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de {batchSteps.length}</p><h2 id="titulo-lote-previa">Confira a prévia</h2><p>Esta prévia representa a configuração única do lote. O arquivo final será montado pelo servidor conforme a elegibilidade de cada ave.</p></div></div><div aria-label="Prévia dos crachás do lote" className="badge-batch-preview-grid">{selectedBirds.map((bird) => <article className="badge-batch-preview" key={bird.birdId}><div className="badge-batch-preview-top"><span aria-hidden="true">CV</span><small>{modelLabel(modelId)}</small></div><div className="badge-batch-preview-main"><img alt={`Prévia da foto de ${bird.name}`} src={resolveBirdImageUrl(bird.imageUrl)} /><div><h3>{bird.name}</h3><p>{bird.speciesPopularName} · {sexLabel(bird.sex)}</p><div>{selectedFields.slice(0, 4).map((field) => <span key={field}>{fieldLabel(field)}</span>)}</div></div></div><footer><span>{bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Anilha pendente"}</span><span>{sizeLabel(printSize)}</span></footer></article>)}</div></section>}
            {step === 4 && <section aria-labelledby="titulo-lote-revisao"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 5 de {batchSteps.length}</p><h2 id="titulo-lote-revisao">Revise e gere</h2><p>O processamento usa o criatório selecionado e retorna o motivo de cada ave que não puder receber um crachá.</p></div></div><dl className="document-wizard-review"><div><dt>Aves</dt><dd>{selectedBirdIds.length} selecionada{selectedBirdIds.length === 1 ? "" : "s"}<small>{selectedBirds.map((bird) => bird.name).join(", ")}</small><button onClick={() => setStep(0)} type="button">Alterar seleção</button></dd></div><div><dt>Modelo</dt><dd>{modelLabel(modelId)}<button onClick={() => setStep(1)} type="button">Alterar modelo</button></dd></div><div><dt>Campos</dt><dd>{selectedFields.map(fieldLabel).join(", ")}<button onClick={() => setStep(2)} type="button">Alterar campos</button></dd></div><div><dt>Tamanho</dt><dd>{sizeLabel(printSize)}<button onClick={() => setStep(2)} type="button">Alterar tamanho</button></dd></div></dl><p className="document-wizard-privacy-note"><span aria-hidden="true">✓</span> O PDF agregado é temporário e não substitui registros oficiais.</p>{generationState === "loading" && <BatchProgress />}</section>}
            <div className="document-wizard-actions"><Link className="settings-cancel-action" href="/documentos">Cancelar</Link><span>Etapa {step + 1} de {batchSteps.length}</span>{step > 0 ? <button className="settings-cancel-action" disabled={generationState === "loading"} onClick={goBack} type="button">Anterior</button> : <span aria-hidden="true" />}{step < 4 ? <button className="auth-primary-action" disabled={selectedBirdIds.length === 0 && step === 0} type="submit">Continuar</button> : <button className="auth-primary-action" disabled={generationState === "loading" || selectedFields.length === 0} type="submit">{generationState === "loading" ? "Gerando…" : "Gerar crachás"}</button>}</div>
          </form>
        )}
      </main>
    </AuthenticatedShell>
  );
}

export default function BadgeBatchPage() {
  return <AuthProvider><BatchWizard /></AuthProvider>;
}
