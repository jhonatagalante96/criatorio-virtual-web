"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import {
  formatReproductionDate,
  normalizeFarmResponse,
  normalizeReproductionList,
  reproductionStatusClass,
  reproductionStatusLabel,
  selectedFarmFromResponse,
  type BreedingFarmSelectionResponse,
  type ReproductionFilter,
  type ReproductionListResponse
} from "./reproduction-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type ListState = "error" | "loading" | "ready";

const PAGE_SIZE = 20;

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de continuar.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado. Tente novamente.";
}

function reproductionListErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return "O filtro da listagem não foi aceito. Revise a situação e tente novamente.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar as reproduções deste criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar as reproduções.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar as reproduções. Tente novamente.";
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
        <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="heart" /></span>
        <h1>{heading}</h1>
        <p>{message}</p>
        {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
        {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
      </section>
    </main>
  );
}

function ReproductionListScreen() {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const listRequestVersion = useRef(0);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [filter, setFilter] = useState<ReproductionFilter>("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ReproductionListResponse>();
  const [listError, setListError] = useState<string>();
  const [listState, setListState] = useState<ListState>("loading");

  if (!client.current) client.current = createApiClient();

  const loadFarm = useCallback(async (recoverSession = true) => {
    const version = ++farmRequestVersion.current;
    setFarmState("loading");
    setFarmError(undefined);
    try {
      const rawResponse = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (version !== farmRequestVersion.current) return;
      const response = normalizeFarmResponse(rawResponse);
      const selectedFarm = selectedFarmFromResponse(response);
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setSelectedFarmId(undefined);
        setFarmName("Criatório selecionado");
        setFarmState("blocked");
        return;
      }

      client.current!.setTenant(selectedFarm.breedingFarmId);
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");
    } catch (error) {
      if (version !== farmRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === farmRequestVersion.current) {
          await loadFarm(false);
          return;
        }
      }
      setFarmState(error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409) ? "blocked" : "error");
      setFarmError(farmErrorMessage(error));
    }
  }, [refresh]);

  const loadReproductions = useCallback(async (recoverSession = true) => {
    if (!selectedFarmId) return;
    const version = ++listRequestVersion.current;
    setListState("loading");
    setListError(undefined);
    setList(undefined);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filter) query.set("status", filter);

    try {
      const response = await client.current!.request<ReproductionListResponse>(`api/reproductions?${query.toString()}`);
      if (version !== listRequestVersion.current) return;
      setList(normalizeReproductionList(response));
      setListState("ready");
    } catch (error) {
      if (version !== listRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === listRequestVersion.current) {
          await loadReproductions(false);
          return;
        }
      }
      setListState("error");
      setListError(reproductionListErrorMessage(error));
    }
  }, [filter, page, refresh, selectedFarmId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadFarm();
    return () => {
      farmRequestVersion.current += 1;
      listRequestVersion.current += 1;
    };
  }, [loadFarm, status]);

  useEffect(() => {
    if (status !== "authenticated" || farmState !== "ready" || !selectedFarmId) return;
    void loadReproductions();
    return () => { listRequestVersion.current += 1; };
  }, [farmState, loadReproductions, selectedFarmId, status]);

  function changeFilter(value: ReproductionFilter) {
    setPage(1);
    setFilter(value);
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="reproduction" email={session?.email} farmName={farmName} label="Preparando reproduções" message="Consultando o criatório selecionado." />;
  }
  if (status === "unauthenticated") {
    return <StateCard actionHref="/login" actionLabel="Entrar" heading="Entre para consultar as reproduções" message="Sua sessão é necessária para visualizar o histórico privado do criatório." />;
  }
  if (status === "forbidden" || status === "error") {
    return <StateCard heading="Não foi possível abrir as reproduções" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="reproduction" email={session.email} farmName={farmName} label="Preparando reproduções" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para consultar as reproduções."} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard heading="Não foi possível consultar o criatório" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }

  return (
    <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}>
      <main className="document-wizard-page reproduction-history-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Reproduções</span></nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Reprodução do criatório</p><h1>Reproduções</h1><p>Consulte os registros em andamento e o histórico preservado na origem.</p></div>
          <Link className="auth-primary-action document-wizard-emit-link" href="/reproducao/novo">Registrar reprodução</Link>
        </header>

        <section aria-busy={listState === "loading"} aria-labelledby="titulo-historico-reproducoes" className="document-history-results document-wizard-card">
          <header className="document-history-results-heading">
            <div><p className="eyebrow">Histórico do criatório</p><h2 id="titulo-historico-reproducoes">Todas as reproduções</h2><p>Os dados do casal são os retornados pelo histórico do criatório de origem.</p></div>
            <label className="document-history-filter" htmlFor="filtro-status-reproducao"><span>Filtrar por situação</span><select id="filtro-status-reproducao" disabled={listState === "loading"} onChange={(event) => changeFilter(event.target.value as ReproductionFilter)} value={filter}>
              <option value="">Todas as situações</option>
              <option value="Active">Em andamento</option>
              <option value="Finished">Encerradas</option>
              <option value="Cancelled">Canceladas</option>
            </select></label>
          </header>

          {listState === "loading" && <div className="document-history-state" role="status"><span aria-hidden="true" className="document-preview-dialog-spinner" /><strong>Consultando reproduções…</strong><span>Buscando somente o histórico autorizado do criatório selecionado.</span></div>}
          {listState === "error" && <div className="document-history-state is-error" role="alert"><strong>Não foi possível consultar as reproduções</strong><span>{listError}</span><button className="auth-secondary-action" onClick={() => void loadReproductions()} type="button">Tentar novamente</button></div>}
          {listState === "ready" && list?.items.length === 0 && <div className="document-history-state" role="status">
            <strong>{filter ? "Nenhuma reprodução encontrada" : "Nenhuma reprodução registrada"}</strong>
            <span>{filter ? "Não há registros com essa situação. Altere o filtro para consultar outros períodos." : "Quando você registrar uma reprodução, ela aparecerá aqui com o histórico do casal."}</span>
            {filter ? <button className="auth-secondary-action" onClick={() => changeFilter("")} type="button">Limpar filtro</button> : <Link className="auth-primary-action" href="/reproducao/novo">Registrar primeira reprodução</Link>}
          </div>}
          {listState === "ready" && list && list.items.length > 0 && <>
            <ul aria-label="Reproduções do criatório" className="document-history-list reproduction-history-list">
              {list.items.map((item) => <li key={item.reproductionId}>
                <Link aria-label={`Ver detalhes da reprodução de ${item.maleBird.name} e ${item.femaleBird.name}`} className="document-history-item reproduction-history-item" href={`/reproducao/${encodeURIComponent(item.reproductionId)}`}>
                  <span aria-hidden="true" className="document-history-item-icon"><DashboardIcon name="heart" /></span>
                  <span className="document-history-item-main">
                    <span className="document-history-item-title"><strong>{item.maleBird.name} × {item.femaleBird.name}</strong><span className={`reproduction-status-badge ${reproductionStatusClass(item.status)}`}>{reproductionStatusLabel(item.status)}</span></span>
                    <span className="reproduction-history-period">Início em {formatReproductionDate(item.startDate)}{item.endDate ? ` · término em ${formatReproductionDate(item.endDate)}` : " · sem data de término"}</span>
                    <small>Macho · {item.maleBird.ringNumber ? `anilha ${item.maleBird.ringNumber}` : "sem anilha informada"} <span aria-hidden="true">·</span> Fêmea · {item.femaleBird.ringNumber ? `anilha ${item.femaleBird.ringNumber}` : "sem anilha informada"}</small>
                  </span>
                  <span className="document-history-item-actions"><span className="auth-secondary-action">Ver detalhes <span aria-hidden="true">›</span></span></span>
                </Link>
              </li>)}
            </ul>
            {list.totalPages > 1 && <nav aria-label="Paginação das reproduções" className="document-history-pagination reproduction-history-pagination">
              <button aria-label="Página anterior" className="auth-secondary-action" disabled={list.page <= 1} onClick={() => setPage(list.page - 1)} type="button">Anterior</button>
              <span aria-live="polite">Página {list.page} de {list.totalPages} · {list.totalCount} registros</span>
              <button aria-label="Próxima página" className="auth-secondary-action" disabled={list.page >= list.totalPages} onClick={() => setPage(list.page + 1)} type="button">Próxima</button>
            </nav>}
          </>}
        </section>
        <p className="auth-footer">As reproduções são consultadas no contexto do criatório selecionado. Não abrimos fichas atuais de aves transferidas.</p>
      </main>
    </AuthenticatedShell>
  );
}

export default function ReproductionListPage() {
  return <AuthProvider><ReproductionListScreen /></AuthProvider>;
}
