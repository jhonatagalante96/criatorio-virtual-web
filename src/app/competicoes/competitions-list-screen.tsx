"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import { normalizeFarmResponse, selectedFarmFromResponse, type BreedingFarmSelectionResponse } from "../reproducao/reproduction-data";
import {
  CompetitionFilterValues,
  CompetitionListItem,
  CompetitionListResponse,
  buildCompetitionQuery,
  competitionListErrorMessage,
  formatCompetitionDate,
  formatPlacement,
  hasAnyFilter,
  validateFilterDates
} from "./competitions-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type ListState = "error" | "loading" | "ready";

const PAGE_SIZE = 20;

interface BirdOption {
  birdId: string;
  name: string;
  ringNumber: string | null;
}

interface BirdListApiResponse {
  items: BirdOption[];
}

interface CompetitionsListScreenProps {
  initialFilters?: CompetitionFilterValues;
  initialPage?: number;
}

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar as competições.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado. Tente novamente.";
}

function StateCard({
  actionHref,
  actionLabel,
  heading,
  message,
  onRetry
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return (
    <section className="document-wizard-state" role={onRetry ? "alert" : undefined}>
      <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="trophy" /></span>
      <h1>{heading}</h1>
      <p>{message}</p>
      {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
      {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
    </section>
  );
}

export function CompetitionsListScreen({ initialFilters = {}, initialPage = 1 }: CompetitionsListScreenProps) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const listRequestVersion = useRef(0);

  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();

  const [birds, setBirds] = useState<BirdOption[]>([]);

  // Filter input states
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [category, setCategory] = useState(initialFilters.category ?? "");
  const [birdId, setBirdId] = useState(initialFilters.birdId ?? "");
  const [fromDate, setFromDate] = useState(initialFilters.fromDate ?? "");
  const [toDate, setToDate] = useState(initialFilters.toDate ?? "");
  const [dateError, setDateError] = useState<string>();

  // Applied filter state
  const [appliedFilters, setAppliedFilters] = useState<CompetitionFilterValues>(initialFilters);
  const [page, setPage] = useState(initialPage);

  // List response states
  const [list, setList] = useState<CompetitionListResponse>();
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
        setBirds([]);
        setAppliedFilters({});
        return;
      }

      if (selectedFarmId && selectedFarmId !== selectedFarm.breedingFarmId) {
        setSearch("");
        setCategory("");
        setBirdId("");
        setFromDate("");
        setToDate("");
        setDateError(undefined);
        setAppliedFilters({});
        setPage(1);
        setBirds([]);
      }

      client.current!.setTenant(selectedFarm.breedingFarmId);
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");

      // Load available birds for filter dropdown
      try {
        const birdsResponse = await client.current!.request<BirdListApiResponse>(
          "api/birds?sortBy=name&sortDirection=asc&page=1&pageSize=100"
        );
        if (version === farmRequestVersion.current) {
          setBirds(birdsResponse.items ?? []);
        }
      } catch {
        // Silently ignore bird list failure for filters
      }
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

  const loadCompetitions = useCallback(async (recoverSession = true) => {
    if (!selectedFarmId) return;
    const version = ++listRequestVersion.current;
    setListState("loading");
    setListError(undefined);
    setList(undefined);

    const query = buildCompetitionQuery(appliedFilters, page, PAGE_SIZE);

    try {
      const response = await client.current!.request<CompetitionListResponse>(`api/competitions?${query}`);
      if (version !== listRequestVersion.current) return;
      setList(response);
      setListState("ready");
    } catch (error) {
      if (version !== listRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === listRequestVersion.current) {
          await loadCompetitions(false);
          return;
        }
      }
      setListState("error");
      setListError(competitionListErrorMessage(error));
    }
  }, [appliedFilters, page, refresh, selectedFarmId]);

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
    void loadCompetitions();
    return () => {
      listRequestVersion.current += 1;
    };
  }, [farmState, loadCompetitions, selectedFarmId, status]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateFilterDates(fromDate, toDate);
    if (validationError) {
      setDateError(validationError);
      return;
    }
    setDateError(undefined);
    setPage(1);
    setAppliedFilters({
      birdId: birdId || undefined,
      category: category || undefined,
      fromDate: fromDate || undefined,
      search: search || undefined,
      toDate: toDate || undefined
    });
  }

  function handleClearFilters() {
    setSearch("");
    setCategory("");
    setBirdId("");
    setFromDate("");
    setToDate("");
    setDateError(undefined);
    setPage(1);
    setAppliedFilters({});
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return (
      <AppLoadingState
        activeNav="competitions"
        email={session?.email}
        farmName={farmName}
        label="Preparando competições"
        message="Consultando o criatório selecionado."
      />
    );
  }

  if (status === "unauthenticated") {
    return (
      <StateCard
        actionHref="/login"
        actionLabel="Entrar"
        heading="Entre para consultar as competições"
        message="Sua sessão é necessária para visualizar as competições do criatório."
      />
    );
  }

  if (status === "forbidden" || status === "error") {
    return (
      <StateCard
        heading="Não foi possível abrir as competições"
        message="Sua sessão não conseguiu acessar esta área. Tente novamente."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!session) return null;

  if (farmState === "loading") {
    return (
      <AppLoadingState
        activeNav="competitions"
        email={session.email}
        farmName={farmName}
        label="Preparando competições"
        message="Consultando o criatório selecionado."
      />
    );
  }

  if (farmState === "blocked") {
    return (
      <AuthenticatedShell activeNav="competitions" email={session.email} farmName={farmName}>
        <StateCard
          actionHref="/onboarding/criatorio/selecionar"
          actionLabel="Selecionar criatório"
          heading="Selecione um criatório"
          message={farmError ?? "Escolha um criatório para consultar as competições."}
        />
      </AuthenticatedShell>
    );
  }

  if (farmState === "error") {
    return (
      <AuthenticatedShell activeNav="competitions" email={session.email} farmName={farmName}>
        <StateCard
          heading="Não foi possível consultar o criatório"
          message={farmError ?? "Tente novamente para continuar."}
          onRetry={() => void loadFarm()}
        />
      </AuthenticatedShell>
    );
  }

  const isFiltered = hasAnyFilter(appliedFilters);

  return (
    <AuthenticatedShell activeNav="competitions" email={session.email} farmName={farmName}>
      <main className="document-wizard-page competition-history-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb">
          <Link href="/dashboard">Painel</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">Competições</span>
        </nav>

        <header className="document-wizard-header">
          <div>
            <p className="eyebrow">Competições · {farmName}</p>
            <h1>Competições</h1>
            <p>Consulte as participações e resultados das aves do criatório selecionado.</p>
          </div>
          <Link className="auth-primary-action document-wizard-emit-link" href="/competicoes/nova">
            Registrar competição
          </Link>
        </header>

        <section
          aria-busy={listState === "loading"}
          aria-labelledby="titulo-lista-competicoes"
          className="document-history-results document-wizard-card"
        >
          <header className="document-history-results-heading">
            <div>
              <p className="eyebrow">Histórico geral</p>
              <h2 id="titulo-lista-competicoes">Todas as competições</h2>
              <p>Resultados e eventos cadastrados no criatório selecionado.</p>
            </div>
          </header>

          <form className="competition-filter-form" onSubmit={handleFilterSubmit}>
            <div className="competition-filter-grid">
              <label className="competition-filter-field" htmlFor="filtro-busca">
                <span>Buscar</span>
                <input
                  id="filtro-busca"
                  maxLength={100}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou local..."
                  type="search"
                  value={search}
                />
              </label>

              <label className="competition-filter-field" htmlFor="filtro-ave">
                <span>Ave</span>
                <select
                  id="filtro-ave"
                  onChange={(event) => setBirdId(event.target.value)}
                  value={birdId}
                >
                  <option value="">Todas as aves</option>
                  {birds.map((b) => (
                    <option key={b.birdId} value={b.birdId}>
                      {b.name}{b.ringNumber ? ` (${b.ringNumber})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="competition-filter-field" htmlFor="filtro-categoria">
                <span>Categoria</span>
                <input
                  id="filtro-categoria"
                  maxLength={200}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Ex.: Canto, Porte..."
                  type="text"
                  value={category}
                />
              </label>

              <label className="competition-filter-field" htmlFor="filtro-data-inicial">
                <span>Data inicial</span>
                <input
                  id="filtro-data-inicial"
                  onChange={(event) => setFromDate(event.target.value)}
                  type="date"
                  value={fromDate}
                />
              </label>

              <label className="competition-filter-field" htmlFor="filtro-data-final">
                <span>Data final</span>
                <input
                  id="filtro-data-final"
                  onChange={(event) => setToDate(event.target.value)}
                  type="date"
                  value={toDate}
                />
              </label>
            </div>

            {dateError && (
              <p className="competition-filter-error" role="alert">
                {dateError}
              </p>
            )}

            <div className="competition-filter-actions">
              <button className="auth-primary-action" type="submit">
                Filtrar
              </button>
              {(isFiltered || search || category || birdId || fromDate || toDate) && (
                <button className="auth-secondary-action" onClick={handleClearFilters} type="button">
                  Limpar filtros
                </button>
              )}
            </div>
          </form>

          {listState === "loading" && (
            <div className="document-history-state" role="status">
              <span aria-hidden="true" className="document-preview-dialog-spinner" />
              <strong>Consultando competições…</strong>
              <span>Buscando os registros do criatório selecionado.</span>
            </div>
          )}

          {listState === "error" && (
            <div className="document-history-state is-error" role="alert">
              <strong>Não foi possível consultar as competições</strong>
              <span>{listError}</span>
              <button className="auth-secondary-action" onClick={() => void loadCompetitions()} type="button">
                Tentar novamente
              </button>
            </div>
          )}

          {listState === "ready" && list?.items.length === 0 && (
            <div className="document-history-state" role="status">
              <strong>{isFiltered ? "Nenhuma competição encontrada" : "Nenhuma competição registrada"}</strong>
              <span>
                {isFiltered
                  ? "Não foram encontradas competições com os filtros selecionados. Altere os critérios ou limpe os filtros."
                  : "Quando você registrar a participação de uma ave em competições, os resultados aparecerão aqui."}
              </span>
              {isFiltered ? (
                <button className="auth-secondary-action" onClick={handleClearFilters} type="button">
                  Limpar filtros
                </button>
              ) : (
                <Link className="auth-primary-action" href="/competicoes/nova">
                  Registrar primeira competição
                </Link>
              )}
            </div>
          )}

          {listState === "ready" && list && list.items.length > 0 && (
            <>
              <ul aria-label="Competições do criatório" className="document-history-list competition-history-list">
                {list.items.map((item: CompetitionListItem) => {
                  const detailHref = `/plantel/aves/${encodeURIComponent(item.bird.birdId)}/competicoes/${encodeURIComponent(item.competitionId)}`;
                  const placementLabel = formatPlacement(item.placement);

                  return (
                    <li key={item.competitionId}>
                      <Link
                        aria-label={`Ver detalhes da competição ${item.name} da ave ${item.bird.name}`}
                        className="document-history-item competition-history-item"
                        href={detailHref}
                      >
                        <span aria-hidden="true" className="document-history-item-icon">
                          <DashboardIcon name="trophy" />
                        </span>
                        <span className="document-history-item-main">
                          <span className="document-history-item-title">
                            <strong>{item.name}</strong>
                            {placementLabel && (
                              <span className="competition-placement-badge">{placementLabel}</span>
                            )}
                          </span>
                          <p>
                            <strong>Ave:</strong> {item.bird.name}
                            {item.bird.ringNumber ? ` · anilha ${item.bird.ringNumber}` : " · sem anilha informada"}
                          </p>
                          <small>
                            {formatCompetitionDate(item.date)}
                            {item.category ? ` · ${item.category}` : ""}
                            {item.location ? ` · ${item.location}` : ""}
                          </small>
                        </span>
                        <span className="document-history-item-actions">
                          <span className="auth-secondary-action">
                            Ver detalhes <span aria-hidden="true">›</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {list.totalPages > 1 && (
                <nav aria-label="Paginação das competições" className="document-history-pagination">
                  <button
                    aria-label="Página anterior"
                    className="auth-secondary-action"
                    disabled={list.page <= 1}
                    onClick={() => setPage(list.page - 1)}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span aria-live="polite">
                    Página {list.page} de {list.totalPages} · {list.totalCount} registros
                  </span>
                  <button
                    aria-label="Próxima página"
                    className="auth-secondary-action"
                    disabled={list.page >= list.totalPages}
                    onClick={() => setPage(list.page + 1)}
                    type="button"
                  >
                    Próxima
                  </button>
                </nav>
              )}
            </>
          )}
        </section>

        <p className="auth-footer">
          As competições são consultadas no contexto do criatório selecionado.
        </p>
      </main>
    </AuthenticatedShell>
  );
}
