"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../../components/brand";
import { SpeciesSummary } from "../../components/species-selector";

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
type BirdSortField = "name" | "ringNumber" | "birthDate" | "species" | "sex" | "status" | "createdAt";
type BirdSortDirection = "asc" | "desc";
type ListState = "error" | "loading" | "ready";
type FarmState = "blocked" | "error" | "loading" | "ready";

interface BirdListItem {
  ageInYears: number | null;
  birthDate: string | null;
  birdId: string;
  identificationPending: boolean;
  name: string;
  ringNumber: string | null;
  sex: BirdSex;
  speciesId: string;
  speciesPopularName: string;
  speciesScientificName: string;
  status: BirdStatus;
}

interface BirdListResponse {
  breedingFarmId: string;
  items: BirdListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface BirdFilters {
  identificationPending: "" | "false" | "true";
  page: number;
  search: string;
  sex: "" | BirdSex;
  sortBy: BirdSortField;
  sortDirection: BirdSortDirection;
  speciesId: string;
  speciesName: string;
  status: "" | BirdStatus;
}

type SpeciesFilterSelection = Pick<SpeciesSummary, "popularName" | "scientificName" | "speciesId">;

const defaultFilters: BirdFilters = {
  identificationPending: "",
  page: 1,
  search: "",
  sex: "",
  sortBy: "name",
  sortDirection: "asc",
  speciesId: "",
  speciesName: "",
  status: ""
};

const birdStatuses: Array<{ label: string; value: BirdStatus }> = [
  { label: "Ativas", value: "Active" },
  { label: "Arquivadas", value: "Archived" },
  { label: "Transferidas", value: "Transferred" },
  { label: "Falecidas", value: "Deceased" },
  { label: "Escapadas", value: "Escaped" }
];

const birdSortFields: Array<{ label: string; value: BirdSortField }> = [
  { label: "Nome", value: "name" },
  { label: "Anilha", value: "ringNumber" },
  { label: "Nascimento", value: "birthDate" },
  { label: "Espécie", value: "species" },
  { label: "Sexo", value: "sex" },
  { label: "Situação", value: "status" },
  { label: "Cadastro mais recente", value: "createdAt" }
];

function isBirdSex(value: string): value is BirdSex {
  return value === "Female" || value === "Male" || value === "Unknown";
}

function isBirdStatus(value: string): value is BirdStatus {
  return birdStatuses.some((status) => status.value === value);
}

function isSortField(value: string): value is BirdSortField {
  return birdSortFields.some((field) => field.value === value);
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseFilters(search: string): BirdFilters {
  const params = new URLSearchParams(search);
  const sex = params.get("sex") ?? "";
  const status = params.get("status") ?? "";
  const sortBy = params.get("sortBy") ?? "";
  const sortDirection = params.get("sortDirection") ?? "";
  const identificationPending = params.get("identificationPending") ?? "";
  const speciesId = params.get("speciesId") ?? "";

  return {
    identificationPending: identificationPending === "true" || identificationPending === "false" ? identificationPending : "",
    page: parsePage(params.get("page")),
    search: params.get("search")?.trim() ?? "",
    sex: isBirdSex(sex) ? sex : "",
    sortBy: isSortField(sortBy) ? sortBy : "name",
    sortDirection: sortDirection === "desc" ? "desc" : "asc",
    speciesId: speciesId.trim(),
    speciesName: speciesId.trim() ? params.get("speciesName")?.trim() ?? "" : "",
    status: isBirdStatus(status) ? status : ""
  };
}

function filtersToQuery(filters: BirdFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.sex) params.set("sex", filters.sex);
  if (filters.speciesId) {
    params.set("speciesId", filters.speciesId);
    if (filters.speciesName) params.set("speciesName", filters.speciesName);
  }
  if (filters.status) params.set("status", filters.status);
  if (filters.identificationPending) params.set("identificationPending", filters.identificationPending);
  if (filters.sortBy !== "name") params.set("sortBy", filters.sortBy);
  if (filters.sortDirection !== "asc") params.set("sortDirection", filters.sortDirection);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

function sexLabel(sex: BirdSex): string {
  if (sex === "Female") return "Fêmea";
  if (sex === "Male") return "Macho";
  return "Não identificado";
}

function statusLabel(status: BirdStatus): string {
  return birdStatuses.find((item) => item.value === status)?.label.replace(/s$/, "") ?? status;
}

function formatDate(value: string | null): string {
  if (!value) return "Não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Não informado" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function AccessState({
  actionHref = "/login",
  actionLabel = "Voltar para o login",
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
    <main className="auth-page onboarding-page bird-list-page">
      <a className="skip-link" href="#conteudo-lista-aves">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell bird-list-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-estado-lista-aves" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-lista-aves">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-estado-lista-aves" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <a className="text-action" href={actionHref}>{actionLabel}</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function BirdListLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page onboarding-page bird-list-page">
      <a className="skip-link" href="#conteudo-lista-aves">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell bird-list-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-lista-aves" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content" id="conteudo-lista-aves">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function SpeciesFilter({
  client,
  disabled,
  onClear,
  onSelected,
  onSessionExpired,
  selection
}: Readonly<{
  client: ApiClient;
  disabled: boolean;
  onClear: () => void;
  onSelected: (species: SpeciesFilterSelection) => void;
  onSessionExpired: () => void;
  selection?: SpeciesFilterSelection;
}>) {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [options, setOptions] = useState<SpeciesSummary[]>([]);
  const [query, setQuery] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [searchState, setSearchState] = useState<"empty" | "error" | "idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (selection) return;

    const controller = new AbortController();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setOptions([]);
      setErrorMessage(undefined);
      setSearchState("idle");
      return () => controller.abort();
    }

    setSearchState("loading");
    setErrorMessage(undefined);
    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await client.request<SpeciesSummary[]>(
          `api/species?search=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setOptions(results);
        setSearchState(results.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired();
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setErrorMessage("Sua conta não tem permissão para consultar o catálogo de espécies.");
          setSearchState("error");
          return;
        }
        setErrorMessage(error instanceof ApiError && error.status >= 500
          ? "A busca de espécies está indisponível. Tente novamente em instantes."
          : "Não foi possível buscar espécies agora.");
        setSearchState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [client, onSessionExpired, query, reloadVersion, selection]);

  return (
    <div className="bird-species-filter">
      <span className="bird-filter-label" id="bird-species-filter-label">Espécie</span>
      {selection ? (
        <div className="bird-species-filter-selected" role="status">
          <span>
            <strong>{selection.popularName}</strong>
            <em>{selection.scientificName}</em>
          </span>
          <button className="text-action" disabled={disabled} onClick={onClear} type="button">Trocar espécie</button>
        </div>
      ) : (
        <>
          <div className="bird-filter-search-control">
            <input
              aria-controls="bird-species-filter-options"
              aria-describedby="bird-species-filter-help"
              aria-labelledby="bird-species-filter-label"
              autoComplete="off"
              disabled={disabled}
              id="bird-species-filter-search"
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: Sabiá ou Turdus"
              type="search"
              value={query}
            />
            {query && <button aria-label="Limpar busca de espécie" className="bird-filter-search-clear" disabled={disabled} onClick={() => setQuery("")} type="button">×</button>}
          </div>
          <p className="bird-filter-help" id="bird-species-filter-help">Digite pelo menos dois caracteres para consultar.</p>
          <div aria-live="polite" className="bird-filter-results" id="bird-species-filter-options">
            {searchState === "loading" && <p role="status">Buscando espécies…</p>}
            {searchState === "idle" && <p role="status">Nenhuma espécie filtrada.</p>}
            {searchState === "empty" && <p role="status">Nenhuma espécie encontrada.</p>}
            {searchState === "error" && (
              <div className="bird-filter-error">
                <p role="alert">{errorMessage}</p>
                <button className="auth-secondary-action" disabled={disabled} onClick={() => setReloadVersion((value) => value + 1)} type="button">Tentar novamente</button>
              </div>
            )}
            {searchState === "ready" && (
              <ul aria-label="Opções de espécie" className="bird-filter-options" role="listbox">
                {options.slice(0, 8).map((species) => (
                  <li key={species.speciesId}>
                    <button
                      onClick={() => {
                        onSelected(species);
                        setQuery("");
                        setOptions([]);
                        setSearchState("idle");
                      }}
                      role="option"
                      type="button"
                    >
                      <strong>{species.popularName}</strong>
                      <em>{species.scientificName}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BirdFilterSelect({
  disabled,
  id,
  label,
  onChange,
  options,
  value
}: Readonly<{
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}>) {
  return (
    <label className="bird-filter-select" htmlFor={id}>
      <span>{label}</span>
      <select disabled={disabled} id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BirdCard({ bird }: Readonly<{ bird: BirdListItem }>) {
  return (
    <li>
      <article aria-label={`Ave ${bird.name}`} className="bird-list-card">
        <div className="bird-list-card-heading">
          <div>
            <h2>{bird.name}</h2>
            <p>{bird.speciesPopularName}</p>
            <em>{bird.speciesScientificName}</em>
          </div>
          <span className={`bird-status-badge bird-status-${bird.status.toLowerCase()}`}>{statusLabel(bird.status)}</span>
        </div>

        <dl className="bird-list-card-details">
          <div><dt>Sexo</dt><dd>{sexLabel(bird.sex)}</dd></div>
          <div><dt>Nascimento</dt><dd>{formatDate(bird.birthDate)}</dd></div>
          <div><dt>Idade</dt><dd>{bird.ageInYears === null ? "Não informado" : `${bird.ageInYears} ${bird.ageInYears === 1 ? "ano" : "anos"}`}</dd></div>
        </dl>

        <div className={`bird-identification${bird.identificationPending ? " is-pending" : ""}`}>
          <span aria-hidden="true">{bird.identificationPending ? "!" : "#"}</span>
          <strong>{bird.identificationPending ? "Identificação pendente" : `Anilha ${bird.ringNumber}`}</strong>
        </div>
      </article>
    </li>
  );
}

function BirdListState({
  error,
  hasActiveFilters,
  onClearFilters,
  onRetry,
  state
}: Readonly<{
  error?: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onRetry: () => void;
  state: ListState;
}>) {
  if (state === "loading") {
    return (
      <div aria-busy="true" aria-live="polite" className="bird-list-state bird-list-loading" role="status">
        <span className="bird-loading-dot" aria-hidden="true" />
        <strong>Carregando aves</strong>
        <span>Buscando os registros do criatório selecionado.</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bird-list-state bird-list-error" role="alert">
        <strong>Não foi possível carregar o plantel</strong>
        <span>{error ?? "Tente novamente para consultar as aves."}</span>
        <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="bird-list-state bird-list-empty" role="status">
      <span aria-hidden="true" className="bird-empty-mark">⌁</span>
      <strong>{hasActiveFilters ? "Nenhuma ave encontrada" : "Seu plantel ainda está vazio"}</strong>
      <span>{hasActiveFilters
        ? "Ajuste ou limpe os filtros para ver outros registros."
        : "Cadastre sua primeira ave para começar a organizar o plantel."}</span>
      {hasActiveFilters
        ? <button className="auth-secondary-action" onClick={onClearFilters} type="button">Limpar filtros</button>
        : <a className="auth-primary-action" href="/plantel/aves/novo">Cadastrar primeira ave</a>}
    </div>
  );
}

function BirdPagination({
  onPageChange,
  page,
  totalPages
}: Readonly<{ onPageChange: (page: number) => void; page: number; totalPages: number }>) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Paginação do plantel" className="bird-pagination">
      <button aria-label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">Anterior</button>
      <span aria-live="polite">Página {page} de {totalPages}</span>
      <button aria-label="Próxima página" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">Próxima</button>
    </nav>
  );
}

function BirdListPage() {
  const { refresh } = useAuth();
  const [birds, setBirds] = useState<BirdListItem[]>([]);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [filters, setFilters] = useState<BirdFilters>(defaultFilters);
  const [filtersReady, setFiltersReady] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [listError, setListError] = useState<string>();
  const [listState, setListState] = useState<ListState>("loading");
  const [searchDraft, setSearchDraft] = useState("");
  const [speciesSelection, setSpeciesSelection] = useState<SpeciesFilterSelection>();
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const listRequestVersion = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const handleSessionExpired = useCallback(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const readUrlState = () => {
      const nextFilters = parseFilters(window.location.search);
      setFilters(nextFilters);
      setSearchDraft(nextFilters.search);
      if (!nextFilters.speciesId) setSpeciesSelection(undefined);
      setFiltersReady(true);
    };

    readUrlState();
    window.addEventListener("popstate", readUrlState);
    return () => window.removeEventListener("popstate", readUrlState);
  }, []);

  const commitFilters = useCallback((nextFilters: BirdFilters, replace = false) => {
    const query = filtersToQuery(nextFilters);
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    setFilters(nextFilters);
    setSearchDraft(nextFilters.search);
  }, []);

  const loadFarm = useCallback(async (recoverSession = true) => {
    const requestVersion = farmRequestVersion.current + 1;
    farmRequestVersion.current = requestVersion;
    setFarmState("loading");
    setFarmError(undefined);

    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (requestVersion !== farmRequestVersion.current) return;

      if (!selection.selectedBreedingFarmId) {
        setFarmState("blocked");
        setFarmError(selection.breedingFarms.length > 0
          ? "Selecione um criatório para consultar o plantel."
          : "Crie seu primeiro criatório antes de consultar o plantel.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name);
      setFarmState("ready");
    } catch (error) {
      if (requestVersion !== farmRequestVersion.current) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) await loadFarm(false);
        return;
      }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setFarmState("blocked");
        setFarmError("Sua conta não tem permissão para acessar o criatório selecionado.");
        return;
      }
      setFarmState("error");
      setFarmError(error instanceof ApiError && error.status >= 500
        ? "O serviço está indisponível no momento. Tente novamente em instantes."
        : "Verifique sua conexão e tente novamente.");
    }
  }, [refresh]);

  useEffect(() => {
    void loadFarm();
  }, [loadFarm]);

  useEffect(() => {
    if (farmState !== "ready" || !filtersReady) return;

    const requestVersion = listRequestVersion.current + 1;
    listRequestVersion.current = requestVersion;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.sex) params.set("sex", filters.sex);
    if (filters.speciesId) params.set("speciesId", filters.speciesId);
    if (filters.status) params.set("status", filters.status);
    if (filters.identificationPending) params.set("identificationPending", filters.identificationPending);
    params.set("sortBy", filters.sortBy);
    params.set("sortDirection", filters.sortDirection);
    params.set("page", String(filters.page));
    params.set("pageSize", "20");

    setListState("loading");
    setListError(undefined);

    async function loadBirds() {
      try {
        const response = await client.current!.request<BirdListResponse>(`api/birds?${params.toString()}`, { signal: controller.signal });
        if (controller.signal.aborted || requestVersion !== listRequestVersion.current) return;
        setBirds(response.items);
        setTotalCount(response.totalCount);
        setTotalPages(response.totalPages);
        setListState("ready");
      } catch (error) {
        if (controller.signal.aborted || requestVersion !== listRequestVersion.current) return;
        if (error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await refresh();
          return;
        }
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          setFarmState("blocked");
          setFarmError("Selecione novamente um criatório para consultar o plantel.");
          return;
        }
        setListError(error instanceof ApiError && error.status >= 500
          ? "O serviço está indisponível no momento. Tente novamente em instantes."
          : "Verifique sua conexão e tente novamente.");
        setListState("error");
      }
    }

    void loadBirds();
    return () => controller.abort();
  }, [filters, filtersReady, farmState, refresh, reloadVersion]);

  function changeFilter(field: keyof BirdFilters, value: string) {
    const nextFilters = { ...filters, [field]: value, page: 1 } as BirdFilters;
    commitFilters(nextFilters);
  }

  function clearFilters() {
    setSpeciesSelection(undefined);
    commitFilters({ ...defaultFilters });
  }

  function hasActiveFilters(): boolean {
    return Boolean(filters.search || filters.sex || filters.speciesId || filters.status || filters.identificationPending);
  }

  function activeFilterCount(): number {
    return [filters.search, filters.sex, filters.speciesId, filters.status, filters.identificationPending].filter(Boolean).length;
  }

  if (farmState === "loading") {
    return <AccessState actionHref="/" actionLabel="Voltar para o início" heading="Verificando o criatório" message="Só um instante enquanto buscamos o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AccessState actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório antes de consultar o plantel."} />;
  }
  if (farmState === "error") {
    return <AccessState actionHref="/" actionLabel="Voltar para o início" heading="Não foi possível abrir o plantel" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} />;
  }

  const resultLabel = totalCount === 1 ? "1 ave encontrada" : `${totalCount} aves encontradas`;

  return (
    <BirdListLayout>
      <a className="auth-mobile-back" href="/" aria-label="Voltar para o início">←</a>
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <div className="bird-list-header">
        <div>
          <p className="eyebrow">Plantel{farmName ? ` · ${farmName}` : ""}</p>
          <h1 id="titulo-lista-aves">Aves do criatório</h1>
          <p className="lede">Encontre rapidamente seus registros e acompanhe as pendências de identificação.</p>
        </div>
        <a className="auth-primary-action bird-list-register-action" href="/plantel/aves/novo">Cadastrar ave</a>
      </div>

      <section aria-labelledby="titulo-busca-aves" className="bird-list-toolbar">
        <h2 className="sr-only" id="titulo-busca-aves">Buscar e filtrar aves</h2>
        <form className="bird-list-search-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); commitFilters({ ...filters, page: 1, search: searchDraft.trim() }); }}>
          <label htmlFor="bird-list-search">Buscar ave</label>
          <div className="bird-list-search-control">
            <input
              aria-describedby="bird-list-search-help"
              id="bird-list-search"
              maxLength={100}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchDraft(event.target.value)}
              placeholder="Nome, anilha ou espécie"
              type="search"
              value={searchDraft}
            />
            {searchDraft && <button aria-label="Limpar busca" className="bird-list-search-clear" onClick={() => { setSearchDraft(""); commitFilters({ ...filters, page: 1, search: "" }); }} type="button">×</button>}
            <button className="bird-list-search-submit" type="submit">Buscar</button>
          </div>
          <p id="bird-list-search-help">A busca consulta nome, anilha e espécie no criatório selecionado.</p>
        </form>

        <details className="bird-filter-panel" onToggle={(event) => setIsFilterPanelOpen(event.currentTarget.open)} open={isFilterPanelOpen}>
          <summary>Filtros e ordenação{activeFilterCount() > 0 && <span>{activeFilterCount()} ativo{activeFilterCount() === 1 ? "" : "s"}</span>}</summary>
          <div className="bird-filter-grid">
            <SpeciesFilter
              client={client.current!}
              disabled={listState === "loading"}
              onClear={() => {
                setSpeciesSelection(undefined);
                commitFilters({ ...filters, page: 1, speciesId: "", speciesName: "" });
              }}
              onSelected={(species) => {
                setSpeciesSelection(species);
                commitFilters({ ...filters, page: 1, speciesId: species.speciesId, speciesName: species.popularName });
              }}
              onSessionExpired={handleSessionExpired}
              selection={speciesSelection ?? (filters.speciesId ? { popularName: filters.speciesName || "Espécie selecionada", scientificName: "", speciesId: filters.speciesId } : undefined)}
            />
            <BirdFilterSelect
              disabled={listState === "loading"}
              id="bird-sex-filter"
              label="Sexo"
              onChange={(value) => changeFilter("sex", value)}
              options={[{ label: "Todos os sexos", value: "" }, { label: "Fêmeas", value: "Female" }, { label: "Machos", value: "Male" }, { label: "Não identificados", value: "Unknown" }]}
              value={filters.sex}
            />
            <BirdFilterSelect
              disabled={listState === "loading"}
              id="bird-status-filter"
              label="Situação"
              onChange={(value) => changeFilter("status", value)}
              options={[{ label: "Todas as situações", value: "" }, ...birdStatuses]}
              value={filters.status}
            />
            <BirdFilterSelect
              disabled={listState === "loading"}
              id="bird-identification-filter"
              label="Identificação"
              onChange={(value) => changeFilter("identificationPending", value)}
              options={[{ label: "Todas", value: "" }, { label: "Com anilha", value: "false" }, { label: "Pendente", value: "true" }]}
              value={filters.identificationPending}
            />
            <BirdFilterSelect
              disabled={listState === "loading"}
              id="bird-sort-filter"
              label="Ordenar por"
              onChange={(value) => changeFilter("sortBy", value)}
              options={birdSortFields}
              value={filters.sortBy}
            />
            <BirdFilterSelect
              disabled={listState === "loading"}
              id="bird-sort-direction"
              label="Direção"
              onChange={(value) => changeFilter("sortDirection", value)}
              options={[{ label: "Crescente", value: "asc" }, { label: "Decrescente", value: "desc" }]}
              value={filters.sortDirection}
            />
          </div>
          <button className="text-action bird-clear-filters" disabled={!hasActiveFilters() && filters.sortBy === "name" && filters.sortDirection === "asc"} onClick={clearFilters} type="button">Limpar filtros</button>
        </details>
      </section>

      <section aria-labelledby="titulo-resultados-aves" className="bird-list-results" aria-busy={listState === "loading"}>
        <div className="bird-list-results-heading">
          <h2 id="titulo-resultados-aves">Meu plantel</h2>
          <span aria-live="polite">{listState === "ready" ? resultLabel : ""}</span>
        </div>
        {listState === "ready" && birds.length > 0
          ? <ul aria-label="Aves cadastradas" className="bird-list-cards">{birds.map((bird) => <BirdCard bird={bird} key={bird.birdId} />)}</ul>
          : <BirdListState error={listError} hasActiveFilters={hasActiveFilters()} onClearFilters={clearFilters} onRetry={() => setReloadVersion((value) => value + 1)} state={listState} />}
        {listState === "ready" && <BirdPagination onPageChange={(page) => commitFilters({ ...filters, page })} page={filters.page} totalPages={totalPages} />}
      </section>

      <p className="auth-footer">Os dados exibidos ficam vinculados somente ao criatório selecionado.</p>
    </BirdListLayout>
  );
}

function BirdListScreen() {
  const { error, refresh, status } = useAuth();

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AccessState actionHref="/" actionLabel="Voltar para o início" heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
  }
  if (status === "error") {
    return <AccessState heading="Não foi possível abrir o plantel" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  }
  if (status === "forbidden") {
    return <AccessState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para consultar o plantel."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  }
  if (status === "unauthenticated") {
    return <AccessState actionHref="/login" actionLabel="Ir para o login" heading="Entre para consultar o plantel" message="Faça login para visualizar as aves do seu criatório." />;
  }

  return <BirdListPage />;
}

export default function BirdListPageRoute() {
  return (
    <AuthProvider>
      <BirdListScreen />
    </AuthProvider>
  );
}
