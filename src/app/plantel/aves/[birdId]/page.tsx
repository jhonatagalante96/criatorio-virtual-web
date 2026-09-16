"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../lib/http/api-client";
import { AppLoadingState } from "../../../components/app-loading-state";
import { BrandLockup, BrandPanel } from "../../../components/brand";
import { AuthenticatedShell } from "../../../components/authenticated-shell";
import { DashboardIcon } from "../../../components/dashboard-icons";
import { resolveBirdImageUrl } from "../bird-image";
import { BirdStatusAction, type BirdStatus, type BirdStatusResponse } from "../bird-status-action";
import {
  ExternalAncestorEditor,
  type ExistingGenealogyParent,
  type ExternalParentPosition,
  type ParentOption,
  type ParentLinkInput
} from "./external-ancestor-editor";

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

type BirdSex = "Female" | "Male" | "Unknown";
type DetailState = "error" | "loading" | "ready";
type EligibilityState = "blocked" | "error" | "loading" | "ready";
type FarmState = "blocked" | "error" | "loading" | "ready";
type GenealogyState = "error" | "loading" | "ready";

const DEFAULT_GENEALOGY_GENERATIONS = 3;
const GENEALOGY_DEPTH_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;

interface BirdParent {
  birdId: string;
  birthDate: string | null;
  name: string;
  ringNumber: string | null;
  sex: BirdSex;
  status: BirdStatus;
}

interface BirdDetailsResponse {
  ageInYears: number | null;
  birthDate: string | null;
  birdId: string;
  breedingFarmId: string;
  createdAtUtc: string;
  deathDate: string | null;
  externalFatherName: string | null;
  externalFatherSex: BirdSex | null;
  externalMotherName: string | null;
  externalMotherSex: BirdSex | null;
  father: BirdParent | null;
  fatherBirdId: string | null;
  genealogyRootId: string | null;
  identificationPending: boolean;
  imageUrl?: string | null;
  isDefaultImage?: boolean;
  mother: BirdParent | null;
  motherBirdId: string | null;
  name: string;
  notes: string | null;
  ringNumber: string | null;
  sex: BirdSex;
  speciesId: string;
  speciesPopularName: string;
  speciesScientificName: string;
  status: BirdStatus;
  updatedAtUtc: string;
}

interface BirdGenealogyUpdateResponse {
  externalFatherName: string | null;
  externalFatherSex: BirdSex | null;
  externalMotherName: string | null;
  externalMotherSex: BirdSex | null;
  fatherBirdId: string | null;
  motherBirdId: string | null;
  updatedAtUtc: string;
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
  canEdit: boolean;
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
  status: BirdStatus | null;
}

interface BirdGenealogyResponse {
  edges: BirdGenealogyEdge[];
  isTruncated: boolean;
  maxGenerations: number;
  nodes: BirdGenealogyNode[];
  rootBirdId: string;
}

interface BirdGenealogyEdge {
  childNodeKey: string;
  parentNodeKey: string;
  position: string;
}

type EditingGenealogyTarget =
  | { ancestor: BirdGenealogyNode; kind: "external"; ancestorId: string }
  | { ancestor: BirdGenealogyNode; kind: "root" };

const statusLabels: Record<BirdStatus, string> = {
  Active: "Ativa",
  Archived: "Arquivada",
  Deceased: "Falecida",
  Escaped: "Escapada",
  Transferred: "Transferida"
};

function sexLabel(sex: BirdSex | null): string {
  if (sex === "Female") return "Fêmea";
  if (sex === "Male") return "Macho";
  return "Não identificado";
}

function statusLabel(status: BirdStatus | null): string {
  return status ? statusLabels[status] : "Não informado";
}

function statusNotice(status: BirdStatus): string | undefined {
  if (status === "Archived") return "Esta ave está arquivada e permanece disponível para consulta histórica.";
  if (status === "Deceased") return "Esta ave está marcada como falecida. A ficha permanece disponível para consulta histórica.";
  if (status === "Escaped") return "Esta ave está marcada como escapada. A ficha permanece disponível para consulta histórica.";
  if (status === "Transferred") return "Esta ave está com uma transferência pendente. Alterações cadastrais e de situação ficam bloqueadas até o fluxo terminar.";
  return undefined;
}

function eligibilityIssueTitle(code: string): string {
  if (code === "MissingRingNumber") return "Anilha não informada";
  if (code === "InactiveStatus") return "Ave inativa";
  return "Pendência de elegibilidade";
}

function eligibilityIssueMessage(issue: BirdEligibilityIssue): string {
  if (issue.code === "MissingRingNumber") return "Informe uma anilha válida de seis dígitos para liberar as ações que exigem identificação.";
  if (issue.code === "InactiveStatus") return "A ave precisa estar ativa para esta ação.";
  return issue.message.trim() || "Não foram informados detalhes adicionais para esta pendência.";
}

function formatDate(value: string | null): string {
  if (!value) return "Não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Não informado" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function genealogyPositionLabel(position: string): string {
  if (position === "father") return "Pai";
  if (position === "mother") return "Mãe";
  if (position === "root") return "Ave consultada";
  return "Ancestral";
}

function genealogyRelationshipLabel(
  node: BirdGenealogyNode,
  position: string,
  lineagePosition?: "father" | "mother"
): string {
  if (node.generation === 0) return "Ave consultada";
  if (node.generation === 1) return genealogyPositionLabel(position);

  const ancestorTerms: Record<number, { feminine: string; masculine: string }> = {
    2: { feminine: "Avó", masculine: "Avô" },
    3: { feminine: "Bisavó", masculine: "Bisavô" },
    4: { feminine: "Trisavó", masculine: "Trisavô" },
    5: { feminine: "Tetravó", masculine: "Tetravô" },
    6: { feminine: "Pentavó", masculine: "Pentavô" }
  };
  const branchSide = lineagePosition === "father" ? "paterno" : lineagePosition === "mother" ? "materno" : undefined;
  const degree = ancestorTerms[node.generation];

  if (!degree) {
    const branch = branchSide ? ` no ramo ${branchSide}` : "";
    return `Ancestral de ${node.generation}ª geração${branch}`;
  }

  if (node.sex === "Male") return `${degree.masculine}${branchSide ? ` ${branchSide}` : ""}`;
  if (node.sex === "Female") {
    const feminineBranchSide = lineagePosition === "father" ? "paterna" : lineagePosition === "mother" ? "materna" : undefined;
    return `${degree.feminine}${feminineBranchSide ? ` ${feminineBranchSide}` : ""}`;
  }
  return `Ancestral de ${node.generation}ª geração${branchSide ? ` no ramo ${branchSide}` : ""}`;
}

function genealogyPositionOrder(position: string): number {
  if (position === "father") return 0;
  if (position === "mother") return 1;
  return 2;
}

function genealogySourceLabel(node: BirdGenealogyNode): string {
  if (node.source === "External") return "Ancestral externo · sem cadastro";
  if (!node.isAccessible) return "Registro preservado · acesso restrito";
  if (node.isSnapshot) return "Registro preservado · disponível para consulta";
  return "Ave cadastrada no criatório";
}

function genealogyNodeSummary(node: BirdGenealogyNode): string {
  return [
    `geração ${node.generation}`,
    sexLabel(node.sex),
    node.ringNumber ? `anilha ${node.ringNumber}` : undefined
  ].filter(Boolean).join(" · ");
}

function genealogyRequestErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório para consultar a árvore genealógica.";
  if (error instanceof ApiError && error.status === 404) return "A árvore genealógica não está disponível para o criatório selecionado.";
  return "Verifique sua conexão e tente novamente.";
}

function externalAncestorIdFromNodeKey(nodeKey: string): string | undefined {
  return /^external:([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(nodeKey)?.[1];
}

function readBirdIdFromPathname(): string {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

function DetailStateView({
  actionHref = "/plantel/aves",
  actionLabel = "Voltar para o plantel",
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente"
}: Readonly<{
  actionHref?: string;
  actionLabel?: string;
  heading: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="auth-page onboarding-page bird-detail-page">
      <a className="skip-link" href="#conteudo-ficha-ave">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell bird-detail-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-estado-ficha-ave" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-ficha-ave">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-estado-ficha-ave" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <Link className="text-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthenticatedDetailState({
  email,
  farmName,
  heading,
  message,
  onRetry,
  actionHref = "/plantel/aves",
  actionLabel = "Voltar para o plantel",
  retryLabel = "Tentar novamente"
}: Readonly<{
  actionHref?: string;
  actionLabel?: string;
  email: string;
  farmName: string;
  heading: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <AuthenticatedShell activeNav="birds" email={email} farmName={farmName}>
      <div className="bird-detail-view">
        <div className="bird-detail-state" id="conteudo-ficha-ave">
          <h1 id="titulo-estado-ficha-ave" ref={headingRef} tabIndex={-1}>{heading}</h1>
          <p>{message}</p>
          <div className="bird-detail-state-actions">
            {onRetry && <button className="auth-primary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <Link className="auth-secondary-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </div>
      </div>
    </AuthenticatedShell>
  );
}

function DetailLayout({ children, email, farmName }: Readonly<{ children: React.ReactNode; email: string; farmName: string }>) {
  return (
    <AuthenticatedShell activeNav="birds" email={email} farmName={farmName}>
      <div className="bird-detail-view" id="conteudo-ficha-ave">
        {children}
      </div>
    </AuthenticatedShell>
  );
}

function LoadingSection({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-busy="true" aria-live="polite" className="bird-detail-substate" role="status">
      <span className="bird-loading-dot" aria-hidden="true" />
      <span>Carregando {label.toLowerCase()}…</span>
    </div>
  );
}

function EmptySection({ message }: Readonly<{ message: string }>) {
  return <p className="bird-detail-empty">{message}</p>;
}

function ParentCard({
  externalName,
  externalSex,
  label,
  parent
}: Readonly<{
  externalName: string | null;
  externalSex: BirdSex | null;
  label: string;
  parent: BirdParent | null;
}>) {
  if (parent) {
    return (
      <div className="bird-parent-card">
        <span className="bird-detail-label">{label}</span>
        <Link href={`/plantel/aves/${parent.birdId}`}>
          <strong>{parent.name}</strong>
          <span>{sexLabel(parent.sex)} · {statusLabel(parent.status)}</span>
        </Link>
        <small>{parent.ringNumber ? `Anilha ${parent.ringNumber}` : "Anilha não informada"}{parent.birthDate ? ` · Nascimento ${formatDate(parent.birthDate)}` : ""}</small>
      </div>
    );
  }

  if (externalName) {
    return (
      <div className="bird-parent-card is-external">
        <span className="bird-detail-label">{label}</span>
        <strong>{externalName}</strong>
        <span>{sexLabel(externalSex)} · ancestral externo</span>
      </div>
    );
  }

  return (
    <div className="bird-parent-card is-empty">
      <span className="bird-detail-label">{label}</span>
      <strong>Não informado</strong>
      <span>Este ancestral ainda não foi registrado.</span>
    </div>
  );
}

function GenealogyNodeCard({
  hasParents,
  showAscendancyMissing,
  hasMissingRootParents,
  node,
  relationshipLabel,
  onEdit
}: Readonly<{
  hasParents: boolean;
  showAscendancyMissing: boolean;
  hasMissingRootParents: boolean;
  node: BirdGenealogyNode;
  relationshipLabel: string;
  onEdit?: (node: BirdGenealogyNode) => void;
}>) {
  const isNavigable = node.generation > 0 && node.canNavigate && node.isAccessible && Boolean(node.birdId);
  const canEditRoot = node.generation === 0 && hasMissingRootParents && Boolean(onEdit);
  const canEditExternal = node.source === "External" && node.canEdit && Boolean(externalAncestorIdFromNodeKey(node.nodeKey)) && Boolean(onEdit) && (hasParents || showAscendancyMissing);
  const canEdit = canEditRoot || canEditExternal;
  const editActionLabel = node.generation === 0
    ? hasParents ? "Completar ascendência" : "Adicionar ascendência"
    : hasParents ? "Editar ascendência" : "Adicionar ascendência";
  const className = [
    "bird-genealogy-node",
    node.generation === 0 ? "is-root" : "",
    node.source === "Private" ? "is-private" : "",
    node.source === "Snapshot" ? "is-snapshot" : "",
    node.source === "External" ? "is-external" : "",
    isNavigable ? "is-navigable" : "",
    !node.isAccessible ? "is-restricted" : ""
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <span className="bird-genealogy-node-position">{relationshipLabel}</span>
      <strong>{node.name}</strong>
      <span>{genealogySourceLabel(node)}</span>
      <small>{genealogyNodeSummary(node)}</small>
    </>
  );

  if (isNavigable && node.birdId) {
    return <Link aria-label={`${node.name}, ${relationshipLabel}, ${genealogyNodeSummary(node)}, abrir ficha`} className={className} href={`/plantel/aves/${encodeURIComponent(node.birdId)}`}>{content}</Link>;
  }

  return (
    <div aria-label={`${node.name}, ${relationshipLabel}, ${genealogyNodeSummary(node)}`} className={className}>
      {content}
      {showAscendancyMissing && <p className="bird-genealogy-node-guidance">Ascendência ainda não informada</p>}
      {canEdit && onEdit && (
        <button className="bird-genealogy-edit-action" onClick={() => onEdit(node)} type="button">
          {editActionLabel}
        </button>
      )}
    </div>
  );
}

function GenealogyBranch({
  nodeKey,
  relationshipPosition,
  lineagePosition,
  nodesByKey,
  onEdit,
  rootHasParents,
  rootHasMissingParents,
  onBranchToggle,
  expandedBranches,
  parentsByChild,
  maxGenerations,
  isTruncated,
  visited
}: Readonly<{
  nodeKey: string;
  relationshipPosition: string;
  lineagePosition?: "father" | "mother";
  nodesByKey: ReadonlyMap<string, BirdGenealogyNode>;
  onEdit?: (node: BirdGenealogyNode) => void;
  rootHasParents: boolean;
  rootHasMissingParents: boolean;
  onBranchToggle: (nodeKey: string, expanded: boolean) => void;
  expandedBranches: Readonly<Record<string, boolean>>;
  parentsByChild: ReadonlyMap<string, BirdGenealogyEdge[]>;
  maxGenerations: number;
  isTruncated: boolean;
  visited: ReadonlySet<string>;
}>) {
  const node = nodesByKey.get(nodeKey);
  if (!node || visited.has(nodeKey)) return null;

  const nextVisited = new Set(visited);
  nextVisited.add(nodeKey);
  const parents = (parentsByChild.get(nodeKey) ?? [])
    .filter((edge) => !nextVisited.has(edge.parentNodeKey) && nodesByKey.has(edge.parentNodeKey))
    .sort((left, right) => genealogyPositionOrder(left.position) - genealogyPositionOrder(right.position));
  const isExpanded = expandedBranches[nodeKey] ?? node.generation < 2;
  const relationshipLabel = genealogyRelationshipLabel(node, relationshipPosition, lineagePosition);

  return (
    <li className="bird-genealogy-branch">
      <GenealogyNodeCard
        hasMissingRootParents={rootHasMissingParents}
        hasParents={node.generation === 0 ? rootHasParents : parents.length > 0}
        node={node}
        onEdit={onEdit}
        relationshipLabel={relationshipLabel}
        showAscendancyMissing={node.source === "External" && parents.length === 0 && (node.generation < maxGenerations || !isTruncated)}
      />
      {parents.length > 0 && (
        <details
          className="bird-genealogy-branch-expansion"
          onToggle={(event) => onBranchToggle(nodeKey, event.currentTarget.open)}
          open={isExpanded}
        >
          <summary aria-label={`${isExpanded ? "Recolher" : "Expandir"} pais de ${node.name}`} className="bird-genealogy-expand-action">
            {isExpanded ? "Ascendência aberta" : "Ver ascendência"} ({parents.length})
          </summary>
          <ul aria-label={`Pais de ${node.name}`} className="bird-genealogy-children">
            {parents.map((edge) => (
              <GenealogyBranch
                key={`${edge.parentNodeKey}-${edge.position}`}
                expandedBranches={expandedBranches}
                nodeKey={edge.parentNodeKey}
                nodesByKey={nodesByKey}
                onBranchToggle={onBranchToggle}
                onEdit={onEdit}
                parentsByChild={parentsByChild}
                rootHasMissingParents={rootHasMissingParents}
                rootHasParents={rootHasParents}
                relationshipPosition={edge.position}
                maxGenerations={maxGenerations}
                isTruncated={isTruncated}
                lineagePosition={node.generation === 0
                  ? edge.position === "father" || edge.position === "mother" ? edge.position : undefined
                  : lineagePosition}
                visited={nextVisited}
              />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function GenealogyNodes({
  birdId,
  client,
  genealogy,
  rootBird,
  onMutationComplete,
  onBranchToggle,
  onSave,
  onSaveRoot,
  onSessionExpired,
  onUnlink,
  onUnlinkRoot,
  expandedBranches,
  scrollPosition
}: Readonly<{
  birdId: string;
  client: ApiClient;
  genealogy: BirdGenealogyResponse;
  rootBird: BirdDetailsResponse;
  onMutationComplete: () => void;
  onBranchToggle: (nodeKey: string, expanded: boolean) => void;
  onSave: (ancestorId: string, position: ExternalParentPosition, parent: ParentLinkInput) => Promise<void>;
  onSaveRoot: (position: ExternalParentPosition, parent: ParentLinkInput, selectedParent?: ParentOption) => Promise<void>;
  onSessionExpired: () => Promise<boolean>;
  onUnlink: (ancestorId: string, position: ExternalParentPosition) => Promise<void>;
  onUnlinkRoot: (position: ExternalParentPosition) => Promise<void>;
  expandedBranches: Readonly<Record<string, boolean>>;
  scrollPosition: React.MutableRefObject<number | null>;
}>) {
  const [editingAncestor, setEditingAncestor] = useState<EditingGenealogyTarget>();
  const graphRef = useRef<HTMLDivElement>(null);
  const nodesByKey = new Map(genealogy.nodes.map((node) => [node.nodeKey, node]));
  const parentsByChild = new Map<string, BirdGenealogyEdge[]>();
  for (const edge of genealogy.edges) {
    const parents = parentsByChild.get(edge.childNodeKey) ?? [];
    parents.push(edge);
    parentsByChild.set(edge.childNodeKey, parents);
  }

  const root = genealogy.nodes.find((node) => node.birdId === genealogy.rootBirdId && node.generation === 0)
    ?? genealogy.nodes.find((node) => node.generation === 0);
  const ancestors = genealogy.nodes.filter((node) => node.generation > 0);
  const rootParents: Partial<Record<ExternalParentPosition, ExistingGenealogyParent>> = {};
  if (rootBird.fatherBirdId) {
    rootParents.father = {
      birdId: rootBird.fatherBirdId,
      name: rootBird.father?.name ?? "Ave cadastrada",
      ringNumber: rootBird.father?.ringNumber ?? null,
      source: "Private"
    };
  } else if (rootBird.externalFatherName?.trim()) {
    rootParents.father = { birdId: null, name: rootBird.externalFatherName.trim(), ringNumber: null, source: "External" };
  }
  if (rootBird.motherBirdId) {
    rootParents.mother = {
      birdId: rootBird.motherBirdId,
      name: rootBird.mother?.name ?? "Ave cadastrada",
      ringNumber: rootBird.mother?.ringNumber ?? null,
      source: "Private"
    };
  } else if (rootBird.externalMotherName?.trim()) {
    rootParents.mother = { birdId: null, name: rootBird.externalMotherName.trim(), ringNumber: null, source: "External" };
  }
  const missingRootPositions = (["father", "mother"] as const).filter((position) => !rootParents[position]);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    if (scrollPosition.current !== null) {
      graph.scrollLeft = scrollPosition.current;
      return;
    }

    const rootCard = graph.querySelector<HTMLElement>(".bird-genealogy-node.is-root");
    if (!rootCard) return;
    const graphBounds = graph.getBoundingClientRect();
    const rootBounds = rootCard.getBoundingClientRect();
    graph.scrollLeft += rootBounds.left - graphBounds.left - (graph.clientWidth - rootCard.clientWidth) / 2;
  }, [genealogy, scrollPosition]);

  const openEditor = (node: BirdGenealogyNode) => {
    if (node.generation === 0 && node.birdId === genealogy.rootBirdId) {
      if (missingRootPositions.length > 0) setEditingAncestor({ ancestor: node, kind: "root" });
      return;
    }
    const ancestorId = externalAncestorIdFromNodeKey(node.nodeKey);
    if (!node.canEdit || node.source !== "External" || !ancestorId) return;
    setEditingAncestor({ ancestor: node, ancestorId, kind: "external" });
  };

  let currentParents: Partial<Record<ExternalParentPosition, ExistingGenealogyParent>> = {};
  let availablePositions: ExternalParentPosition[] | undefined;
  if (editingAncestor?.kind === "external") {
    currentParents = (parentsByChild.get(editingAncestor.ancestor.nodeKey) ?? []).reduce((result, edge) => {
      if (edge.position !== "father" && edge.position !== "mother") return result;
      const parent = nodesByKey.get(edge.parentNodeKey);
      if (parent) result[edge.position] = {
        birdId: parent.birdId,
        name: parent.name,
        ringNumber: parent.ringNumber,
        source: parent.source
      };
      return result;
    }, {} as Partial<Record<ExternalParentPosition, ExistingGenealogyParent>>);
  } else if (editingAncestor?.kind === "root") {
    availablePositions = missingRootPositions;
  }

  if (!root) {
    return <EmptySection message="Não foi possível identificar a ave raiz desta árvore." />;
  }

  return (
    <>
      <div
        aria-describedby="genealogy-tree-navigation-help"
        aria-label="Árvore genealógica"
        className="bird-genealogy-graph"
        onScroll={(event) => { scrollPosition.current = event.currentTarget.scrollLeft; }}
        ref={graphRef}
        role="region"
        tabIndex={0}
      >
        <ul className="bird-genealogy-root">
          <GenealogyBranch
            expandedBranches={expandedBranches}
            nodeKey={root.nodeKey}
            nodesByKey={nodesByKey}
            onBranchToggle={onBranchToggle}
            onEdit={openEditor}
            parentsByChild={parentsByChild}
            rootHasMissingParents={missingRootPositions.length > 0}
            rootHasParents={Boolean(rootParents.father || rootParents.mother)}
            relationshipPosition={root.position}
            maxGenerations={genealogy.maxGenerations}
            isTruncated={genealogy.isTruncated}
            visited={new Set()}
          />
        </ul>
      </div>
      {ancestors.length === 0 && <EmptySection message="Ainda não há outros ancestrais registrados para esta ave." />}
      <div aria-label="Legenda da árvore genealógica" className="bird-genealogy-legend">
        <span><i aria-hidden="true" className="is-private" />Ave do plantel · navegação conforme autorização</span>
        <span><i aria-hidden="true" className="is-snapshot" />Snapshot vinculado · dados preservados</span>
        <span><i aria-hidden="true" className="is-external" />Ancestral externo · sem cadastro no plantel</span>
      </div>
      {genealogy.isTruncated && <p className="bird-detail-help">A árvore foi limitada a {genealogy.maxGenerations} gerações para manter a consulta rápida.</p>}
      {editingAncestor && (
        <ExternalAncestorEditor
          ancestorName={editingAncestor.ancestor.name}
          availablePositions={availablePositions}
          client={client}
          currentParents={currentParents}
          onClose={() => setEditingAncestor(undefined)}
          onMutationComplete={onMutationComplete}
          onSave={(position, parent, selectedParent) => editingAncestor.kind === "root"
            ? onSaveRoot(position, parent, selectedParent)
            : onSave(editingAncestor.ancestorId, position, parent)}
          onSessionExpired={onSessionExpired}
          onUnlink={(position) => editingAncestor.kind === "root"
            ? onUnlinkRoot(position)
            : onUnlink(editingAncestor.ancestorId, position)}
        />
      )}
    </>
  );
}

function scrollToDetailSection(event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) {
  event.preventDefault();
  const section = document.getElementById(sectionId);
  if (!section) return;

  section.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${sectionId}`);
}

function BirdDetailTabs() {
  const tabs = [
    { href: "#visao-geral", label: "Visão geral" },
    { href: "#genealogia", label: "Genealogia" },
    { label: "Histórico" },
    { label: "Reproduções" },
    { label: "Transferências" },
    { label: "Competições" },
    { label: "Documentos" }
  ];

  return (
    <nav aria-label="Seções da ficha da ave" className="bird-detail-tabs">
      <ul>
        {tabs.map((tab, index) => (
          <li key={tab.label}>
            {tab.href
              ? <a aria-current={index === 0 ? "page" : undefined} href={tab.href} onClick={(event) => scrollToDetailSection(event, tab.href!.slice(1))}>{tab.label}</a>
              : <span aria-disabled="true" title="Seção em desenvolvimento">{tab.label}</span>}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BirdEligibilityPanel({
  birdId,
  error,
  eligibility,
  onRetry,
  state
}: Readonly<{
  birdId: string;
  error?: string;
  eligibility?: BirdEligibilityResponse;
  onRetry: () => void;
  state: EligibilityState;
}>) {
  return (
    <section aria-busy={state === "loading"} aria-label="Resultado da elegibilidade" aria-labelledby="titulo-elegibilidade-ave" aria-live="polite" className={`bird-eligibility-panel${state === "ready" && eligibility?.isEligible ? " is-eligible" : ""}`}>
      <div className="bird-eligibility-heading">
        <div>
          <p className="eyebrow">Verificação dos dados</p>
          <h2 id="titulo-elegibilidade-ave">Elegibilidade da ave</h2>
        </div>
        {state === "ready" && eligibility && <span className={`bird-eligibility-badge${eligibility.isEligible ? " is-eligible" : " is-pending"}`}>{eligibility.isEligible ? "Elegível" : "Requer atenção"}</span>}
      </div>

      {state === "loading" && <LoadingSection label="elegibilidade" />}

      {state === "error" && (
        <div className="bird-eligibility-feedback" role="alert">
          <strong>Não foi possível consultar a elegibilidade</strong>
          <p>{error ?? "Tente novamente para verificar as pendências da ave."}</p>
          <button className="text-action" onClick={onRetry} type="button">Tentar novamente</button>
        </div>
      )}

      {state === "blocked" && (
        <div className="bird-eligibility-feedback" role="alert">
          <strong>Elegibilidade indisponível</strong>
          <p>{error ?? "Não foi possível consultar a elegibilidade no criatório selecionado."}</p>
          <button className="text-action" onClick={onRetry} type="button">Tentar novamente</button>
        </div>
      )}

      {state === "ready" && eligibility?.isEligible && (
        <div className="bird-eligibility-summary">
          <span aria-hidden="true" className="bird-eligibility-mark">✓</span>
          <div>
            <strong>Nenhuma pendência encontrada</strong>
            <p>Não foram encontrados motivos de inelegibilidade para esta ave.</p>
          </div>
        </div>
      )}

      {state === "ready" && eligibility && !eligibility.isEligible && (
        <>
          <p className="bird-eligibility-intro">Resolva os itens abaixo para liberar as ações compatíveis com esta ave.</p>
          {eligibility.issues.length > 0 ? (
            <ul aria-label="Motivos de inelegibilidade" className="bird-eligibility-issues">
              {eligibility.issues.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>
                  <span aria-hidden="true" className="bird-eligibility-issue-mark">!</span>
                  <div>
                    <strong>{eligibilityIssueTitle(issue.code)}</strong>
                    <p>{eligibilityIssueMessage(issue)}</p>
                    {issue.code === "MissingRingNumber" && (
                      <Link className="bird-eligibility-action" href={`/plantel/aves/${encodeURIComponent(birdId)}/editar`}>Completar identificação</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bird-eligibility-feedback">Esta ave não está elegível, mas não foram informados os motivos.</p>
          )}
        </>
      )}
    </section>
  );
}

function BirdDetailActionMenu({
  bird,
  client,
  onSessionExpired,
  onStatusChanged,
  prepareStatusMutation
}: Readonly<{
  bird: BirdDetailsResponse;
  client: ApiClient;
  onSessionExpired: () => Promise<unknown> | void;
  onStatusChanged: (bird: BirdStatusResponse) => void;
  prepareStatusMutation: () => Promise<void>;
}>) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (menuRef.current?.open && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        menuRef.current.open = false;
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  return (
    <details className="bird-detail-action-menu" ref={menuRef}>
      <summary aria-label="Abrir mais ações">⋮</summary>
      <div className="bird-detail-action-menu-panel">
        <Link href={`/plantel/aves/${encodeURIComponent(bird.birdId)}/editar`}>Editar dados</Link>
        {bird.status === "Active" && (
          <BirdStatusAction
            birdBirthDate={bird.birthDate}
            birdId={bird.birdId}
            birdName={bird.name}
            client={client}
            label="Inativar"
            onSessionExpired={onSessionExpired}
            onUpdated={onStatusChanged}
            prepareMutation={prepareStatusMutation}
            variant="detail"
          />
        )}
        <button disabled title="Módulo em desenvolvimento" type="button">Iniciar transferência</button>
        <button disabled title="Módulo em desenvolvimento" type="button">Registrar competição</button>
        <button disabled title="Módulo em desenvolvimento" type="button">Baixar ficha</button>
      </div>
    </details>
  );
}

function BirdDetailPhoto({ bird }: Readonly<{ bird: BirdDetailsResponse }>) {
  const hasApiImage = Boolean(bird.imageUrl);
  const imageDescription = bird.isDefaultImage
    ? `Imagem padrão da espécie: ${bird.speciesPopularName}`
    : hasApiImage
      ? `Foto de perfil de ${bird.name}`
      : "Foto da ave não cadastrada";
  const imageCaption = bird.isDefaultImage
    ? "Imagem padrão da espécie · foto própria não cadastrada"
    : hasApiImage
      ? "Foto de perfil"
      : "Imagem ilustrativa · foto não cadastrada";

  return (
    <div aria-label={imageDescription} className="bird-detail-profile-photo" role="img">
      <img alt="" aria-hidden="true" src={resolveBirdImageUrl(bird.imageUrl)} />
      <span className={`bird-detail-photo-status bird-status-${bird.status.toLowerCase()}`}><span aria-hidden="true" />{statusLabel(bird.status)}</span>
      <span className="bird-detail-photo-caption">{imageCaption}</span>
    </div>
  );
}

function BirdDetailMedia({ bird }: Readonly<{ bird: BirdDetailsResponse }>) {
  return (
    <>
      <section aria-labelledby="titulo-fotos-ave" className="bird-detail-section bird-detail-media-card">
        <div className="bird-detail-section-heading">
          <div><p className="eyebrow">Galeria</p><h2 id="titulo-fotos-ave">Fotos</h2></div>
          <span className="bird-detail-section-action">Ver todas (0)</span>
        </div>
        <div className="bird-detail-empty-media">
          <DashboardIcon name="bird" />
          <p>Nenhuma foto cadastrada.</p>
          <span>A foto da ave aparecerá aqui quando for adicionada.</span>
        </div>
      </section>

      <section aria-labelledby="titulo-qr-ave" className="bird-detail-section bird-detail-qr-card">
        <div className="bird-detail-section-heading">
          <div><p className="eyebrow">Identificação</p><h2 id="titulo-qr-ave">Código de identificação da ave</h2></div>
        </div>
        <div className="bird-detail-qr-content">
          <div aria-label={`Código de identificação de ${bird.name} indisponível`} className="bird-detail-qr-placeholder">QR</div>
          <div>
            <p>O código de identificação estará disponível quando a geração de documentos for liberada.</p>
            <button disabled type="button">Baixar código de identificação</button>
          </div>
        </div>
      </section>
    </>
  );
}

function BirdQuickActions() {
  const actions = [
    { icon: "heart" as const, label: "Registrar reprodução" },
    { icon: "transfer" as const, label: "Iniciar transferência" },
    { icon: "trophy" as const, label: "Registrar competição" },
    { icon: "document" as const, label: "Baixar ficha" }
  ];

  return (
    <section aria-labelledby="titulo-acoes-ave" className="bird-detail-section bird-detail-quick-actions">
      <div className="bird-detail-section-heading">
        <div><p className="eyebrow">Atalhos</p><h2 id="titulo-acoes-ave">Ações rápidas</h2></div>
      </div>
      <ul>
        {actions.map((action) => (
          <li key={action.label}>
            <button disabled title="Módulo em desenvolvimento" type="button"><DashboardIcon name={action.icon} /><span>{action.label}</span></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BirdActivities({ bird }: Readonly<{ bird: BirdDetailsResponse }>) {
  const activities = [
    { date: bird.createdAtUtc, icon: "bird" as const, title: "Ave cadastrada no criatório" },
    ...(bird.updatedAtUtc !== bird.createdAtUtc ? [{ date: bird.updatedAtUtc, icon: "edit" as const, title: "Informações atualizadas" }] : [])
  ];

  return (
    <section aria-labelledby="titulo-atividades-ave" className="bird-detail-section bird-detail-activities-section">
      <div className="bird-detail-section-heading">
        <div><p className="eyebrow">Histórico da ficha</p><h2 id="titulo-atividades-ave">Últimas atividades</h2></div>
        <span className="bird-detail-section-action">Ver todas ({activities.length})</span>
      </div>
      <ol className="bird-detail-activities">
        {activities.map((activity) => (
          <li key={`${activity.title}-${activity.date}`}>
            <span aria-hidden="true" className="bird-detail-activity-icon"><DashboardIcon name={activity.icon} /></span>
            <strong>{activity.title}</strong>
            <span>por você</span>
            <time dateTime={activity.date}>{formatDateTime(activity.date)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BirdDetailPage() {
  const { refresh, session } = useAuth();
  const [birdId, setBirdId] = useState("");
  const [bird, setBird] = useState<BirdDetailsResponse>();
  const [detailError, setDetailError] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [eligibility, setEligibility] = useState<BirdEligibilityResponse>();
  const [eligibilityError, setEligibilityError] = useState<string>();
  const [eligibilityState, setEligibilityState] = useState<EligibilityState>("loading");
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [genealogy, setGenealogy] = useState<BirdGenealogyResponse>();
  const [genealogyError, setGenealogyError] = useState<string>();
  const [genealogyMaxGenerations, setGenealogyMaxGenerations] = useState(DEFAULT_GENEALOGY_GENERATIONS);
  const [genealogyState, setGenealogyState] = useState<GenealogyState>("loading");
  const [expandedGenealogyBranches, setExpandedGenealogyBranches] = useState<Record<string, boolean>>({});
  const [reloadVersion, setReloadVersion] = useState(0);
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);
  const genealogyRequestVersion = useRef(0);
  const genealogyScrollPosition = useRef<number | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const prepareStatusMutation = useCallback(async () => {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }, []);

  const handleStatusChanged = useCallback((updatedBird: BirdStatusResponse) => {
    client.current?.clearCache();
    setBird((current) => current
      ? {
        ...current,
        deathDate: updatedBird.deathDate,
        notes: updatedBird.notes ?? current.notes,
        status: updatedBird.status,
        updatedAtUtc: updatedBird.updatedAtUtc ?? current.updatedAtUtc
      }
      : current);
    setReloadVersion((value) => value + 1);
  }, []);

  const loadData = useCallback(async (recoverSession = true) => {
    const nextRequestVersion = requestVersion.current + 1;
    requestVersion.current = nextRequestVersion;
    client.current?.clearCache();
    setFarmState("loading");
    setDetailState("loading");
    setDetailError(undefined);
    setEligibility(undefined);
    setEligibilityError(undefined);
    setEligibilityState("loading");
    setGenealogy(undefined);
    setGenealogyError(undefined);
    setGenealogyMaxGenerations(DEFAULT_GENEALOGY_GENERATIONS);
    setGenealogyState("loading");
    genealogyRequestVersion.current += 1;

    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (nextRequestVersion !== requestVersion.current) return;

      if (!selection.selectedBreedingFarmId) {
        setFarmState("blocked");
        setFarmError(selection.breedingFarms.length > 0
          ? "Selecione um criatório para consultar a ficha da ave."
          : "Crie seu primeiro criatório antes de consultar uma ave.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name);
      setFarmState("ready");

      const details = await client.current!.request<BirdDetailsResponse>(`api/birds/${encodeURIComponent(birdId)}`);
      if (nextRequestVersion !== requestVersion.current) return;
      setBird(details);
      setDetailState("ready");

      const [eligibilityResult, genealogyResult] = await Promise.allSettled([
        client.current!.request<BirdEligibilityResponse>(`api/birds/${encodeURIComponent(birdId)}/eligibility`),
        client.current!.request<BirdGenealogyResponse>(`api/birds/${encodeURIComponent(birdId)}/genealogy?maxGenerations=${DEFAULT_GENEALOGY_GENERATIONS}`)
      ]);
      if (nextRequestVersion !== requestVersion.current) return;

      const requestErrors = [eligibilityResult, genealogyResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason);
      if (requestErrors.some((error) => error instanceof StaleTenantResponseError)) return;
      if (recoverSession && requestErrors.some((error) => error instanceof ApiError && error.status === 401)) {
        const result = await refresh();
        if (result.ok) await loadData(false);
        return;
      }

      if (eligibilityResult.status === "fulfilled") {
        setEligibility(eligibilityResult.value);
        setEligibilityState("ready");
      } else if (eligibilityResult.reason instanceof ApiError && (eligibilityResult.reason.status === 404 || eligibilityResult.reason.status === 409)) {
        setEligibilityState("blocked");
        setEligibilityError(eligibilityResult.reason.status === 409
          ? "Selecione novamente um criatório para consultar esta elegibilidade."
          : "A elegibilidade não está disponível para o criatório selecionado.");
      } else {
        setEligibilityState("error");
        setEligibilityError(eligibilityResult.reason instanceof ApiError && eligibilityResult.reason.status >= 500
          ? "O serviço está indisponível no momento. Tente novamente em instantes."
          : "Verifique sua conexão e tente novamente.");
      }

      if (genealogyResult.status === "fulfilled") {
        setGenealogy(genealogyResult.value);
        setGenealogyError(undefined);
        setGenealogyMaxGenerations(genealogyResult.value.maxGenerations);
        setGenealogyState("ready");
      } else {
        setGenealogyState("error");
        setGenealogyError(genealogyRequestErrorMessage(genealogyResult.reason));
      }
    } catch (error) {
      if (nextRequestVersion !== requestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) await loadData(false);
        return;
      }
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        if (error.status === 409) {
          setFarmState("blocked");
          setFarmError("Selecione novamente um criatório para consultar a ficha da ave.");
          return;
        }
        setFarmState("ready");
        setDetailError("A ave não foi encontrada no criatório selecionado.");
        setDetailState("error");
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setFarmState("blocked");
        setFarmError("Sua conta não tem permissão para consultar esta ficha.");
        return;
      }
      setFarmState("error");
      setFarmError(error instanceof ApiError && error.status >= 500
        ? "O serviço está indisponível no momento. Tente novamente em instantes."
        : "Verifique sua conexão e tente novamente.");
    }
  }, [birdId, refresh]);

  const loadGenealogy = useCallback(async (maxGenerations: number, recoverSession = true) => {
    const nextRequestVersion = genealogyRequestVersion.current + 1;
    genealogyRequestVersion.current = nextRequestVersion;
    setGenealogyMaxGenerations(maxGenerations);
    setGenealogyState("loading");
    setGenealogyError(undefined);

    try {
      const result = await client.current!.request<BirdGenealogyResponse>(`api/birds/${encodeURIComponent(birdId)}/genealogy?maxGenerations=${maxGenerations}`);
      if (nextRequestVersion !== genealogyRequestVersion.current) return;
      setGenealogy(result);
      setGenealogyMaxGenerations(result.maxGenerations);
      setGenealogyState("ready");
    } catch (error) {
      if (nextRequestVersion !== genealogyRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (recoverSession && error instanceof ApiError && error.status === 401) {
        const result = await refresh();
        if (result.ok) await loadData(false);
        return;
      }
      setGenealogyState("error");
      setGenealogyError(genealogyRequestErrorMessage(error));
    }
  }, [birdId, loadData, refresh]);

  const refreshEditorSession = useCallback(async () => (await refresh()).ok, [refresh]);

  const saveExternalParent = useCallback(async (
    ancestorId: string,
    position: ExternalParentPosition,
    parent: ParentLinkInput
  ) => {
    const path = `api/birds/${encodeURIComponent(birdId)}/genealogy/ancestors/${encodeURIComponent(ancestorId)}/parents/${position}`;
    const sendRequest = async () => {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await client.current!.request<void>(path, {
        body: JSON.stringify(parent),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
    };

    try {
      await sendRequest();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const refreshed = await refresh();
      if (!refreshed.ok) throw error;
      csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await sendRequest();
    }
    client.current!.clearCache();
  }, [birdId, refresh]);

  const unlinkExternalParent = useCallback(async (ancestorId: string, position: ExternalParentPosition) => {
    const path = `api/birds/${encodeURIComponent(birdId)}/genealogy/ancestors/${encodeURIComponent(ancestorId)}/parents/${position}`;
    const sendRequest = async () => {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await client.current!.request<void>(path, { method: "DELETE" });
    };

    try {
      await sendRequest();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const refreshed = await refresh();
      if (!refreshed.ok) throw error;
      csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await sendRequest();
    }
    client.current!.clearCache();
  }, [birdId, refresh]);

  const updateRootParent = useCallback(async (
    position: ExternalParentPosition,
    parent?: ParentLinkInput,
    selectedParent?: ParentOption
  ) => {
    if (!bird) throw new Error("A ficha da ave não está disponível para atualizar a genealogia.");

    const externalName = parent?.linkedBirdId ? null : parent?.name?.trim() || null;
    const requestBody = {
      fatherBirdId: position === "father" ? parent?.linkedBirdId ?? null : bird.fatherBirdId,
      externalFatherName: position === "father" ? externalName : bird.externalFatherName,
      externalFatherSex: position === "father" ? externalName ? "Male" : null : bird.externalFatherSex,
      motherBirdId: position === "mother" ? parent?.linkedBirdId ?? null : bird.motherBirdId,
      externalMotherName: position === "mother" ? externalName : bird.externalMotherName,
      externalMotherSex: position === "mother" ? externalName ? "Female" : null : bird.externalMotherSex
    };
    const path = `api/birds/${encodeURIComponent(birdId)}/genealogy`;
    const sendRequest = async () => {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      return client.current!.request<BirdGenealogyUpdateResponse>(path, {
        body: JSON.stringify(requestBody),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
    };

    let updatedBird: BirdGenealogyUpdateResponse;
    try {
      updatedBird = await sendRequest();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const refreshed = await refresh();
      if (!refreshed.ok) throw error;
      csrfToken.current = await client.current!.fetchAntiforgeryToken();
      updatedBird = await sendRequest();
    }
    client.current!.clearCache();
    const selectedBirdParent: BirdParent | null = selectedParent ? {
      birdId: selectedParent.birdId,
      birthDate: selectedParent.birthDate,
      name: selectedParent.name,
      ringNumber: selectedParent.ringNumber,
      sex: selectedParent.sex,
      status: "Active"
    } : null;
    setBird((current) => current ? {
      ...current,
      father: position === "father" ? selectedBirdParent : current.father,
      fatherBirdId: updatedBird.fatherBirdId,
      externalFatherName: updatedBird.externalFatherName,
      externalFatherSex: updatedBird.externalFatherSex,
      mother: position === "mother" ? selectedBirdParent : current.mother,
      motherBirdId: updatedBird.motherBirdId,
      externalMotherName: updatedBird.externalMotherName,
      externalMotherSex: updatedBird.externalMotherSex,
      updatedAtUtc: updatedBird.updatedAtUtc
    } : current);
  }, [bird, birdId, refresh]);

  const saveRootParent = useCallback((position: ExternalParentPosition, parent: ParentLinkInput, selectedParent?: ParentOption) =>
    updateRootParent(position, parent, selectedParent), [updateRootParent]);

  const unlinkRootParent = useCallback((position: ExternalParentPosition) =>
    updateRootParent(position), [updateRootParent]);

  const refreshGenealogyAfterMutation = useCallback(() => {
    void loadGenealogy(genealogyMaxGenerations);
  }, [genealogyMaxGenerations, loadGenealogy]);

  const handleGenealogyBranchToggle = useCallback((nodeKey: string, expanded: boolean) => {
    setExpandedGenealogyBranches((current) => current[nodeKey] === expanded
      ? current
      : { ...current, [nodeKey]: expanded });
  }, []);

  useEffect(() => {
    setBirdId(readBirdIdFromPathname());
  }, []);

  useEffect(() => {
    if (!birdId) return;
    setExpandedGenealogyBranches({});
    genealogyScrollPosition.current = null;
  }, [birdId]);

  useEffect(() => {
    if (!birdId) return;
    void loadData();
  }, [birdId, loadData, reloadVersion]);

  useEffect(() => {
    if (detailState !== "ready" || window.location.hash !== "#genealogia") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("genealogia")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [birdId, detailState]);

  if (!session) {
    return <DetailStateView actionHref="/login" actionLabel="Ir para o login" heading="Entre para consultar a ficha" message="Faça login para visualizar os dados privados da ave." />;
  }

  if (farmState === "loading") {
    return <AppLoadingState activeNav="birds" email={session.email} farmName={farmName ?? "Criatório selecionado"} label="Carregando ficha da ave" message="Buscando os dados da ave no criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedDetailState email={session.email} farmName={farmName ?? "Criatório selecionado"} actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório antes de consultar a ficha."} />;
  }
  if (farmState === "error") {
    return <AuthenticatedDetailState email={session.email} farmName={farmName ?? "Criatório selecionado"} actionHref="/plantel/aves" heading="Não foi possível abrir a ficha" message={farmError ?? "Tente novamente para continuar."} onRetry={() => setReloadVersion((value) => value + 1)} />;
  }
  if (detailState === "loading") {
    return <AppLoadingState activeNav="birds" email={session.email} farmName={farmName ?? "Criatório selecionado"} label="Carregando ficha da ave" message="Buscando os dados da ave no criatório selecionado." />;
  }
  if (detailState === "error" || !bird) {
    return <AuthenticatedDetailState email={session.email} farmName={farmName ?? "Criatório selecionado"} actionHref="/plantel/aves" message={detailError ?? "Tente novamente para consultar os dados desta ave."} heading="Não foi possível abrir a ficha" onRetry={() => setReloadVersion((value) => value + 1)} />;
  }

  return (
    <DetailLayout email={session.email} farmName={farmName ?? "Criatório selecionado"}>
      <nav aria-label="Navegação estrutural" className="bird-detail-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">›</span><span aria-current="page">{bird.name}</span></nav>

      <section aria-labelledby="titulo-ficha-ave" className="bird-detail-profile">
        <BirdDetailPhoto bird={bird} />
        <div className="bird-detail-profile-content">
          <div className="bird-detail-profile-heading">
            <div>
              <p className="eyebrow">Ficha privada{farmName ? ` · ${farmName}` : ""}</p>
              <h1 id="titulo-ficha-ave">{bird.name}</h1>
              <p className="bird-detail-profile-ring">{bird.identificationPending ? "Identificação pendente" : bird.ringNumber ? `#${bird.ringNumber}` : "Identificação pendente"}</p>
              <p className="bird-detail-profile-sex">{sexLabel(bird.sex)} · {bird.speciesPopularName}</p>
            </div>
            <div className="bird-detail-profile-actions">
              <Link className="bird-detail-outline-action" href={`/plantel/aves/${encodeURIComponent(bird.birdId)}/editar`}><DashboardIcon name="edit" />Editar</Link>
              <Link className="bird-detail-reproduction-action" href="/reproducao/novo"><DashboardIcon name="heart" />Registrar reprodução</Link>
              <BirdDetailActionMenu bird={bird} client={client.current!} onSessionExpired={refresh} onStatusChanged={handleStatusChanged} prepareStatusMutation={prepareStatusMutation} />
            </div>
          </div>

          <dl className="bird-detail-profile-meta">
            <div><dt>Espécie/Raça</dt><dd>{bird.speciesPopularName}</dd></div>
            <div><dt>Nascimento</dt><dd>{formatDate(bird.birthDate)}{bird.ageInYears !== null ? ` (${bird.ageInYears} ${bird.ageInYears === 1 ? "ano" : "anos"})` : ""}</dd></div>
            <div><dt>Anilha</dt><dd>{bird.ringNumber ?? "Não informada"}</dd></div>
            <div><dt>Criatório</dt><dd>{farmName ?? "Não informado"}</dd></div>
          </dl>
        </div>
      </section>

      {statusNotice(bird.status) && <p className={`bird-status-history-notice bird-status-history-notice-${bird.status.toLowerCase()}`} role="status"><span aria-hidden="true">i</span>{statusNotice(bird.status)}</p>}

      <BirdEligibilityPanel
        birdId={bird.birdId}
        eligibility={eligibility}
        error={eligibilityError}
        onRetry={() => setReloadVersion((value) => value + 1)}
        state={eligibilityState}
      />

      <BirdDetailTabs />

      <div className="bird-detail-layout" id="visao-geral">
        <div className="bird-detail-main-column">
          <section aria-labelledby="titulo-dados-ave" className="bird-detail-section">
            <div className="bird-detail-section-heading"><div><p className="eyebrow">Visão geral</p><h2 id="titulo-dados-ave">Informações da ave</h2></div><Link className="bird-detail-section-action" href={`/plantel/aves/${encodeURIComponent(bird.birdId)}/editar`}>Editar</Link></div>
            <table className="bird-detail-info-table">
              <tbody>
                <tr><th scope="row">Nome</th><td>{bird.name}</td></tr>
                <tr><th scope="row">Sexo</th><td>{sexLabel(bird.sex)}</td></tr>
                <tr><th scope="row">Espécie/Raça</th><td>{bird.speciesPopularName}</td></tr>
                <tr><th scope="row">Cor</th><td>Não informado</td></tr>
                <tr><th scope="row">Nascimento</th><td>{formatDate(bird.birthDate)}{bird.ageInYears !== null ? ` (${bird.ageInYears} ${bird.ageInYears === 1 ? "ano" : "anos"})` : ""}</td></tr>
                {bird.deathDate && <tr><th scope="row">Falecimento</th><td>{formatDate(bird.deathDate)}</td></tr>}
                <tr><th scope="row">Anilha</th><td>{bird.ringNumber ?? "Não informada"}</td></tr>
                <tr><th scope="row">Situação</th><td><span className={`bird-status-badge bird-status-${bird.status.toLowerCase()}`}><span aria-hidden="true" />{statusLabel(bird.status)}</span></td></tr>
                <tr><th scope="row">Criatório</th><td>{farmName ?? "Não informado"}</td></tr>
                <tr><th scope="row">Descrição</th><td>{bird.notes ?? "Nenhuma observação registrada."}</td></tr>
              </tbody>
            </table>
            <p className="bird-detail-help">Cadastro atualizado em {formatDateTime(bird.updatedAtUtc)}.</p>
          </section>

          <section aria-labelledby="titulo-ancestrais-ave" className="bird-detail-section" id="genealogia">
            <div className="bird-detail-section-heading"><div><p className="eyebrow">Origem</p><h2 id="titulo-ancestrais-ave">Linhagem (Genealogia)</h2></div><a className="bird-detail-section-action" href="#arvore-genealogica" onClick={(event) => scrollToDetailSection(event, "arvore-genealogica")}>Ver árvore completa</a></div>
            <div className="bird-parent-grid">
              <ParentCard externalName={bird.externalFatherName} externalSex={bird.externalFatherSex} label="Pai" parent={bird.father} />
              <ParentCard externalName={bird.externalMotherName} externalSex={bird.externalMotherSex} label="Mãe" parent={bird.mother} />
            </div>
            <div className="bird-genealogy-tree" id="arvore-genealogica">
              <div className="bird-genealogy-tree-heading">
                <div>
                  <h3>Árvore consultada</h3>
                  <p id="genealogy-tree-navigation-help">Explore os vínculos. Role a árvore na horizontal e expanda cada ramo para ver gerações mais profundas.</p>
                </div>
                <label className="bird-genealogy-depth-control" htmlFor="genealogy-depth">
                  <span>Gerações exibidas</span>
                  <select
                    disabled={genealogyState === "loading"}
                    id="genealogy-depth"
                    onChange={(event) => void loadGenealogy(Number(event.target.value))}
                    value={genealogyMaxGenerations}
                  >
                    {GENEALOGY_DEPTH_OPTIONS.map((depth) => <option key={depth} value={depth}>{depth}</option>)}
                  </select>
                </label>
              </div>
              {genealogyState === "loading" && <LoadingSection label="genealogia" />}
              {genealogyState === "error" && <div className="bird-detail-error" role="alert"><span>{genealogyError ?? "Não foi possível carregar os demais ancestrais agora."}</span><button className="text-action" onClick={() => void loadGenealogy(genealogyMaxGenerations)} type="button">Tentar novamente</button></div>}
              {genealogyState === "ready" && genealogy && (
                <GenealogyNodes
                  birdId={birdId}
                  client={client.current!}
                  expandedBranches={expandedGenealogyBranches}
                  genealogy={genealogy}
                  onBranchToggle={handleGenealogyBranchToggle}
                  onMutationComplete={refreshGenealogyAfterMutation}
                  onSave={saveExternalParent}
                  onSaveRoot={saveRootParent}
                  onSessionExpired={refreshEditorSession}
                  onUnlink={unlinkExternalParent}
                  onUnlinkRoot={unlinkRootParent}
                  rootBird={bird}
                  scrollPosition={genealogyScrollPosition}
                />
              )}
            </div>
          </section>
        </div>

        <aside aria-label="Recursos da ficha" className="bird-detail-side-column">
          <BirdDetailMedia bird={bird} />
          <BirdQuickActions />
        </aside>
      </div>

      <BirdActivities bird={bird} />
      <p className="auth-footer">Os dados exibidos ficam vinculados somente ao criatório selecionado.</p>
    </DetailLayout>
  );
}

function BirdDetailScreen() {
  const { error, refresh, session, status } = useAuth();

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="birds" email={session?.email} label="Carregando ficha da ave" message="Um instante enquanto verificamos seu acesso." />;
  }
  if (status === "error") {
    return <DetailStateView actionHref="/plantel/aves" heading="Não foi possível abrir a ficha" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  }
  if (status === "forbidden") {
    return <DetailStateView actionHref="/plantel/aves" heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para consultar esta ficha."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  }
  if (status === "unauthenticated") {
    return <DetailStateView actionHref="/login" actionLabel="Ir para o login" heading="Entre para consultar a ficha" message="Faça login para visualizar os dados privados da ave." />;
  }

  return <BirdDetailPage />;
}

export default function BirdDetailPageRoute() {
  return (
    <AuthProvider>
      <BirdDetailScreen />
    </AuthProvider>
  );
}
