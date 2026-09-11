"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../../../components/brand";

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
type BirdStatus = "Active" | "Archived" | "Transferred" | "Deceased" | "Escaped";
type DetailState = "error" | "loading" | "ready";
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
            <a className="text-action" href={actionHref}>{actionLabel}</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page onboarding-page bird-detail-page">
      <a className="skip-link" href="#conteudo-ficha-ave">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell bird-detail-shell">
        <BrandPanel />
        <section aria-label="Ficha da ave" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content" id="conteudo-ficha-ave">
            {children}
          </div>
        </section>
      </div>
    </main>
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
        <a href={`/plantel/aves/${parent.birdId}`}>
          <strong>{parent.name}</strong>
          <span>{sexLabel(parent.sex)} · {statusLabel(parent.status)}</span>
        </a>
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
              ? <a href={`/plantel/aves/${node.birdId}`}><strong>{node.name}</strong><span>{node.position === "father" ? "Pai" : node.position === "mother" ? "Mãe" : "Ancestral"} · geração {node.generation}</span></a>
              : <div><strong>{node.name}</strong><span>{node.source === "External" ? "Ancestral externo" : "Snapshot histórico"} · geração {node.generation}</span></div>}
          </li>
        ))}
      </ul>
      {genealogy.isTruncated && <p className="bird-detail-help">A árvore foi limitada a {genealogy.maxGenerations} gerações para manter a consulta rápida.</p>}
    </>
  );
}

function RelatedSections() {
  const sections = ["Reproduções", "Transferências", "Fotos e anexos", "Documentos", "Competições", "Histórico"];

  return (
    <section aria-labelledby="titulo-outras-secoes" className="bird-detail-section">
      <div className="bird-detail-section-heading">
        <div>
          <p className="eyebrow">Recursos da ficha</p>
          <h2 id="titulo-outras-secoes">Outras seções</h2>
        </div>
      </div>
      <p className="bird-detail-help">Esses recursos aparecerão aqui quando houver registros vinculados à ave.</p>
      <ul aria-label="Seções relacionadas da ficha" className="bird-related-sections">
        {sections.map((section) => (
          <li key={section}>
            <strong>{section}</strong>
            <span>Nenhum registro disponível</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BirdDetailPage() {
  const { refresh } = useAuth();
  const [birdId, setBirdId] = useState("");
  const [bird, setBird] = useState<BirdDetailsResponse>();
  const [detailError, setDetailError] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [genealogy, setGenealogy] = useState<BirdGenealogyResponse>();
  const [genealogyState, setGenealogyState] = useState<GenealogyState>("loading");
  const [reloadVersion, setReloadVersion] = useState(0);
  const client = useRef<ApiClient | null>(null);
  const requestVersion = useRef(0);

  if (!client.current) client.current = createApiClient();

  const loadData = useCallback(async (recoverSession = true) => {
    const nextRequestVersion = requestVersion.current + 1;
    requestVersion.current = nextRequestVersion;
    client.current?.clearCache();
    setFarmState("loading");
    setDetailState("loading");
    setDetailError(undefined);
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

      try {
        const tree = await client.current!.request<BirdGenealogyResponse>(`api/birds/${encodeURIComponent(birdId)}/genealogy?maxGenerations=2`);
        if (nextRequestVersion !== requestVersion.current) return;
        setGenealogy(tree);
        setGenealogyState("ready");
      } catch (error) {
        if (nextRequestVersion !== requestVersion.current || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && error.status === 401 && recoverSession) {
          const result = await refresh();
          if (result.ok) await loadData(false);
          return;
        }
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

  if (farmState === "loading") {
    return <DetailStateView actionHref="/plantel/aves" heading="Verificando o criatório" message="Só um instante enquanto buscamos a ave no criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <DetailStateView actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório antes de consultar a ficha."} />;
  }
  if (farmState === "error") {
    return <DetailStateView actionHref="/plantel/aves" heading="Não foi possível abrir a ficha" message={farmError ?? "Tente novamente para continuar."} onRetry={() => setReloadVersion((value) => value + 1)} />;
  }
  if (detailState === "loading") {
    return (
      <DetailLayout>
        <div className="auth-mobile-brand"><BrandLockup stacked /></div>
        <div className="bird-detail-page-state"><LoadingSection label="ficha da ave" /></div>
      </DetailLayout>
    );
  }
  if (detailState === "error" || !bird) {
    return <DetailStateView actionHref="/plantel/aves" message={detailError ?? "Tente novamente para consultar os dados desta ave."} heading="Não foi possível abrir a ficha" onRetry={() => setReloadVersion((value) => value + 1)} />;
  }

  return (
    <DetailLayout>
      <a aria-label="Voltar para o plantel" className="auth-mobile-back" href="/plantel/aves">←</a>
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <nav aria-label="Navegação estrutural" className="bird-detail-breadcrumb"><a href="/plantel/aves">Plantel</a><span aria-hidden="true">/</span><span aria-current="page">Ficha da ave</span></nav>

      <header className="bird-detail-header">
        <div>
          <p className="eyebrow">Plantel{farmName ? ` · ${farmName}` : ""}</p>
          <h1 id="titulo-ficha-ave">{bird.name}</h1>
          <p className="lede">{bird.speciesPopularName} · <em>{bird.speciesScientificName}</em></p>
        </div>
        <span className={`bird-status-badge bird-status-${bird.status.toLowerCase()}`}>{statusLabel(bird.status)}</span>
      </header>

      <div className="bird-detail-actions">
        <a className="auth-secondary-action" href="/plantel/aves">← Voltar ao plantel</a>
        <a className="auth-primary-action bird-detail-edit-action" href={`/plantel/aves/${encodeURIComponent(bird.birdId)}/editar`}>Editar dados</a>
      </div>

      <section aria-labelledby="titulo-resumo-ave" className="bird-detail-summary">
        <div className="bird-detail-summary-mark" aria-hidden="true">{bird.identificationPending ? "!" : "#"}</div>
        <div>
          <p className="eyebrow">Resumo da identificação</p>
          <h2 id="titulo-resumo-ave">{bird.identificationPending ? "Identificação pendente" : `Anilha ${bird.ringNumber}`}</h2>
          <p>{bird.identificationPending ? "Adicione uma anilha válida para concluir a identificação desta ave." : "Esta ave possui identificação registrada no criatório."}</p>
        </div>
      </section>

      <div className="bird-detail-grid">
        <section aria-labelledby="titulo-dados-ave" className="bird-detail-section">
          <div className="bird-detail-section-heading"><div><p className="eyebrow">Informações principais</p><h2 id="titulo-dados-ave">Dados cadastrais</h2></div></div>
          <dl className="bird-detail-fields">
            <div><dt>Sexo</dt><dd>{sexLabel(bird.sex)}</dd></div>
            <div><dt>Nascimento</dt><dd>{formatDate(bird.birthDate)}</dd></div>
            <div><dt>Idade</dt><dd>{bird.ageInYears === null ? "Não informado" : `${bird.ageInYears} ${bird.ageInYears === 1 ? "ano" : "anos"}`}</dd></div>
            <div><dt>Anilha</dt><dd>{bird.ringNumber ?? "Não informada"}</dd></div>
            <div><dt>Situação</dt><dd>{statusLabel(bird.status)}</dd></div>
            <div><dt>Falecimento</dt><dd>{formatDate(bird.deathDate)}</dd></div>
          </dl>
          <p className="bird-detail-help">Cadastro atualizado em {formatDateTime(bird.updatedAtUtc)}.</p>
        </section>

        <section aria-labelledby="titulo-ancestrais-ave" className="bird-detail-section">
          <div className="bird-detail-section-heading"><div><p className="eyebrow">Origem</p><h2 id="titulo-ancestrais-ave">Genealogia</h2></div></div>
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

        <section aria-labelledby="titulo-observacoes-ave" className="bird-detail-section">
          <div className="bird-detail-section-heading"><div><p className="eyebrow">Registro livre</p><h2 id="titulo-observacoes-ave">Observações</h2></div></div>
          {bird.notes ? <p className="bird-detail-notes">{bird.notes}</p> : <EmptySection message="Nenhuma observação foi registrada para esta ave." />}
        </section>
      </div>

      <RelatedSections />
      <p className="auth-footer">Os dados exibidos ficam vinculados somente ao criatório selecionado.</p>
    </DetailLayout>
  );
}

function BirdDetailScreen() {
  const { error, refresh, status } = useAuth();

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <DetailStateView actionHref="/plantel/aves" heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
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
