"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../../lib/http/api-client";
import { selectedFarmFromResponse, normalizeFarmResponse, type BreedingFarmSelectionResponse } from "../../../../reproducao/reproduction-data";
import { AppLoadingState } from "../../../../components/app-loading-state";
import { AuthenticatedShell } from "../../../../components/authenticated-shell";
import { DashboardIcon } from "../../../../components/dashboard-icons";

interface BirdSummary {
  birdId: string;
  name: string;
  ringNumber: string | null;
  speciesPopularName: string;
}

interface BirdCompetition {
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

interface BirdCompetitionListResponse {
  breedingFarmId: string;
  birdId: string;
  items: BirdCompetition[];
}

type LoadState = "blocked" | "error" | "loading" | "ready";

interface CompetitionHistoryScreenProps {
  birdId: string;
  competitionId?: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Data não informada";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function loadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para consultar este histórico.";
  if (error instanceof ApiError && error.status === 404) return "A ave ou a competição não está disponível neste criatório.";
  if (error instanceof ApiError && error.status === 409) return "Selecione um criatório para consultar o histórico de competições.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o histórico. Tente novamente.";
}

function StateMessage({ heading, headingLevel = "h1", message, retry, action }: Readonly<{ heading: string; headingLevel?: "h1" | "h2"; message: string; retry?: () => void; action?: React.ReactNode }>) {
  const Heading = headingLevel;
  return (
    <section className="document-history-state competition-history-state" role={retry ? "alert" : "status"}>
      <span aria-hidden="true" className="competition-history-icon"><DashboardIcon name="trophy" /></span>
      <Heading>{heading}</Heading>
      <span>{message}</span>
      {retry && <button className="auth-secondary-action" onClick={retry} type="button">Tentar novamente</button>}
      {action}
    </section>
  );
}

export function CompetitionHistoryScreen({ birdId, competitionId }: CompetitionHistoryScreenProps) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const requestVersion = useRef(0);
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<LoadState>("loading");
  const [bird, setBird] = useState<BirdSummary>();
  const [items, setItems] = useState<BirdCompetition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<BirdCompetition>();
  const [error, setError] = useState("");

  if (!client.current) client.current = createApiClient();

  const load = useCallback(async (recoverSession = true) => {
    const version = ++requestVersion.current;
    setFarmState("loading");
    setError("");
    setBird(undefined);
    setItems([]);
    setSelectedCompetition(undefined);
    try {
      const farms = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (version !== requestVersion.current) return;
      const selectedFarm = selectedFarmFromResponse(normalizeFarmResponse(farms));
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setFarmName("Criatório selecionado");
        setFarmState("blocked");
        return;
      }
      client.current!.setTenant(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      const [birdResponse, competitionResponse] = await Promise.all([
        client.current!.request<BirdSummary>(`api/birds/${encodeURIComponent(birdId)}`),
        competitionId
          ? client.current!.request<BirdCompetition>(`api/birds/${encodeURIComponent(birdId)}/competitions/${encodeURIComponent(competitionId)}`)
          : client.current!.request<BirdCompetitionListResponse>(`api/birds/${encodeURIComponent(birdId)}/competitions`)
      ]);
      if (version !== requestVersion.current) return;
      setBird(birdResponse);
      if (competitionId) setSelectedCompetition(competitionResponse as BirdCompetition);
      else setItems((competitionResponse as BirdCompetitionListResponse).items);
      setFarmState("ready");
    } catch (loadFailure) {
      if (version !== requestVersion.current || loadFailure instanceof StaleTenantResponseError) return;
      if (loadFailure instanceof ApiError && loadFailure.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === requestVersion.current) {
          await load(false);
          return;
        }
      }
      setError(loadError(loadFailure));
      setFarmState(loadFailure instanceof ApiError && loadFailure.status === 409 ? "blocked" : "error");
    }
  }, [birdId, competitionId, refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
    return () => { requestVersion.current += 1; };
  }, [load, status]);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="competitions" email={session?.email} farmName={farmName} label="Preparando competições" message="Consultando o histórico da ave." />;
  }
  if (status === "unauthenticated") {
    return <main className="document-wizard-page competition-history-page"><StateMessage action={<Link className="auth-primary-action" href="/login">Entrar</Link>} heading="Entre para consultar as competições" message="Sua sessão é necessária para visualizar o histórico desta ave." /></main>;
  }
  if (status === "forbidden" || status === "error") {
    return <main className="document-wizard-page competition-history-page"><StateMessage heading="Não foi possível abrir as competições" message="Sua sessão não conseguiu acessar esta área. Tente novamente." retry={() => void refresh()} /></main>;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="competitions" email={session.email} farmName={farmName} label="Preparando competições" message="Consultando o histórico da ave." />;
  }

  const listHref = `/plantel/aves/${encodeURIComponent(birdId)}/competicoes`;
  const birdHref = `/plantel/aves/${encodeURIComponent(birdId)}`;
  const pageHeading = competitionId ? "Detalhes da competição" : "Histórico de competições";

  return (
    <AuthenticatedShell activeNav="competitions" email={session.email} farmName={farmName}>
      <main className="document-wizard-page competition-history-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb">
          <Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">›</span>
          <Link href={birdHref}>{bird?.name ?? "Ficha da ave"}</Link>{competitionId && <><span aria-hidden="true">›</span><Link href={listHref}>Competições</Link></>}
          <span aria-hidden="true">›</span><span aria-current="page">{competitionId ? "Detalhe" : "Histórico"}</span>
        </nav>
        <header className="document-wizard-header competition-history-header">
          <div><p className="eyebrow">Competições · {farmName}</p><h1>{pageHeading}</h1><p>{bird ? `${bird.name} · ${bird.speciesPopularName} · ${bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Sem anilha"}` : "Consulte os resultados e registros desta ave."}</p></div>
          <div className="document-wizard-header-actions"><Link className="auth-secondary-action" href={birdHref}>Voltar à ficha</Link>{!competitionId && <Link className="auth-primary-action" href={`/competicoes/nova?birdId=${encodeURIComponent(birdId)}`}>Registrar competição</Link>}</div>
        </header>

        {farmState === "blocked" && <StateMessage action={<Link className="auth-primary-action" href="/onboarding/criatorio/selecionar">Selecionar criatório</Link>} heading="Selecione um criatório" headingLevel="h2" message={error || "Escolha um criatório para consultar o histórico."} />}
        {farmState === "error" && <StateMessage heading={competitionId ? "Não foi possível consultar a competição" : "Não foi possível consultar o histórico"} headingLevel="h2" message={error} retry={() => void load()} />}
        {farmState === "ready" && competitionId && selectedCompetition && <article aria-labelledby="competition-detail-title" className="document-wizard-card competition-history-detail">
          <div className="competition-history-detail-heading"><span aria-hidden="true" className="document-history-item-icon"><DashboardIcon name="trophy" /></span><div><p className="eyebrow">Resultado registrado</p><h2 id="competition-detail-title">{selectedCompetition.name}</h2><p>{formatDate(selectedCompetition.date)}</p></div></div>
          <dl className="competition-history-fields">
            <div><dt>Categoria</dt><dd>{selectedCompetition.category || "Não informada"}</dd></div>
            <div><dt>Colocação</dt><dd>{selectedCompetition.placement ? `${selectedCompetition.placement}º lugar` : "Não informada"}</dd></div>
            <div><dt>Local</dt><dd>{selectedCompetition.location || "Não informado"}</dd></div>
            <div><dt>Última atualização</dt><dd>{formatDate(selectedCompetition.updatedAtUtc)}</dd></div>
            <div className="competition-history-notes"><dt>Observações</dt><dd>{selectedCompetition.notes || "Nenhuma observação registrada."}</dd></div>
          </dl>
          <Link className="auth-secondary-action" href={listHref}>Voltar ao histórico</Link>
        </article>}
        {farmState === "ready" && !competitionId && items.length === 0 && <StateMessage action={<Link className="auth-primary-action" href={`/competicoes/nova?birdId=${encodeURIComponent(birdId)}`}>Registrar primeira competição</Link>} heading="Nenhuma competição registrada" headingLevel="h2" message="Os resultados e participações desta ave aparecerão aqui." />}
        {farmState === "ready" && !competitionId && items.length > 0 && <section aria-labelledby="competition-history-list-title" className="document-wizard-card competition-history-results">
          <div className="document-history-results-heading"><div><p className="eyebrow">{items.length} {items.length === 1 ? "registro" : "registros"}</p><h2 id="competition-history-list-title">Competições de {bird?.name}</h2><p>Histórico em ordem da participação mais recente.</p></div></div>
          <ul aria-label="Competições registradas" className="document-history-list competition-history-list">
            {items.map((item) => <li key={item.competitionId}><Link className="document-history-item competition-history-item" href={`${listHref}/${encodeURIComponent(item.competitionId)}`}>
              <span aria-hidden="true" className="document-history-item-icon"><DashboardIcon name="trophy" /></span>
              <span className="document-history-item-main"><span className="document-history-item-title"><strong>{item.name}</strong>{item.placement && <span className="competition-placement-badge">{item.placement}º lugar</span>}</span>
                <small>{formatDate(item.date)}{item.category ? ` · ${item.category}` : ""}</small>{item.location && <small>{item.location}</small>}</span>
              <span className="document-history-item-actions"><span className="auth-secondary-action">Ver detalhes <span aria-hidden="true">›</span></span></span>
            </Link></li>)}
          </ul>
        </section>}
      </main>
    </AuthenticatedShell>
  );
}
