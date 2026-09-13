"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../lib/http/api-client";
import { AppLoadingState } from "../../../components/app-loading-state";
import { BrandLockup, BrandPanel } from "../../../components/brand";
import { AuthenticatedShell } from "../../../components/authenticated-shell";
import { DashboardIcon } from "../../../components/dashboard-icons";
import { BirdStatusAction, type BirdStatus, type BirdStatusResponse } from "../bird-status-action";

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
  status: BirdStatus | null;
}

interface BirdGenealogyResponse {
  edges: Array<{ childNodeKey: string; parentNodeKey: string; position: string }>;
  isTruncated: boolean;
  maxGenerations: number;
  nodes: BirdGenealogyNode[];
  rootBirdId: string;
}

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
  return issue.message.trim() || "A API não informou detalhes adicionais para esta pendência.";
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

function GenealogyNodes({ genealogy }: Readonly<{ genealogy: BirdGenealogyResponse }>) {
  const ancestors = genealogy.nodes.filter((node) => node.generation > 0);

  if (ancestors.length === 0) {
    return <EmptySection message="Ainda não há outros ancestrais registrados para esta ave." />;
  }

  return (
    <>
      <ul aria-label="Ancestrais registrados" className="bird-genealogy-nodes">
        {ancestors.map((node) => (
          <li key={node.nodeKey}>
            {node.canNavigate && node.isAccessible && node.birdId
              ? <Link href={`/plantel/aves/${node.birdId}`}><strong>{node.name}</strong><span>{node.position === "father" ? "Pai" : node.position === "mother" ? "Mãe" : "Ancestral"} · geração {node.generation}</span></Link>
              : <div><strong>{node.name}</strong><span>{node.source === "External" ? "Ancestral externo" : "Snapshot histórico"} · geração {node.generation}</span></div>}
          </li>
        ))}
      </ul>
      {genealogy.isTruncated && <p className="bird-detail-help">A árvore foi limitada a {genealogy.maxGenerations} gerações para manter a consulta rápida.</p>}
    </>
  );
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
              ? <a aria-current={index === 0 ? "page" : undefined} href={tab.href}>{tab.label}</a>
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
          <p className="eyebrow">Validação da API</p>
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
            <p>A API não retornou motivos de inelegibilidade para esta ave.</p>
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
            <p className="bird-eligibility-feedback">A API informou que esta ave não está elegível, mas não retornou os motivos.</p>
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
        <button disabled title="Módulo em desenvolvimento" type="button">Baixar ficha (PDF)</button>
      </div>
    </details>
  );
}

function BirdDetailPhoto({ status }: Readonly<{ status: BirdStatus }>) {
  return (
    <div aria-label="Foto da ave não cadastrada" className="bird-detail-profile-photo">
      <img alt="" aria-hidden="true" src="/assets/imagery/birds/great-tit-header-hd.webp" />
      <span className={`bird-detail-photo-status bird-status-${status.toLowerCase()}`}><span aria-hidden="true" />{statusLabel(status)}</span>
      <span className="bird-detail-photo-caption">Imagem ilustrativa · foto não cadastrada</span>
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
          <div><p className="eyebrow">Identificação</p><h2 id="titulo-qr-ave">QR Code da ave</h2></div>
        </div>
        <div className="bird-detail-qr-content">
          <div aria-label={`QR Code de ${bird.name} indisponível`} className="bird-detail-qr-placeholder">QR</div>
          <div>
            <p>O QR Code estará disponível quando a geração de documentos for liberada.</p>
            <button disabled type="button">Baixar QR Code</button>
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
    { icon: "document" as const, label: "Baixar ficha (PDF)" }
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
  const [genealogyState, setGenealogyState] = useState<GenealogyState>("loading");
  const [reloadVersion, setReloadVersion] = useState(0);
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);

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
    setGenealogyState("loading");

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
        client.current!.request<BirdGenealogyResponse>(`api/birds/${encodeURIComponent(birdId)}/genealogy?maxGenerations=2`)
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
        setGenealogyState("ready");
      } else {
        setGenealogyState("error");
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

  useEffect(() => {
    setBirdId(readBirdIdFromPathname());
  }, []);

  useEffect(() => {
    if (!birdId) return;
    void loadData();
  }, [birdId, loadData, reloadVersion]);

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
      <nav aria-label="Navegação estrutural" className="bird-detail-breadcrumb"><Link href="/dashboard">Dashboard</Link><span aria-hidden="true">›</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">›</span><span aria-current="page">{bird.name}</span></nav>

      <section aria-labelledby="titulo-ficha-ave" className="bird-detail-profile">
        <BirdDetailPhoto status={bird.status} />
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
              <button disabled title="Módulo em desenvolvimento" type="button"><DashboardIcon name="heart" />Registrar reprodução</button>
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
            <div className="bird-detail-section-heading"><div><p className="eyebrow">Origem</p><h2 id="titulo-ancestrais-ave">Linhagem (Genealogia)</h2></div><span className="bird-detail-section-action">Ver árvore completa</span></div>
            <div className="bird-parent-grid">
              <ParentCard externalName={bird.externalFatherName} externalSex={bird.externalFatherSex} label="Pai" parent={bird.father} />
              <ParentCard externalName={bird.externalMotherName} externalSex={bird.externalMotherSex} label="Mãe" parent={bird.mother} />
            </div>
            <div className="bird-genealogy-tree">
              <h3>Árvore consultada</h3>
              {genealogyState === "loading" && <LoadingSection label="genealogia" />}
              {genealogyState === "error" && <div className="bird-detail-error" role="alert"><span>Não foi possível carregar os demais ancestrais agora.</span><button className="text-action" onClick={() => setReloadVersion((value) => value + 1)} type="button">Tentar novamente</button></div>}
              {genealogyState === "ready" && genealogy && <GenealogyNodes genealogy={genealogy} />}
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
