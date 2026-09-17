"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient, getApiUrl } from "../../lib/http/api-client";
import { AppLoadingContent, AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import { resolveBirdImageUrl } from "../plantel/aves/bird-image";

type BirdSex = "Female" | "Male" | "Unknown";
type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type DocumentType = "Badge" | "GenealogyCertificate" | "ProvenanceDocument";
type BadgeModelId = "Classic" | "Minimalist" | "Competition" | "Photographic";
type GenealogyCertificateModelId = "ClassicPremium" | "Institutional" | "Modern";
type DocumentModelId = BadgeModelId | GenealogyCertificateModelId;
type BadgePrintSize = "Small" | "Medium" | "Large";
type DocumentField = "Name" | "RingNumber" | "Sex" | "Species" | "BirthDate" | "BirdPhoto" | "BreedingFarmName" | "BreedingFarmAddress" | "GenealogyTree";
type DocumentView = "generate" | "history";
type DocumentHistoryFilter = "All" | DocumentType;
type FarmState = "blocked" | "error" | "loading" | "ready";
type BirdsState = "empty" | "error" | "loading" | "ready";
type FixedDocumentState = "blocked" | "error" | "idle" | "loading" | "ready";
type Notice = { kind: "error" | "info" | "success"; text: string };
type PhotoFocus = { x: number; y: number; zoom: number };

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
  isDefaultImage?: boolean;
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
  birdId: string;
  contentType: string;
  documentId: string;
  downloadUrl: string;
  fileName: string;
  generatedAtUtc: string;
  length: number;
  modelId: DocumentModelId | null;
  pageCount?: number;
  printSize: BadgePrintSize | null;
  selectedFields: DocumentField[];
  type: DocumentType;
  widthMillimeters?: number;
  heightMillimeters?: number;
}

interface BirdDocumentsResponse {
  breedingFarmId: string;
  birdId: string;
  items: BirdDocumentResponse[];
}

interface DocumentHistoryItem extends BirdDocumentResponse {
  birdName: string;
  birdSpeciesPopularName: string;
  birdRingNumber: string | null;
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

interface BirdGenealogyNode {
  birthDate: string | null;
  birdId: string | null;
  canNavigate: boolean;
  generation: number;
  isAccessible: boolean;
  isSnapshot: boolean;
  name: string;
  nodeKey: string;
  position: string;
  ringNumber: string | null;
  sex: BirdSex | null;
  source: "External" | "Private" | "Snapshot";
  status: string | null;
}

interface BirdGenealogyResponse {
  edges: Array<{ childNodeKey: string; parentNodeKey: string; position: string }>;
  isTruncated: boolean;
  maxGenerations: number;
  nodes: BirdGenealogyNode[];
  rootBirdId: string;
}

interface BreedingFarmSettingsResponse {
  contactEmail: string;
  contactPhone: string | null;
  name: string;
  officialRegistrationNumber: string | null;
  responsibleName: string;
}

const badgeWizardSteps = ["Documento", "Ave", "Modelo", "Campos", "Tamanho", "Prévia", "Revisão", "Gerar"] as const;
const fixedDocumentWizardSteps = ["Documento", "Ave", "Conferência", "Prévia", "Revisão", "Gerar"] as const;
const DOCUMENT_HISTORY_PAGE_SIZE = 10;

const modelOptions: Array<{ id: BadgeModelId; description: string; name: string }> = [
  { id: "Classic", description: "Identificação completa e atemporal.", name: "Clássico" },
  { id: "Minimalist", description: "Visual limpo para destacar o essencial.", name: "Minimalista" },
  { id: "Competition", description: "Leitura rápida para eventos e avaliações.", name: "Competição" },
  { id: "Photographic", description: "Mais espaço para a foto principal da ave.", name: "Fotográfico" }
];

const genealogyModelOptions: Array<{ id: GenealogyCertificateModelId; description: string; name: string }> = [
  { id: "ClassicPremium", description: "Acabamento escuro, sofisticado e tradicional.", name: "Clássico Premium" },
  { id: "Institutional", description: "Leitura clara para uso institucional do criatório.", name: "Institucional Claro" },
  { id: "Modern", description: "Composição leve, atual e objetiva.", name: "Moderno" }
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

const defaultFields: DocumentField[] = ["Name", "RingNumber", "Species", "Sex"];

function formatDate(value: string | null): string {
  if (!value) return "Nascimento não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Nascimento não informado" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function sexLabel(value: BirdSex | null): string {
  if (value === "Female") return "Fêmea";
  if (value === "Male") return "Macho";
  return "Não identificado";
}

function modelLabel(id: DocumentModelId): string {
  return modelOptions.find((option) => option.id === id)?.name ?? genealogyModelOptions.find((option) => option.id === id)?.name ?? id;
}

function genealogyModelLabel(id: GenealogyCertificateModelId): string {
  return genealogyModelOptions.find((option) => option.id === id)?.name ?? id;
}

function isGenealogyModelId(value: DocumentModelId | null | undefined): value is GenealogyCertificateModelId {
  return value === "ClassicPremium" || value === "Institutional" || value === "Modern";
}

function isBadgeModelId(value: DocumentModelId | null | undefined): value is BadgeModelId {
  return value === "Classic" || value === "Minimalist" || value === "Competition" || value === "Photographic";
}

function documentModelLabel(item: Pick<BirdDocumentResponse, "modelId" | "type">): string {
  if (!item.modelId) return "";
  if (item.type === "GenealogyCertificate" && isGenealogyModelId(item.modelId)) return genealogyModelLabel(item.modelId);
  if (item.type === "Badge" && isBadgeModelId(item.modelId)) return modelLabel(item.modelId);
  return item.modelId;
}

function fieldLabel(id: DocumentField): string {
  return fieldOptions.find((option) => option.id === id)?.name ?? id;
}

function sizeLabel(id: BadgePrintSize): string {
  const option = sizeOptions.find((candidate) => candidate.id === id);
  return option ? `${option.name} · ${option.dimensions}` : id;
}

function genealogyPositionLabel(position: string): string {
  if (position === "root") return "Ave consultada";
  if (position === "father") return "Pai";
  if (position === "mother") return "Mãe";
  return "Ancestral";
}

function genealogySourceLabel(node: BirdGenealogyNode): string {
  if (node.source === "External") return "Ancestral externo · sem cadastro";
  if (!node.isAccessible) return "Registro preservado · acesso restrito";
  if (node.isSnapshot) return "Registro preservado · disponível para consulta";
  return "Ave cadastrada no criatório";
}

function optionalValue(value: string | null | undefined): string {
  return value?.trim() || "Não informado";
}

function eligibilityIssueMessage(issue: BirdEligibilityIssue): string {
  if (issue.code === "MissingRingNumber") return "Informe uma anilha válida de seis dígitos na edição da ave.";
  if (issue.code === "InactiveStatus") return "A ave precisa estar ativa para emitir o certificado.";
  return issue.message.trim() || "Não foram informados detalhes adicionais para esta pendência.";
}

function fixedDocumentRequestError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para validar a ave.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar esta ave ou criatório.";
  if (error instanceof ApiError && error.status === 404) return "A ave ou o criatório não está disponível no contexto selecionado.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de continuar.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível validar os dados do documento. Tente novamente.";
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

function documentLabelForType(documentType: DocumentType): string {
  if (documentType === "GenealogyCertificate") return "certificado";
  if (documentType === "ProvenanceDocument") return "documento de procedência";
  return "crachá";
}

function documentTypeLabel(documentType: DocumentType): string {
  if (documentType === "GenealogyCertificate") return "Certificado de genealogia";
  if (documentType === "ProvenanceDocument") return "Documento de procedência";
  return "Crachá";
}

function isDocumentType(value: string): value is DocumentType {
  return value === "Badge" || value === "GenealogyCertificate" || value === "ProvenanceDocument";
}

function documentDateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function fileSizeLabel(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function documentHistoryError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para consultar os documentos.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar os documentos deste criatório.";
  if (error instanceof ApiError && error.status === 404) return "Os documentos ou o criatório não estão disponíveis no contexto selecionado.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar os documentos.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar as emissões deste criatório. Tente novamente.";
}

function documentContentError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para visualizar o documento.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para visualizar este documento.";
  if (error instanceof ApiError && error.status === 404) return "O arquivo original não está mais disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de visualizar o documento.";
  if (error instanceof ApiError && error.status >= 500) return "O armazenamento privado está indisponível. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível carregar a prévia do documento. Tente novamente.";
}

function reissueError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return "A configuração do documento não foi aceita. Revise os dados escolhidos.";
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para reemitir o documento.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para reemitir este documento.";
  if (error instanceof ApiError && error.status === 404) return "A ave ou o documento original não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de reemitir o documento.";
  if (error instanceof ApiError && error.status >= 500) return "O armazenamento privado está indisponível. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível reemitir o documento. Tente novamente.";
}

function documentGenerationError(error: unknown, documentType: DocumentType): string {
  if (documentType === "Badge") return generationError(error);
  const label = documentLabelForType(documentType);
  if (error instanceof ApiError && error.status === 400) return "Os dados obrigatórios da ave não foram aceitos. Edite a ave e tente novamente.";
  if (error instanceof ApiError && error.status === 401) return `Sua sessão expirou. Entre novamente antes de gerar o ${label}.`;
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return "A ave não está disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 409) return `Selecione novamente um criatório antes de gerar o ${label}.`;
  if (error instanceof ApiError && error.status === 503) return "O armazenamento privado está indisponível. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return `Não foi possível gerar o ${label}. Revise os dados e tente novamente.`;
}

function formatIssueDate(): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
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

function DocumentPhotoFocusFrame({
  birdName,
  className,
  focus,
  imageUrl,
  onChange
}: Readonly<{
  birdName: string;
  className?: string;
  focus: PhotoFocus;
  imageUrl?: string | null;
  onChange: (focus: PhotoFocus) => void;
}>) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; pointerId: number; x: number; y: number } | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);

  function clampPosition(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      x: focus.x,
      y: focus.y
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setIsDragging(true);
    event.preventDefault();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame || drag.pointerId !== event.pointerId) return;

    const bounds = frame.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;

    onChange({
      ...focus,
      x: clampPosition(drag.x - ((event.clientX - drag.clientX) / bounds.width) * 100),
      y: clampPosition(drag.y - ((event.clientY - drag.clientY) / bounds.height) * 100)
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (typeof event.currentTarget.releasePointerCapture === "function" && typeof event.currentTarget.hasPointerCapture === "function" && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = undefined;
    setIsDragging(false);
  }

  return (
    <div
      aria-describedby="instrucoes-ajuste-foto-documento"
      aria-label={`Arraste para posicionar a foto de ${birdName}`}
      className={`document-photo-focus-frame${className ? ` ${className}` : ""}${isDragging ? " is-dragging" : ""}`}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={frameRef}
      role="group"
    >
      <img
        alt={`Prévia da foto de ${birdName}`}
        draggable={false}
        src={resolveBirdImageUrl(imageUrl)}
        style={{ objectPosition: `${focus.x}% ${focus.y}%`, transform: `scale(${focus.zoom})` }}
      />
    </div>
  );
}

function DocumentPhotoFocusControls({ focus, onChange, onReset }: Readonly<{
  focus: PhotoFocus;
  onChange: (focus: PhotoFocus) => void;
  onReset: () => void;
}>) {
  function updateFocus(key: keyof PhotoFocus, value: string) {
    const nextValue = Number(value);
    onChange({
      ...focus,
      [key]: key === "zoom" ? Number(nextValue.toFixed(2)) : Math.min(100, Math.max(0, nextValue))
    });
  }

  return (
    <div className="document-photo-focus-controls">
      <p className="eyebrow">Enquadramento da foto</p>
      <h3 id="titulo-ajuste-foto-documento">Ajuste a ave no próprio modelo</h3>
      <p id="instrucoes-ajuste-foto-documento">Arraste a foto dentro do documento. Se preferir, use os controles; o mesmo enquadramento será aplicado ao arquivo final.</p>
      <label className="document-photo-focus-control" htmlFor="foto-documento-zoom">
        <span><span>Zoom</span><output>{focus.zoom.toFixed(2)}×</output></span>
        <input aria-label="Zoom da foto" id="foto-documento-zoom" max="3" min="1" onChange={(event) => updateFocus("zoom", event.target.value)} step="0.05" type="range" value={focus.zoom} />
      </label>
      <label className="document-photo-focus-control" htmlFor="foto-documento-horizontal">
        <span><span>Posição horizontal</span><output>{focus.x}%</output></span>
        <input aria-label="Posição horizontal da foto" id="foto-documento-horizontal" max="100" min="0" onChange={(event) => updateFocus("x", event.target.value)} step="1" type="range" value={focus.x} />
      </label>
      <label className="document-photo-focus-control" htmlFor="foto-documento-vertical">
        <span><span>Posição vertical</span><output>{focus.y}%</output></span>
        <input aria-label="Posição vertical da foto" id="foto-documento-vertical" max="100" min="0" onChange={(event) => updateFocus("y", event.target.value)} step="1" type="range" value={focus.y} />
      </label>
      <button className="document-photo-focus-reset" onClick={onReset} type="button">Centralizar imagem</button>
    </div>
  );
}

function DocumentPhotoFocusEditor({ children, focus, onChange, onReset }: Readonly<{
  children: React.ReactNode;
  focus: PhotoFocus;
  onChange: (focus: PhotoFocus) => void;
  onReset: () => void;
}>) {
  return (
    <section aria-labelledby="titulo-ajuste-foto-documento" className="document-photo-focus-editor">
      <div className="document-photo-focus-model-preview">{children}</div>
      <DocumentPhotoFocusControls focus={focus} onChange={onChange} onReset={onReset} />
    </section>
  );
}

function DocumentTypeStep({ documentType, onChange }: Readonly<{ documentType: DocumentType; onChange: (type: DocumentType) => void }>) {
  const options: Array<{ description: string; id: DocumentType; name: string }> = [
    { description: "Identificação visual personalizada da ave.", id: "Badge", name: "Crachá" },
    { description: "Resumo interno da árvore genealógica.", id: "GenealogyCertificate", name: "Certificado de genealogia" },
    { description: "Origem e dados do criatório em formato horizontal.", id: "ProvenanceDocument", name: "Documento de procedência" }
  ];

  return (
    <section aria-labelledby="titulo-etapa-documento">
      <div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 1</p><h2 id="titulo-etapa-documento">Escolha o documento</h2><p>Selecione o tipo de documento que deseja emitir. As próximas etapas serão ajustadas para a sua escolha.</p></div></div>
      <div aria-label="Tipos de documento disponíveis" className="document-type-option-grid" role="group">
        {options.map((option) => <button aria-label={option.name} aria-pressed={documentType === option.id} className={`document-type-option${documentType === option.id ? " is-selected" : ""}`} key={option.id} onClick={() => onChange(option.id)} type="button"><span aria-hidden="true" className="document-type-option-icon"><DashboardIcon name="document" /></span><span><strong>{option.name}</strong><small>{option.description}</small></span><span aria-hidden="true" className="document-type-option-check">{documentType === option.id ? "✓" : ""}</span></button>)}
      </div>
    </section>
  );
}

function DocumentWizardProgress({
  activeStep,
  className,
  onSelect,
  steps
}: Readonly<{
  activeStep: number;
  className: string;
  onSelect: (step: number) => void;
  steps: readonly string[];
}>) {
  return (
    <ol aria-label="Etapas da emissão" className={`document-wizard-progress ${className}`}>
      {steps.map((label, index) => <li key={label} className={index === activeStep ? "is-current" : index < activeStep ? "is-complete" : ""}>{index <= activeStep ? <button aria-current={index === activeStep ? "step" : undefined} onClick={() => onSelect(index)} type="button">{index < activeStep ? "✓" : index + 1}<span>{label}</span></button> : <span><span aria-hidden="true">{index + 1}</span>{label}</span>}</li>)}
    </ol>
  );
}

function DocumentPreviewDialog({
  client,
  item,
  onClose,
  onSessionExpired
}: Readonly<{
  client: ApiClient;
  item: BirdDocumentResponse;
  onClose: () => void;
  onSessionExpired: () => Promise<unknown> | void;
}>) {
  const displayFileName = item.fileName.replace(/\.pdf$/i, "");
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const requestRef = useRef<AbortController | undefined>(undefined);
  const [previewState, setPreviewState] = useState<"error" | "loading" | "ready">("loading");
  const [previewError, setPreviewError] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = undefined;
    setPreviewUrl(undefined);
  }, []);

  const loadPreview = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    releasePreview();
    setPreviewState("loading");
    setPreviewError(undefined);

    try {
      const blob = await client.requestBlob(item.downloadUrl, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const nextUrl = URL.createObjectURL(blob);
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      setPreviewState("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) void onSessionExpired();
      setPreviewError(documentContentError(error));
      setPreviewState("error");
    }
  }, [client, item.downloadUrl, onSessionExpired, releasePreview]);

  useEffect(() => {
    void loadPreview();
    return () => {
      requestRef.current?.abort();
      releasePreview();
    };
  }, [loadPreview, releasePreview]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  function closeDialog() {
    requestRef.current?.abort();
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex=\"-1\"])"
    ) ?? []);
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

  return (
    <div className="document-preview-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }} role="presentation">
      <section
        aria-describedby="document-preview-dialog-description"
        aria-labelledby="document-preview-dialog-title"
        aria-modal="true"
        className="document-preview-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className="document-preview-dialog-heading">
          <div><p className="eyebrow">Documento privado</p><h2 id="document-preview-dialog-title">Prévia do documento</h2></div>
          <button aria-label="Fechar prévia do documento" className="document-preview-dialog-close" onClick={closeDialog} ref={closeButtonRef} type="button">×</button>
        </header>
        <p className="document-preview-dialog-intro" id="document-preview-dialog-description">{documentTypeLabel(item.type)} · {displayFileName}</p>
        {previewState === "loading" && <div className="document-preview-dialog-loading" aria-live="polite" role="status"><span className="document-preview-dialog-spinner" aria-hidden="true" /><strong>Carregando prévia…</strong><span>O arquivo é buscado com a sessão e o criatório atuais.</span></div>}
        {previewState === "error" && <div className="document-preview-dialog-error" role="alert"><strong>Não foi possível abrir o documento</strong><span>{previewError}</span><button className="auth-secondary-action" onClick={() => void loadPreview()} type="button">Tentar novamente</button></div>}
        {previewState === "ready" && previewUrl && <div className="document-preview-dialog-content"><iframe title={`Prévia de ${displayFileName}`} src={previewUrl} /><div className="document-preview-dialog-actions"><a className="auth-primary-action" download={item.fileName} href={previewUrl}>Baixar documento original</a><button className="auth-secondary-action" onClick={closeDialog} type="button">Fechar</button></div></div>}
        <footer className="document-preview-dialog-footer"><span>Emissão de {documentDateLabel(item.generatedAtUtc)} · {fileSizeLabel(item.length)}</span></footer>
      </section>
    </div>
  );
}

function DocumentReissueDialog({
  client,
  csrfToken,
  item,
  onClose,
  onReissued,
  onSessionExpired
}: Readonly<{
  client: ApiClient;
  csrfToken: React.MutableRefObject<string | undefined>;
  item: BirdDocumentResponse;
  onClose: () => void;
  onReissued: (document: BirdDocumentResponse) => void;
  onSessionExpired: () => Promise<unknown> | void;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [useCustomBadge, setUseCustomBadge] = useState(false);
  const [useCustomCertificate, setUseCustomCertificate] = useState(false);
  const [modelId, setModelId] = useState<BadgeModelId>(isBadgeModelId(item.modelId) ? item.modelId : "Classic");
  const [certificateModelId, setCertificateModelId] = useState<GenealogyCertificateModelId>(isGenealogyModelId(item.modelId) ? item.modelId : "Institutional");
  const [printSize, setPrintSize] = useState<BadgePrintSize>(item.printSize ?? "Medium");
  const [selectedFields, setSelectedFields] = useState<DocumentField[]>(item.selectedFields.length > 0 ? item.selectedFields : defaultFields);
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setUseCustomBadge(false);
    setUseCustomCertificate(false);
    setModelId(isBadgeModelId(item.modelId) ? item.modelId : "Classic");
    setCertificateModelId(isGenealogyModelId(item.modelId) ? item.modelId : "Institutional");
    setPrintSize(item.printSize ?? "Medium");
    setSelectedFields(item.selectedFields.length > 0 ? item.selectedFields : defaultFields);
    setState("idle");
    setError(undefined);
  }, [item.documentId, item.modelId, item.printSize, item.selectedFields]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  function toggleField(field: DocumentField) {
    setSelectedFields((current) => current.includes(field) ? current.filter((value) => value !== field) : [...current, field]);
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "loading") return;
    if (item.type === "Badge" && useCustomBadge && selectedFields.length === 0) {
      setError("Selecione pelo menos um campo para a nova configuração do crachá.");
      return;
    }

    setState("loading");
    setError(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.fetchAntiforgeryToken();
      const body = item.type === "Badge" && useCustomBadge
        ? { modelId, printSize, selectedFields }
        : item.type === "GenealogyCertificate" && useCustomCertificate
          ? { modelId: certificateModelId }
          : {};
      const result = await client.request<BirdDocumentResponse>(`api/birds/${encodeURIComponent(item.birdId)}/documents/${encodeURIComponent(item.documentId)}/reissue`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      onReissued(result);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) void onSessionExpired();
      setError(reissueError(requestError));
      setState("idle");
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && state !== "loading") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"
    ) ?? []);
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

  return (
    <div className="document-reissue-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && state !== "loading") onClose(); }} role="presentation">
      <section aria-describedby="document-reissue-dialog-description" aria-labelledby="document-reissue-dialog-title" aria-modal="true" className="document-reissue-dialog" onKeyDown={handleKeyDown} ref={dialogRef} role="dialog">
        <header className="document-reissue-dialog-heading"><div><p className="eyebrow">Nova versão</p><h2 id="document-reissue-dialog-title">Reemitir documento</h2></div><button aria-label="Fechar reemissão" className="document-preview-dialog-close" disabled={state === "loading"} onClick={onClose} ref={closeButtonRef} type="button">×</button></header>
        <p id="document-reissue-dialog-description" className="document-reissue-dialog-intro">A emissão original de <strong>{item.fileName}</strong> permanece intacta. A nova versão usa os dados atuais do criatório.</p>
        <form id="document-reissue-form" onSubmit={handleSubmit}>
          {item.type === "Badge" ? <>
            <label className="document-reissue-dialog-toggle"><input checked={useCustomBadge} onChange={(event) => setUseCustomBadge(event.target.checked)} type="checkbox" /><span><strong>Alterar configuração do crachá</strong><small>Sem marcar, a configuração atual é preservada.</small></span></label>
            {useCustomBadge && <div className="document-reissue-dialog-options">
              <label><span>Modelo</span><select onChange={(event) => setModelId(event.target.value as BadgeModelId)} value={modelId}>{modelOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              <label><span>Tamanho</span><select onChange={(event) => setPrintSize(event.target.value as BadgePrintSize)} value={printSize}>{sizeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              <fieldset><legend>Campos permitidos</legend><div>{fieldOptions.map((field) => <label key={field.id}><input checked={selectedFields.includes(field.id)} onChange={() => toggleField(field.id)} type="checkbox" />{field.name}</label>)}</div></fieldset>
            </div>}
          </> : item.type === "GenealogyCertificate" ? <>
            <label className="document-reissue-dialog-toggle"><input checked={useCustomCertificate} onChange={(event) => setUseCustomCertificate(event.target.checked)} type="checkbox" /><span><strong>Alterar modelo do certificado</strong><small>Sem marcar, o modelo atual é preservado.</small></span></label>
            {useCustomCertificate && <div className="document-reissue-dialog-options">
              <label><span>Modelo</span><select onChange={(event) => setCertificateModelId(event.target.value as GenealogyCertificateModelId)} value={certificateModelId}>{genealogyModelOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            </div>}
          </> : <p className="document-reissue-dialog-fixed">Este tipo usa um modelo fixo. Apenas os dados atuais da ave e do criatório serão considerados na nova emissão.</p>}
          {error && <p className="document-reissue-dialog-error" role="alert">{error}</p>}
          <div className="document-reissue-dialog-actions"><button className="settings-cancel-action" disabled={state === "loading"} onClick={onClose} type="button">Cancelar</button><button className="auth-primary-action" disabled={state === "loading"} type="submit">{state === "loading" ? "Reemitindo…" : "Reemitir documento"}</button></div>
        </form>
      </section>
    </div>
  );
}

function DocumentsHistory({
  birds,
  client,
  csrfToken,
  farmName,
  onSessionExpired,
  birdSearch,
  onBirdSearchChange,
  session
}: Readonly<{
  birds: BirdListItem[];
  client: ApiClient;
  csrfToken: React.MutableRefObject<string | undefined>;
  farmName: string;
  onSessionExpired: () => Promise<unknown> | void;
  birdSearch: string;
  onBirdSearchChange: (value: string) => void;
  session: { email: string };
}>) {
  const [historyState, setHistoryState] = useState<"error" | "loading" | "ready">("loading");
  const [historyError, setHistoryError] = useState<string>();
  const [historyDocuments, setHistoryDocuments] = useState<DocumentHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<DocumentHistoryFilter>("All");
  const [historyVisibleCount, setHistoryVisibleCount] = useState(DOCUMENT_HISTORY_PAGE_SIZE);
  const [previewItem, setPreviewItem] = useState<DocumentHistoryItem>();
  const [reissueItem, setReissueItem] = useState<DocumentHistoryItem>();
  const [notice, setNotice] = useState<Notice>();
  const requestVersion = useRef(0);

  const loadHistory = useCallback(async (recoverSession = true) => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setHistoryState("loading");
    setHistoryError(undefined);
    try {
      const documentsByBird = await Promise.all(birds.map(async (bird) => {
        const response = await client.request<BirdDocumentsResponse>(`api/birds/${encodeURIComponent(bird.birdId)}/documents`);
        return response.items.filter((item) => isDocumentType(item.type)).map((item) => ({
          ...item,
          birdName: bird.name,
          birdRingNumber: bird.ringNumber,
          birdSpeciesPopularName: bird.speciesPopularName
        }));
      }));
      if (version !== requestVersion.current) return;
      setHistoryDocuments(documentsByBird.flat().sort((left, right) => {
        const leftTime = new Date(left.generatedAtUtc).getTime();
        const rightTime = new Date(right.generatedAtUtc).getTime();
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      }));
      setHistoryState("ready");
    } catch (error) {
      if (version !== requestVersion.current) return;
      if (error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await onSessionExpired();
        if (result && typeof result === "object" && "ok" in result && result.ok) {
          await loadHistory(false);
          return;
        }
      }
      setHistoryError(documentHistoryError(error));
      setHistoryState("error");
    }
  }, [birds, client, onSessionExpired]);

  useEffect(() => {
    setHistoryFilter("All");
    setNotice(undefined);
    void loadHistory();
    return () => { requestVersion.current += 1; };
  }, [loadHistory]);

  const normalizedSearch = birdSearch.trim().toLocaleLowerCase("pt-BR");
  const visibleDocuments = useMemo(
    () => historyDocuments.filter((item) => {
      const matchesType = historyFilter === "All" || item.type === historyFilter;
      const matchesSearch = !normalizedSearch || `${item.birdName} ${item.birdRingNumber ?? ""} ${item.birdSpeciesPopularName} ${item.fileName} ${documentTypeLabel(item.type)}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      return matchesType && matchesSearch;
    }),
    [historyDocuments, historyFilter, normalizedSearch]
  );

  useEffect(() => {
    setHistoryVisibleCount(DOCUMENT_HISTORY_PAGE_SIZE);
  }, [historyFilter, normalizedSearch]);

  const documentsToRender = visibleDocuments.slice(0, historyVisibleCount);
  const hasMoreDocuments = documentsToRender.length < visibleDocuments.length;

  function handleReissued(document: BirdDocumentResponse) {
    setHistoryDocuments((current) => [{
      ...document,
      birdName: reissueItem?.birdName ?? "Ave selecionada",
      birdRingNumber: reissueItem?.birdRingNumber ?? null,
      birdSpeciesPopularName: reissueItem?.birdSpeciesPopularName ?? ""
    }, ...current]);
    setReissueItem(undefined);
    setNotice({ kind: "success", text: `${documentTypeLabel(document.type)} reemitido com os dados atuais. A versão original continua no histórico.` });
  }

  return (
    <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
      <main className="document-wizard-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Documentos</span></nav>
        <header className="document-wizard-header"><div><h1>Documentos</h1><p>Consulte o histórico de emissões do criatório e emita uma nova versão quando precisar.</p></div><div className="document-wizard-header-actions"><Link className="document-wizard-back-link" href="/documentos/lote">Gerar crachás em lote</Link><Link className="auth-primary-action document-wizard-emit-link" href="/documentos/novo">Emitir novo documento</Link></div></header>
        <section aria-labelledby="titulo-historico-documentos" className="document-history-results document-wizard-card">
          <header className="document-history-results-heading"><div><p className="eyebrow">Histórico de emissões</p><h2 id="titulo-historico-documentos">Todos os documentos</h2><p>Emissões privadas de todas as aves ativas do criatório selecionado.</p></div><div className="document-history-controls"><label className="document-history-search" htmlFor="buscar-documento-historico"><span>Buscar por ave ou arquivo</span><input id="buscar-documento-historico" onChange={(event) => onBirdSearchChange(event.target.value)} placeholder="Ex.: Aurora ou crachá" value={birdSearch} /></label><label className="document-history-filter" htmlFor="filtro-tipo-documento"><span>Filtrar por tipo</span><select id="filtro-tipo-documento" onChange={(event) => setHistoryFilter(event.target.value as DocumentHistoryFilter)} value={historyFilter}><option value="All">Todos os tipos</option><option value="Badge">Crachá</option><option value="GenealogyCertificate">Certificado de genealogia</option><option value="ProvenanceDocument">Documento de procedência</option></select></label></div></header>
          {notice && <p className="document-wizard-notice document-wizard-notice-success" role="status">{notice.text}</p>}
          {historyState === "loading" && <div className="document-history-state" role="status"><span className="document-preview-dialog-spinner" aria-hidden="true" /><strong>Consultando emissões…</strong><span>Buscando somente os documentos autorizados deste criatório.</span></div>}
          {historyState === "error" && <div className="document-history-state is-error" role="alert"><strong>Não foi possível consultar o histórico</strong><span>{historyError}</span><button className="auth-secondary-action" onClick={() => void loadHistory()} type="button">Tentar novamente</button></div>}
          {historyState === "ready" && visibleDocuments.length === 0 && <div className="document-history-state" role="status"><strong>{historyDocuments.length === 0 ? "Nenhuma emissão encontrada" : "Nenhum documento encontrado"}</strong><span>{historyDocuments.length === 0 ? "As emissões de crachá, certificado e procedência aparecerão aqui." : "Altere a busca ou o filtro para consultar outras emissões."}</span></div>}
          {historyState === "ready" && visibleDocuments.length > 0 && <>
            <ul aria-label="Todos os documentos emitidos" className="document-history-list">{documentsToRender.map((item) => <li key={item.documentId}><article className="document-history-item"><div className="document-history-item-icon" aria-hidden="true"><DashboardIcon name="document" /></div><div className="document-history-item-main"><div className="document-history-item-title"><strong>{documentTypeLabel(item.type)}</strong><span>{documentDateLabel(item.generatedAtUtc)}</span></div><p>{item.fileName.replace(/\.pdf$/i, "")}</p><small>{item.birdName} · {item.birdSpeciesPopularName}{item.birdRingNumber ? ` · Anilha ${item.birdRingNumber}` : ""}{item.modelId ? ` · ${documentModelLabel(item)}` : ""}{item.printSize ? ` · ${item.printSize}` : ""}</small></div><div className="document-history-item-actions"><button className="auth-secondary-action" onClick={() => setPreviewItem(item)} type="button">Visualizar documento</button><a className="auth-secondary-action" download={item.fileName} href={getApiUrl(item.downloadUrl)}>Baixar original</a><button className="auth-primary-action" onClick={() => setReissueItem(item)} type="button">Reemitir</button></div></article></li>)}</ul>
            <div aria-live="polite" className="document-history-pagination" role="status"><span>Exibindo {documentsToRender.length} de {visibleDocuments.length} emissões</span>{hasMoreDocuments && <button className="auth-secondary-action" onClick={() => setHistoryVisibleCount((current) => current + DOCUMENT_HISTORY_PAGE_SIZE)} type="button">Carregar mais</button>}</div>
          </>}
        </section>
        {previewItem && <DocumentPreviewDialog client={client} item={previewItem} onClose={() => setPreviewItem(undefined)} onSessionExpired={onSessionExpired} />}
        {reissueItem && <DocumentReissueDialog client={client} csrfToken={csrfToken} item={reissueItem} onClose={() => setReissueItem(undefined)} onReissued={handleReissued} onSessionExpired={onSessionExpired} />}
      </main>
    </AuthenticatedShell>
  );
}

function DocumentsWizard({ initialView }: Readonly<{ initialView: DocumentView }>) {
  const { refresh, session } = useAuth();
  const isHistoryView = initialView === "history";
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const [clientReady, setClientReady] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("Badge");
  const [isDocumentTypeStep, setIsDocumentTypeStep] = useState(true);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [selectedBreedingFarmId, setSelectedBreedingFarmId] = useState("");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [birds, setBirds] = useState<BirdListItem[]>([]);
  const [birdsError, setBirdsError] = useState<string>();
  const [birdsState, setBirdsState] = useState<BirdsState>("loading");
  const [birdSearch, setBirdSearch] = useState("");
  const [selectedBirdId, setSelectedBirdId] = useState("");
  const [requestedBirdId, setRequestedBirdId] = useState("");
  const [step, setStep] = useState<WizardStep>(0);
  const [modelId, setModelId] = useState<BadgeModelId>("Classic");
  const [certificateModelId, setCertificateModelId] = useState<GenealogyCertificateModelId>("Institutional");
  const [selectedFields, setSelectedFields] = useState<DocumentField[]>(defaultFields);
  const [printSize, setPrintSize] = useState<BadgePrintSize>("Medium");
  const [photoFocus, setPhotoFocus] = useState<PhotoFocus>({ x: 50, y: 50, zoom: 1 });
  const [fixedDocumentState, setFixedDocumentState] = useState<FixedDocumentState>("idle");
  const [fixedDocumentError, setFixedDocumentError] = useState<string>();
  const [fixedDocumentEligibility, setFixedDocumentEligibility] = useState<BirdEligibilityResponse>();
  const [fixedDocumentGenealogy, setFixedDocumentGenealogy] = useState<BirdGenealogyResponse>();
  const [fixedDocumentFarm, setFixedDocumentFarm] = useState<BreedingFarmSettingsResponse>();
  const [notice, setNotice] = useState<Notice>();
  const [generated, setGenerated] = useState<BirdDocumentResponse>();
  const [generationState, setGenerationState] = useState<"idle" | "loading">("idle");

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const queryBirdId = query.get("birdId")?.trim() ?? "";
    const queryType = query.get("type");
    const hasDocumentType = queryType !== null && isDocumentType(queryType);
    setDocumentType(hasDocumentType ? queryType : "Badge");
    setIsDocumentTypeStep(initialView === "generate");
    setRequestedBirdId(queryBirdId);
    setClientReady(true);
  }, [initialView]);

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
          ? isHistoryView ? "Escolha um criatório para consultar o histórico de documentos." : "Escolha um criatório para consultar as aves disponíveis para os documentos."
          : isHistoryView ? "Crie seu primeiro criatório antes de consultar o histórico." : "Crie seu primeiro criatório antes de gerar um documento.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      setSelectedBreedingFarmId(selection.selectedBreedingFarmId);
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
        setFarmError("Selecione novamente um criatório para gerar o documento.");
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
  }, [isHistoryView, refresh, requestedBirdId]);

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
    setPhotoFocus({ x: 50, y: 50, zoom: 1 });
    setFixedDocumentState("idle");
    setFixedDocumentError(undefined);
    setFixedDocumentEligibility(undefined);
    setFixedDocumentGenealogy(undefined);
    setFixedDocumentFarm(undefined);
    setGenerated(undefined);
    setNotice(undefined);
  }

  function selectDocumentType(type: DocumentType) {
    setDocumentType(type);
    setPhotoFocus({ x: 50, y: 50, zoom: 1 });
    setCertificateModelId("Institutional");
    setIsDocumentTypeStep(true);
    setStep(0);
    setGenerated(undefined);
    setNotice(undefined);
    setFixedDocumentState("idle");
    setFixedDocumentError(undefined);
    setFixedDocumentEligibility(undefined);
    setFixedDocumentGenealogy(undefined);
    setFixedDocumentFarm(undefined);
    const params = new URLSearchParams();
    params.set("type", type);
    if (requestedBirdId) params.set("birdId", requestedBirdId);
    window.history.pushState({}, "", `/documentos/novo?${params.toString()}`);
  }

  function toggleField(field: DocumentField) {
    setSelectedFields((current) => current.includes(field) ? current.filter((value) => value !== field) : [...current, field]);
    setNotice(undefined);
  }

  function canContinue(): boolean {
    if (isDocumentTypeStep) return true;
    if (step === 0) return documentType !== "Badge" ? Boolean(selectedBird) : Boolean(selectedBird?.ringNumber);
    if (documentType !== "Badge" && step === 1) return fixedDocumentState === "ready";
    if (step === 2) return documentType !== "Badge" || selectedFields.length > 0;
    return true;
  }

  function goNext() {
    if (isDocumentTypeStep) {
      setNotice(undefined);
      setIsDocumentTypeStep(false);
      setStep(0);
      return;
    }
    if (!selectedBird) {
      setNotice({ kind: "error", text: "Selecione uma ave para continuar." });
      return;
    }
    if (documentType === "Badge" && step === 0 && !selectedBird.ringNumber) {
      setNotice({ kind: "error", text: "Uma anilha válida de seis dígitos é necessária para gerar o crachá." });
      return;
    }
    if (documentType !== "Badge" && step === 0) {
      void validateFixedDocument();
      return;
    }
    if (documentType !== "Badge" && step === 1 && fixedDocumentState !== "ready") {
      if (fixedDocumentState === "error") void validateFixedDocument();
      return;
    }
    if (step === 2 && selectedFields.length === 0) {
      setNotice({ kind: "error", text: "Selecione pelo menos um campo para o crachá." });
      return;
    }
    setNotice(undefined);
    const lastStep = documentType === "Badge" ? 6 : 4;
    setStep((current) => Math.min(lastStep, current + 1) as WizardStep);
  }

  function goBack() {
    setNotice(undefined);
    setStep((current) => Math.max(0, current - 1) as WizardStep);
  }

  function resetWizard() {
    setGenerated(undefined);
    setNotice(undefined);
    setCertificateModelId("Institutional");
    setPhotoFocus({ x: 50, y: 50, zoom: 1 });
    setIsDocumentTypeStep(true);
    setFixedDocumentState("idle");
    setFixedDocumentError(undefined);
    setFixedDocumentEligibility(undefined);
    setFixedDocumentGenealogy(undefined);
    setFixedDocumentFarm(undefined);
    setStep(0);
  }

  async function validateFixedDocument(recoverSession = true) {
    if (!selectedBird || fixedDocumentState === "loading") return;
    setFixedDocumentState("loading");
    setFixedDocumentError(undefined);
    setFixedDocumentEligibility(undefined);
    setFixedDocumentGenealogy(undefined);
    setFixedDocumentFarm(undefined);
    setNotice(undefined);
    setStep(1);
    try {
      const eligibility = await client.current!.request<BirdEligibilityResponse>(`api/birds/${encodeURIComponent(selectedBird.birdId)}/eligibility`);
      setFixedDocumentEligibility(eligibility);
      if (!eligibility.isEligible) {
        setFixedDocumentState("blocked");
        return;
      }

      const [genealogy, farm] = await Promise.all([
        client.current!.request<BirdGenealogyResponse>(`api/birds/${encodeURIComponent(selectedBird.birdId)}/genealogy?maxGenerations=6`),
        client.current!.request<BreedingFarmSettingsResponse>(`api/breeding-farms/${encodeURIComponent(selectedBreedingFarmId)}/settings`)
      ]);
      setFixedDocumentGenealogy(genealogy);
      setFixedDocumentFarm(farm);
      setFixedDocumentState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) {
          await validateFixedDocument(false);
          return;
        }
      }
      setFixedDocumentState("error");
      setFixedDocumentError(fixedDocumentRequestError(error));
    }
  }

  async function generateDocument() {
    if (!selectedBird || generationState === "loading" || (documentType === "Badge" && selectedFields.length === 0)) return;
    setGenerationState("loading");
    setNotice(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const body = documentType === "Badge"
        ? { type: "Badge", modelId, printSize, selectedFields, photoFocus }
        : documentType === "GenealogyCertificate"
          ? { type: "GenealogyCertificate", modelId: certificateModelId, photoFocus }
          : { type: documentType, photoFocus };
      const result = await client.current!.request<BirdDocumentResponse>(`api/birds/${encodeURIComponent(selectedBird.birdId)}/documents`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setGenerated(result);
      setStep(documentType === "Badge" ? 6 : 4);
      setNotice({ kind: "success", text: `${documentLabelForType(documentType)[0].toUpperCase()}${documentLabelForType(documentType).slice(1)} gerado e armazenado com acesso privado.` });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      setNotice({ kind: "error", text: documentGenerationError(error, documentType) });
    } finally {
      setGenerationState("idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((documentType === "Badge" && step === 5) || (documentType !== "Badge" && step === 3)) {
      void generateDocument();
      return;
    }
    if (step < (documentType === "Badge" ? 6 : 4)) goNext();
  }

  const isGenealogyCertificate = documentType === "GenealogyCertificate";
  const isProvenanceDocument = documentType === "ProvenanceDocument";
  const isFixedDocument = isGenealogyCertificate || isProvenanceDocument;
  const steps = isFixedDocument ? fixedDocumentWizardSteps : badgeWizardSteps;
  const progressStep = isDocumentTypeStep ? 0 : step + 1;
  const documentLabel = isGenealogyCertificate ? "certificado de genealogia" : isProvenanceDocument ? "documento de procedência" : "crachá";
  const documentTitle = "Emitir novo documento";

  if (!session) return null;
  if (!clientReady || farmState === "loading") {
    return <AppLoadingState activeNav="documents" email={session.email} farmName={farmName} label={isHistoryView ? "Carregando documentos" : `Preparando geração de ${documentLabel}`} message={isHistoryView ? "Consultando o histórico do criatório selecionado." : "Consultando o criatório e as aves disponíveis."} />;
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
    return <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}><main className="document-wizard-page"><AppLoadingContent label={isHistoryView ? "Carregando documentos" : "Carregando aves"} message={isHistoryView ? "Buscando as emissões autorizadas do criatório." : "Buscando aves ativas e identificadas."} /></main></AuthenticatedShell>;
  }
  if (birdsState === "error") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state" role="alert"><h1>Não foi possível carregar as aves</h1><p>{birdsError ?? `Tente novamente para escolher a ave do ${documentLabel}.`}</p><button className="auth-secondary-action" onClick={() => void loadData()} type="button">Tentar novamente</button></section></main>
      </AuthenticatedShell>
    );
  }

  if (initialView === "history") {
    return (
      <DocumentsHistory
        birdSearch={birdSearch}
        birds={birds}
        client={client.current}
        csrfToken={csrfToken}
        farmName={farmName}
        onBirdSearchChange={setBirdSearch}
        onSessionExpired={refresh}
        session={session}
      />
    );
  }

  if (birdsState === "empty") {
    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page"><section className="document-wizard-state"><span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="bird" /></span><h1>Nenhuma ave disponível</h1><p>Cadastre uma ave ativa para liberar a geração de documentos.</p><Link className="auth-primary-action" href="/plantel/aves/novo">Cadastrar ave</Link></section></main>
      </AuthenticatedShell>
    );
  }

  if (isFixedDocument) {
    const fixedDocumentAncestors = fixedDocumentGenealogy?.nodes.filter((node) => node.position !== "root") ?? [];
    const fixedDocumentName = isGenealogyCertificate ? "certificado de genealogia" : "documento de procedência";
    const fixedDocumentNotice = isGenealogyCertificate
      ? "Emissão interna · não substitui registro oficial"
      : "Documento interno · não substitui registro SISPASS/IBAMA";

    return (
      <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
        <main className="document-wizard-page">
          <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Documentos</span></nav>
          <header className="document-wizard-header">
            <div><p className="eyebrow">Documentos internos</p><h1>{documentTitle}</h1><p>{isGenealogyCertificate ? "Revise a genealogia disponível, escolha um dos três modelos e gere um certificado interno em formato horizontal." : "Confira a origem registrada e gere um documento interno de procedência em formato horizontal."}</p></div>
            <Link className="document-wizard-back-link" href="/documentos">Voltar para documentos</Link>
          </header>

            <DocumentWizardProgress activeStep={progressStep} className={isGenealogyCertificate ? "document-wizard-progress-genealogy" : "document-wizard-progress-certificate"} onSelect={(index) => { if (index === 0) { setIsDocumentTypeStep(true); setNotice(undefined); return; } if (index < progressStep) { setNotice(undefined); setIsDocumentTypeStep(false); setStep(Math.max(0, index - 1) as WizardStep); } }} steps={steps} />

          {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

          <form className={`document-wizard-card${isGenealogyCertificate && step === 2 ? " document-wizard-card-model-step" : ""}`} onSubmit={handleSubmit}>
            {isDocumentTypeStep ? <DocumentTypeStep documentType={documentType} onChange={selectDocumentType} /> : <>
            {isGenealogyCertificate && step === 2 && <section aria-labelledby="titulo-etapa-documento-modelo"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de {steps.length}</p><h2 id="titulo-etapa-documento-modelo">Escolha o modelo</h2><p>Selecione o acabamento visual do certificado. O conteúdo genealógico permanece o mesmo.</p></div></div><div aria-label="Modelos do certificado de genealogia" className="document-wizard-option-grid document-wizard-certificate-model-grid" role="radiogroup">{genealogyModelOptions.map((option) => <label className={`document-wizard-choice-card document-wizard-certificate-model-choice${certificateModelId === option.id ? " is-selected" : ""}`} key={option.id}><input checked={certificateModelId === option.id} name="genealogy-certificate-model" onChange={() => setCertificateModelId(option.id)} type="radio" value={option.id} /><span className="document-wizard-choice-check" aria-hidden="true">{certificateModelId === option.id ? "✓" : ""}</span><span className={`document-wizard-certificate-model-preview document-wizard-certificate-model-preview-${option.id.toLowerCase()}`} aria-hidden="true"><i /><b /><small /></span><span><strong>{option.name}</strong><small>{option.description}</small></span></label>)}</div><div className="document-wizard-actions document-wizard-model-actions"><button className="settings-cancel-action" onClick={goBack} type="button">Anterior</button><span>Etapa 4 de {steps.length}</span><button className="auth-primary-action" type="submit">Continuar</button></div></section>}
            {step === 0 && (
              <section aria-labelledby="titulo-etapa-documento-ave">
                <div className="document-wizard-section-heading">
                  <div>
                    <p className="eyebrow">Etapa 2 de 6</p>
                    <h2 id="titulo-etapa-documento-ave">Escolha a ave</h2>
                    <p>Escolha uma ave para conferir se pode receber este documento, além dos pais e das informações disponíveis no criatório.</p>
                  </div>
                </div>
                <label className="document-wizard-search" htmlFor="buscar-ave-documento">
                  <span>Buscar por nome, anilha ou espécie</span>
                  <input id="buscar-ave-documento" onChange={(event) => setBirdSearch(event.target.value)} placeholder="Ex.: Canário ou 123456" value={birdSearch} />
                </label>
                <ul aria-label="Aves ativas disponíveis" className="document-wizard-bird-list" role="listbox">
                  {filteredBirds.map((bird) => <li key={bird.birdId}><button aria-selected={selectedBirdId === bird.birdId} className={selectedBirdId === bird.birdId ? "is-selected" : ""} onClick={() => selectBird(bird)} role="option" type="button"><span className="document-wizard-bird-icon" aria-hidden="true"><DashboardIcon name="bird" /></span><span className="document-wizard-bird-copy"><strong>{bird.name}</strong><span>{bird.speciesPopularName} · {sexLabel(bird.sex)}</span><span>{bird.ringNumber ? `Anilha ${bird.ringNumber} · ${formatDate(bird.birthDate)}` : "Identificação pendente · anilha necessária"}</span></span><span aria-hidden="true" className="document-wizard-selection-mark">{selectedBirdId === bird.birdId ? "✓" : bird.ringNumber ? "＋" : "!"}</span></button></li>)}
                </ul>
                {filteredBirds.length === 0 && <p className="document-wizard-inline-empty" role="status">Nenhuma ave corresponde à busca.</p>}
              </section>
            )}

            {step === 1 && (
              <section aria-labelledby="titulo-etapa-documento-elegibilidade">
                <div className="document-wizard-section-heading">
                  <div>
                    <p className="eyebrow">Etapa 3 de 6</p>
                    <h2 id="titulo-etapa-documento-elegibilidade">Confira se a ave pode receber este documento</h2>
                    <p>Antes de mostrar a prévia, conferimos se a ave atende às condições deste documento.</p>
                  </div>
                </div>
                {fixedDocumentState === "loading" && <div className="document-wizard-inline-state" role="status"><strong>Conferindo as informações da ave…</strong><span>Verificando os pais e os dados disponíveis no criatório.</span></div>}
                {fixedDocumentState === "error" && <div className="document-wizard-inline-state is-error" role="alert"><h3>Não foi possível conferir os dados da ave</h3><span>{fixedDocumentError}</span><button className="auth-secondary-action" onClick={() => void validateFixedDocument()} type="button">Tentar novamente</button></div>}
                {fixedDocumentState === "blocked" && <div className="document-wizard-inline-state is-error" role="alert"><h3>{isGenealogyCertificate ? "Certificado" : "Documento de procedência"} indisponível para esta ave</h3><span>Corrija os pontos abaixo para continuar.</span><ul className="document-wizard-issue-list">{fixedDocumentEligibility?.issues.map((issue) => <li key={issue.code}>{eligibilityIssueMessage(issue)}</li>)}</ul>{fixedDocumentEligibility?.issues.some((issue) => issue.code === "MissingRingNumber") && selectedBird && <Link className="auth-secondary-action" href={`/plantel/aves/${selectedBird.birdId}/editar`}>Editar dados da ave</Link>}</div>}
                {fixedDocumentState === "ready" && <div className="document-wizard-inline-state is-ready" role="status"><strong>{isGenealogyCertificate ? "Esta ave pode receber o certificado" : "Esta ave pode receber o documento de procedência"}</strong><span>{selectedBird?.name} pode seguir para a prévia. Os dados abaixo mostram somente as informações disponíveis no criatório.</span></div>}
              </section>
            )}

            {step === 2 && <section aria-labelledby="titulo-etapa-documento-previa"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de 6</p><h2 id="titulo-etapa-documento-previa">Confira a prévia</h2><p>Esta composição é fixa em formato horizontal e representa apenas os dados disponíveis no criatório.</p></div></div>{selectedBird && <DocumentPhotoFocusEditor focus={photoFocus} onChange={setPhotoFocus} onReset={() => setPhotoFocus({ x: 50, y: 50, zoom: 1 })}><div aria-label={`Prévia do ${fixedDocumentName} ${selectedBird.name}`} className={`document-wizard-certificate-preview${isProvenanceDocument ? " document-wizard-provenance-preview" : ""}`}><header><div><span aria-hidden="true">CV</span><small>Criatório Virtual</small></div><strong>{isGenealogyCertificate ? "Certificado de genealogia" : "Documento de procedência"}</strong><em>Documento interno</em></header><div className="document-wizard-certificate-identity"><div className="document-wizard-certificate-identity-main"><DocumentPhotoFocusFrame birdName={selectedBird.name} className="document-wizard-certificate-photo" focus={photoFocus} imageUrl={selectedBird.imageUrl} onChange={setPhotoFocus} /><div><p className="eyebrow">Ave selecionada</p><h3>{selectedBird.name}</h3><p>{selectedBird.speciesPopularName} · {sexLabel(selectedBird.sex)}</p></div></div><dl><div><dt>Anilha</dt><dd>{optionalValue(selectedBird.ringNumber)}</dd></div><div><dt>Nascimento</dt><dd>{selectedBird.birthDate ? formatDate(selectedBird.birthDate) : "Não informado"}</dd></div></dl></div><div className="document-wizard-certificate-farm"><h3>Dados do criatório</h3><dl><div><dt>Nome</dt><dd>{optionalValue(fixedDocumentFarm?.name ?? farmName)}</dd></div><div><dt>Responsável</dt><dd>{optionalValue(fixedDocumentFarm?.responsibleName)}</dd></div><div><dt>E-mail</dt><dd>{optionalValue(fixedDocumentFarm?.contactEmail)}</dd></div><div><dt>Telefone</dt><dd>{optionalValue(fixedDocumentFarm?.contactPhone)}</dd></div><div><dt>Registro oficial</dt><dd>{optionalValue(fixedDocumentFarm?.officialRegistrationNumber)}</dd></div></dl></div><div className="document-wizard-certificate-genealogy"><div className="document-wizard-section-heading"><div><h3>{isGenealogyCertificate ? "Estrutura genealógica" : "Pais e ancestrais registrados"}</h3><p>Somente dados disponíveis no criatório são apresentados.</p></div><span className="document-wizard-count">{fixedDocumentAncestors.length} ancestral{fixedDocumentAncestors.length === 1 ? "" : "es"}</span></div>{fixedDocumentAncestors.length > 0 ? <ol aria-label="Ancestrais disponíveis" className="document-wizard-genealogy-list">{fixedDocumentAncestors.map((node) => <li key={node.nodeKey}><div><strong>{optionalValue(node.name)}</strong><span>{genealogyPositionLabel(node.position)} · geração {node.generation}</span></div><small>{node.ringNumber ? `Anilha ${node.ringNumber} · ` : ""}{sexLabel(node.sex)} · {genealogySourceLabel(node)}</small></li>)}</ol> : <p className="document-wizard-inline-empty">{isGenealogyCertificate ? "Nenhum ancestral foi informado para esta ave." : "Nenhum pai ou ancestral foi informado para esta ave."}</p>}{fixedDocumentGenealogy?.isTruncated && <p className="document-wizard-genealogy-note" role="status">A árvore foi limitada a {fixedDocumentGenealogy.maxGenerations} gerações.</p>}</div>{isProvenanceDocument && <div className="document-wizard-provenance-details"><div><span>Data de emissão</span><strong>{formatIssueDate()}</strong></div><div className="document-wizard-provenance-signature"><span>Assinatura do responsável</span><strong>Espaço reservado para assinatura manual</strong></div></div>}<footer>{fixedDocumentNotice}</footer></div></DocumentPhotoFocusEditor>}</section>}

            {step === 3 && <section aria-labelledby="titulo-etapa-documento-revisao"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 5 de 6</p><h2 id="titulo-etapa-documento-revisao">Revise e gere</h2><p>O documento será armazenado de forma privada no criatório selecionado.</p></div></div><dl className="document-wizard-review"><div><dt>Ave</dt><dd>{selectedBird?.name}<small>{selectedBird?.speciesPopularName} · Anilha {optionalValue(selectedBird?.ringNumber)}</small><button onClick={() => setStep(0)} type="button">Alterar</button></dd></div><div><dt>Criatório</dt><dd>{optionalValue(fixedDocumentFarm?.name ?? farmName)}<small>Responsável: {optionalValue(fixedDocumentFarm?.responsibleName)}</small><button onClick={() => setStep(2)} type="button">Ver prévia</button></dd></div><div><dt>Formato</dt><dd>Formato horizontal<small>{isGenealogyCertificate ? "Certificado de genealogia" : "Documento de procedência"} · {fixedDocumentAncestors.length} ancestral{fixedDocumentAncestors.length === 1 ? "" : "es"}</small></dd></div></dl><p className="document-wizard-privacy-note"><span aria-hidden="true">✓</span> {isGenealogyCertificate ? "Documento interno, sem código genérico, e que não substitui registro oficial." : "Documento interno, sem código genérico, e que não substitui registro SISPASS/IBAMA."}</p></section>}

            {step === 4 && generated && <section aria-labelledby="titulo-etapa-documento-gerado" className="document-wizard-success"><span aria-hidden="true" className="document-wizard-success-icon">✓</span><p className="eyebrow">Documento pronto</p><h2 id="titulo-etapa-documento-gerado">{isGenealogyCertificate ? "Certificado gerado com sucesso" : "Documento de procedência gerado com sucesso"}</h2><p>{generated.fileName.replace(/\.pdf$/i, "")} foi salvo como documento privado de {selectedBird?.name}.</p><dl><div><dt>Formato</dt><dd>Formato horizontal</dd></div><div><dt>Páginas</dt><dd>{generated.pageCount}</dd></div><div><dt>Dimensões</dt><dd>{generated.widthMillimeters} × {generated.heightMillimeters} mm</dd></div></dl><p className="document-wizard-privacy-note"><span aria-hidden="true">✓</span> {isGenealogyCertificate ? "Este documento é interno e não substitui registro oficial." : "Este documento é interno e não substitui registro SISPASS/IBAMA."}</p><a className="auth-primary-action" href={getApiUrl(generated.downloadUrl)} rel="noreferrer" target="_blank">{isGenealogyCertificate ? "Baixar certificado" : "Baixar documento de procedência"}</a><button className="auth-secondary-action" onClick={resetWizard} type="button">{isGenealogyCertificate ? "Gerar outro certificado" : "Gerar outro documento"}</button></section>}

            {step < 4 && <div className="document-wizard-actions">{step === 0 ? <Link className="settings-cancel-action" href="/documentos">Voltar</Link> : <button className="settings-cancel-action" disabled={generationState === "loading" || fixedDocumentState === "loading"} onClick={goBack} type="button">Anterior</button>}<span>Etapa {step + 2} de {steps.length}</span>{step < 3 ? <button className="auth-primary-action" disabled={fixedDocumentState === "loading" || (fixedDocumentState !== "error" && !canContinue())} type="submit">{step === 1 && fixedDocumentState === "error" ? "Tentar validação" : "Continuar"}</button> : <button className="auth-primary-action" disabled={generationState === "loading" || !canContinue()} type="submit">{generationState === "loading" ? "Gerando…" : isGenealogyCertificate ? "Gerar certificado" : "Gerar documento"}</button>}</div>}
            </>}
            {isDocumentTypeStep && <div className="document-wizard-actions"><Link className="settings-cancel-action" href="/documentos">Cancelar</Link><span>Etapa 1 de {steps.length}</span><button className="auth-primary-action" onClick={goNext} type="button">Continuar</button></div>}
          </form>
        </main>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell activeNav="documents" email={session.email} farmName={farmName}>
      <main className="document-wizard-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Documentos</span></nav>
        <header className="document-wizard-header">
          <div><h1>{documentTitle}</h1><p>Monte um crachá privado da ave em poucos passos, com campos e tamanho adequados ao uso.</p></div>
          <Link className="document-wizard-back-link" href="/documentos">Voltar para documentos</Link>
        </header>

          <DocumentWizardProgress activeStep={progressStep} className="document-wizard-progress-badge" onSelect={(index) => { if (index === 0) { setIsDocumentTypeStep(true); setNotice(undefined); return; } if (index < progressStep) { setNotice(undefined); setIsDocumentTypeStep(false); setStep(Math.max(0, index - 1) as WizardStep); } }} steps={steps} />

        {notice && <p className={`document-wizard-notice document-wizard-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

        <form className="document-wizard-card" onSubmit={handleSubmit}>
          {isDocumentTypeStep ? <DocumentTypeStep documentType={documentType} onChange={selectDocumentType} /> : <>
          {step === 0 && <section aria-labelledby="titulo-etapa-ave"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 2 de {steps.length}</p><h2 id="titulo-etapa-ave">Escolha a ave</h2><p>Somente aves ativas com anilha podem receber um crachá.</p></div></div><label className="document-wizard-search" htmlFor="buscar-ave"><span>Buscar por nome, anilha ou espécie</span><input id="buscar-ave" onChange={(event) => setBirdSearch(event.target.value)} placeholder="Ex.: Canário ou 123456" value={birdSearch} /></label><ul aria-label="Aves ativas disponíveis" className="document-wizard-bird-list" role="listbox">{filteredBirds.map((bird) => <li key={bird.birdId}><button aria-selected={selectedBirdId === bird.birdId} className={selectedBirdId === bird.birdId ? "is-selected" : ""} disabled={!bird.ringNumber} onClick={() => selectBird(bird)} role="option" type="button"><span className="document-wizard-bird-icon" aria-hidden="true"><DashboardIcon name="bird" /></span><span className="document-wizard-bird-copy"><strong>{bird.name}</strong><span>{bird.speciesPopularName} · {sexLabel(bird.sex)}</span><span>{bird.ringNumber ? `Anilha ${bird.ringNumber} · ${formatDate(bird.birthDate)}` : "Identificação pendente · anilha necessária"}</span></span><span aria-hidden="true" className="document-wizard-selection-mark">{selectedBirdId === bird.birdId ? "✓" : bird.ringNumber ? "＋" : "!"}</span></button></li>)}</ul>{filteredBirds.length === 0 && <p className="document-wizard-inline-empty" role="status">Nenhuma ave corresponde à busca.</p>}</section>}

          {step === 1 && <section aria-labelledby="titulo-etapa-modelo"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 3 de {steps.length}</p><h2 id="titulo-etapa-modelo">Escolha o modelo</h2><p>O modelo define a hierarquia visual do crachá, sem alterar os dados da ave.</p></div></div><div aria-label="Modelos de crachá" className="document-wizard-option-grid" role="radiogroup">{modelOptions.map((option) => <label className={`document-wizard-choice-card${modelId === option.id ? " is-selected" : ""}`} key={option.id}><input checked={modelId === option.id} name="badge-model" onChange={() => setModelId(option.id)} type="radio" value={option.id} /><span className="document-wizard-choice-check" aria-hidden="true">{modelId === option.id ? "✓" : ""}</span><span className={`document-wizard-mini-badge document-wizard-mini-badge-${option.id.toLowerCase()}`} aria-hidden="true"><strong>{selectedBird?.name ?? "Sua ave"}</strong><small>{selectedBird?.ringNumber ? `#${selectedBird.ringNumber}` : "Crachá"}</small></span><span><strong>{option.name}</strong><small>{option.description}</small></span></label>)}</div></section>}

          {step === 2 && <section aria-labelledby="titulo-etapa-campos"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 4 de {steps.length}</p><h2 id="titulo-etapa-campos">Selecione os campos</h2><p>Escolha as informações autorizadas que aparecerão no crachá.</p></div><span className="document-wizard-count">{selectedFields.length} selecionado{selectedFields.length === 1 ? "" : "s"}</span></div><div aria-label="Campos permitidos no crachá" className="document-wizard-field-grid">{fieldOptions.map((field) => <label className={`document-wizard-field-choice${selectedFields.includes(field.id) ? " is-selected" : ""}`} key={field.id}><input checked={selectedFields.includes(field.id)} onChange={() => toggleField(field.id)} type="checkbox" /><span className="document-wizard-checkbox" aria-hidden="true">{selectedFields.includes(field.id) ? "✓" : ""}</span><span><strong>{field.name}</strong><small>{field.description}</small></span></label>)}</div>{selectedFields.length === 0 && <p className="document-wizard-field-error" role="alert">Selecione pelo menos um campo para continuar.</p>}</section>}

          {step === 3 && <section aria-labelledby="titulo-etapa-tamanho"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 5 de {steps.length}</p><h2 id="titulo-etapa-tamanho">Escolha o tamanho</h2><p>Todos os tamanhos são horizontais e seguem o padrão do crachá.</p></div></div><div aria-label="Tamanhos do crachá" className="document-wizard-size-grid" role="radiogroup">{sizeOptions.map((option) => <label className={`document-wizard-size-choice${printSize === option.id ? " is-selected" : ""}`} key={option.id}><input checked={printSize === option.id} name="badge-size" onChange={() => setPrintSize(option.id)} type="radio" value={option.id} /><span className={`document-wizard-size-preview document-wizard-size-${option.id.toLowerCase()}`} aria-hidden="true" /><span><strong>{option.name}</strong><small>{option.dimensions}</small><small>{option.description}</small></span></label>)}</div></section>}

            {step === 4 && <section aria-labelledby="titulo-etapa-previa"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 6 de {steps.length}</p><h2 id="titulo-etapa-previa">Confira a prévia</h2><p>Veja a hierarquia dos dados antes de revisar e gerar o arquivo.</p></div></div>{selectedBird && <DocumentPhotoFocusEditor focus={photoFocus} onChange={setPhotoFocus} onReset={() => setPhotoFocus({ x: 50, y: 50, zoom: 1 })}><div aria-label={`Prévia do crachá ${selectedBird.name}`} className={`document-wizard-preview document-wizard-preview-${printSize.toLowerCase()}`}><div className="document-wizard-preview-brand"><span aria-hidden="true">CV</span><small>Criatório Virtual</small></div><div className="document-wizard-preview-body"><DocumentPhotoFocusFrame birdName={selectedBird.name} className="document-wizard-preview-photo" focus={photoFocus} imageUrl={selectedBird.imageUrl} onChange={setPhotoFocus} /><div><h3>{selectedBird.name}</h3><p>{selectedBird.speciesPopularName} · {sexLabel(selectedBird.sex)}</p><div className="document-wizard-preview-fields">{selectedFields.map((field) => <span key={field}>{fieldLabel(field)}{field === "RingNumber" && selectedBird.ringNumber ? ` · ${selectedBird.ringNumber}` : ""}</span>)}</div></div></div><div className="document-wizard-preview-footer"><span>{modelLabel(modelId)}</span><span>{sizeLabel(printSize)}</span></div></div></DocumentPhotoFocusEditor>}</section>}

          {step === 5 && <section aria-labelledby="titulo-etapa-revisao"><div className="document-wizard-section-heading"><div><p className="eyebrow">Etapa 7 de {steps.length}</p><h2 id="titulo-etapa-revisao">Revise e gere</h2><p>O documento será armazenado de forma privada no criatório selecionado.</p></div></div><dl className="document-wizard-review"><div><dt>Ave</dt><dd>{selectedBird?.name}<small>{selectedBird?.speciesPopularName} · Anilha {selectedBird?.ringNumber}</small><button onClick={() => setStep(0)} type="button">Alterar</button></dd></div><div><dt>Modelo</dt><dd>{modelLabel(modelId)}<button onClick={() => setStep(1)} type="button">Alterar</button></dd></div><div><dt>Campos</dt><dd>{selectedFields.map(fieldLabel).join(", ")}<button onClick={() => setStep(2)} type="button">Alterar</button></dd></div><div><dt>Tamanho</dt><dd>{sizeLabel(printSize)}<button onClick={() => setStep(3)} type="button">Alterar</button></dd></div></dl><p className="document-wizard-privacy-note"><span aria-hidden="true">✓</span> O crachá não cria um código genérico e não substitui registros oficiais.</p></section>}

          {step === 6 && generated && <section aria-labelledby="titulo-etapa-gerada" className="document-wizard-success"><span aria-hidden="true" className="document-wizard-success-icon">✓</span><p className="eyebrow">Documento pronto</p><h2 id="titulo-etapa-gerada">Crachá gerado com sucesso</h2><p>{generated.fileName.replace(/\.pdf$/i, "")} foi salvo como documento privado de {selectedBird?.name}.</p><dl><div><dt>Modelo</dt><dd>{modelLabel(generated.modelId ?? "Classic")}</dd></div><div><dt>Tamanho</dt><dd>{sizeLabel(generated.printSize ?? "Medium")}</dd></div><div><dt>Dimensões</dt><dd>{generated.widthMillimeters} × {generated.heightMillimeters} mm</dd></div></dl><a className="auth-primary-action" href={getApiUrl(generated.downloadUrl)} rel="noreferrer" target="_blank">Baixar crachá</a><button className="auth-secondary-action" onClick={resetWizard} type="button">Gerar outro crachá</button></section>}

          {step < 6 && <div className="document-wizard-actions">{step === 0 ? <Link className="settings-cancel-action" href="/documentos">Voltar</Link> : <button className="settings-cancel-action" disabled={generationState === "loading"} onClick={goBack} type="button">Anterior</button>}<span>Etapa {step + 2} de {steps.length}</span>{step < 5 ? <button className="auth-primary-action" disabled={!canContinue()} type="submit">Continuar</button> : <button className="auth-primary-action" disabled={generationState === "loading" || !canContinue()} type="submit">{generationState === "loading" ? "Gerando…" : "Gerar crachá"}</button>}</div>}
          </>}
          {isDocumentTypeStep && <div className="document-wizard-actions"><Link className="settings-cancel-action" href="/documentos">Cancelar</Link><span>Etapa 1 de {steps.length}</span><button className="auth-primary-action" onClick={goNext} type="button">Continuar</button></div>}
        </form>
      </main>
    </AuthenticatedShell>
  );
}

export default function DocumentsPage() {
  const pathname = usePathname();
  return <AuthProvider><DocumentsWizard initialView={pathname === "/documentos/novo" ? "generate" : "history"} /></AuthProvider>;
}
