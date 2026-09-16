"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../lib/http/api-client";
import { AppLoadingContent, AppLoadingState } from "../../components/app-loading-state";
import { BrandLockup, BrandPanel } from "../../components/brand";
import { AuthenticatedShell } from "../../components/authenticated-shell";
import { DashboardIcon } from "../../components/dashboard-icons";
import type { DashboardIconName } from "../../components/dashboard-icons";
import { SpeciesSummary } from "../../components/species-selector";
import { resolveBirdImageUrl } from "./bird-image";
import { BirdStatusAction } from "./bird-status-action";

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
  imageUrl?: string | null;
  isDefaultImage?: boolean;
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
  status: "Active"
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
  const status = params.get("status");
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
    status: status === null ? "Active" : isBirdStatus(status) ? status : ""
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
            <Link className="text-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function BirdListLayout({ children, email, farmName }: Readonly<{ children: React.ReactNode; email: string; farmName: string }>) {
  return (
    <AuthenticatedShell activeNav="birds" email={email} farmName={farmName}>
      <div className="bird-list-view">{children}</div>
    </AuthenticatedShell>
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
  const filterRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [options, setOptions] = useState<SpeciesSummary[]>([]);
  const [query, setQuery] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [searchState, setSearchState] = useState<"empty" | "error" | "idle" | "loading" | "ready">("idle");

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (filterRef.current?.contains(event.target as Node)) return;
      setQuery("");
      setOptions([]);
      setErrorMessage(undefined);
      setSearchState("idle");
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

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
    <div className="bird-species-filter" ref={filterRef}>
      <span className="bird-filter-label" id="bird-species-filter-label">Espécie</span>
      <span aria-hidden="true" className="bird-filter-mobile-icon bird-filter-mobile-icon-leaf"><DashboardIcon name="leaf" /></span>
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
          <div aria-live="polite" className={`bird-filter-results${searchState === "ready" ? " is-overlay" : ""}`} id="bird-species-filter-options">
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
  className = "",
  disabled,
  id,
  label,
  mobileIcon,
  onChange,
  options,
  value
}: Readonly<{
  className?: string;
  disabled: boolean;
  id: string;
  label: string;
  mobileIcon?: DashboardIconName;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}>) {
  return (
    <label className={`bird-filter-select${className ? ` ${className}` : ""}`} htmlFor={id}>
      <span className="bird-filter-label">{label}</span>
      {mobileIcon && <span aria-hidden="true" className={`bird-filter-mobile-icon bird-filter-mobile-icon-${mobileIcon}`}><DashboardIcon name={mobileIcon} /></span>}
      <select disabled={disabled} id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BirdActionMenu({
  bird,
  client,
  onStatusChanged,
  prepareStatusMutation,
  onSessionExpired
}: Readonly<{
  bird: BirdListItem;
  client: ApiClient;
  onSessionExpired: () => Promise<unknown> | void;
  onStatusChanged: () => void;
  prepareStatusMutation: () => Promise<void>;
}>) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<"above" | "below">("below");

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (menuRef.current) menuRef.current.open = false;
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMenuPlacement("below");
      return;
    }

    function updateMenuPlacement() {
      const trigger = menuRef.current?.querySelector("summary");
      const menu = menuPanelRef.current;
      if (!trigger || !menu) return;

      const triggerBounds = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - triggerBounds.bottom;
      const spaceAbove = triggerBounds.top;
      setMenuPlacement(menuHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below");
    }

    const frame = window.setTimeout(updateMenuPlacement, 0);
    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [isOpen]);

  return (
    <details className="bird-row-actions" onToggle={(event) => setIsOpen(event.currentTarget.open)} ref={menuRef}>
      <summary aria-label={`Abrir ações de ${bird.name}`} role="button">⋯</summary>
      <div className="bird-row-actions-menu" data-placement={menuPlacement} ref={menuPanelRef}>
        <Link aria-label={`Ver detalhes de ${bird.name}`} className="bird-row-action" href={`/plantel/aves/${bird.birdId}`}>
          <DashboardIcon name="eye" />
          <span>Ver detalhes</span>
        </Link>
        <Link aria-label={`Editar ${bird.name}`} className="bird-row-action" href={`/plantel/aves/${bird.birdId}/editar`}>
          <DashboardIcon name="edit" />
          <span>Editar</span>
        </Link>
        <div aria-hidden="true" className="bird-row-action-divider" />
        <Link className="bird-row-action" href={`/transferencias/nova?birdId=${encodeURIComponent(bird.birdId)}`}>
          <DashboardIcon name="transfer" />
          <span>Iniciar transferência</span>
        </Link>
        <button className="bird-row-action" disabled title="Módulo em desenvolvimento" type="button">
          <DashboardIcon name="trophy" />
          <span>Registrar competição</span>
        </button>
        <div aria-hidden="true" className="bird-row-action-divider" />
        {bird.status === "Active" && (
          <BirdStatusAction
            birdBirthDate={bird.birthDate}
            birdId={bird.birdId}
            birdName={bird.name}
            client={client}
            onSessionExpired={onSessionExpired}
            onUpdated={onStatusChanged}
            prepareMutation={prepareStatusMutation}
          />
        )}
      </div>
    </details>
  );
}

function BirdCard({
  bird,
  client,
  onSessionExpired,
  onStatusChanged,
  prepareStatusMutation
}: Readonly<{
  bird: BirdListItem;
  client: ApiClient;
  onSessionExpired: () => Promise<unknown> | void;
  onStatusChanged: () => void;
  prepareStatusMutation: () => Promise<void>;
}>) {
  return (
    <li>
      <article aria-label={`Ave ${bird.name}`} className="bird-list-card">
        <span aria-hidden="true" className="bird-list-card-photo">
          <img alt="" src={resolveBirdImageUrl(bird.imageUrl)} />
        </span>
        <div className="bird-list-card-name">
          <h2><Link aria-label={`Abrir ficha de ${bird.name}`} href={`/plantel/aves/${bird.birdId}`}>{bird.name}</Link></h2>
          <span className="bird-list-card-mobile-species">{bird.speciesPopularName}</span>
        </div>
        <span aria-label={`Sexo: ${sexLabel(bird.sex)}`} className="bird-list-card-sex">
          <span aria-hidden="true" className="bird-list-card-field-icon">{bird.sex === "Female" ? "♀" : bird.sex === "Male" ? "♂" : "•"}</span>
          {sexLabel(bird.sex)}
        </span>
        <span aria-label={`Espécie ou raça: ${bird.speciesPopularName}`} className="bird-list-card-species">
          <DashboardIcon name="leaf" />
          {bird.speciesPopularName}
        </span>
        <span aria-label={`Anilha: ${bird.identificationPending ? "pendente" : bird.ringNumber ?? "não informada"}`} className={`bird-list-card-ring${bird.identificationPending ? " is-pending" : ""}`}>
          <span aria-hidden="true" className="bird-list-card-field-icon">⌑</span>
          <span aria-hidden="true" className="bird-list-card-ring-value-desktop">{bird.identificationPending ? "—" : bird.ringNumber ?? "—"}</span>
          <span aria-hidden="true" className="bird-list-card-ring-value-mobile">{bird.identificationPending ? "Sem anilha" : `Anilha: ${bird.ringNumber ?? "não informada"}`}</span>
        </span>
        <span aria-label={`Status: ${statusLabel(bird.status)}`} className={`bird-status-badge bird-status-${bird.status.toLowerCase()}`}><span aria-hidden="true" />{statusLabel(bird.status)}</span>
        <span aria-label={`Nascimento: ${formatDate(bird.birthDate)}`} className="bird-list-card-birth">{formatDate(bird.birthDate)}</span>
        <span className={`bird-identification${bird.identificationPending ? " is-pending" : ""}`}>
          <span aria-hidden="true">{bird.identificationPending ? "!" : "#"}</span>
          <strong>{bird.identificationPending ? "Identificação pendente" : `Anilha ${bird.ringNumber}`}</strong>
        </span>
        <Link aria-label={`Ver detalhes de ${bird.name}`} className="bird-list-card-arrow" href={`/plantel/aves/${bird.birdId}`}><span aria-hidden="true">›</span></Link>
        <BirdActionMenu
          bird={bird}
          client={client}
          onSessionExpired={onSessionExpired}
          onStatusChanged={onStatusChanged}
          prepareStatusMutation={prepareStatusMutation}
        />
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
      <AppLoadingContent label="Carregando aves" message="Buscando os registros do criatório selecionado." />
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
        : <Link className="auth-primary-action" href="/plantel/aves/novo">Cadastrar primeira ave</Link>}
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

function birdsReportError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return "Os filtros do relatório não foram aceitos. Revise a situação, o sexo ou a espécie.";
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para visualizar o relatório.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para gerar o relatório deste criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de gerar o relatório.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  if (error instanceof StaleTenantResponseError) return "O criatório selecionado mudou. Feche a prévia e tente novamente.";
  return "Não foi possível gerar a prévia do relatório. Tente novamente.";
}

function reportSexLabel(sex: BirdFilters["sex"]): string {
  if (sex === "Female") return "Fêmeas";
  if (sex === "Male") return "Machos";
  if (sex === "Unknown") return "Não identificados";
  return "Todos os sexos";
}

function BirdsReportDialog({
  client,
  farmName,
  filters,
  isMobileViewport,
  onClearFilters,
  onClose,
  onSessionExpired
}: Readonly<{
  client: ApiClient;
  farmName: string;
  filters: BirdFilters;
  isMobileViewport: boolean;
  onClearFilters: () => void;
  onClose: () => void;
  onSessionExpired: () => Promise<unknown> | void;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const [previewState, setPreviewState] = useState<"error" | "idle" | "loading" | "ready">("idle");
  const [previewError, setPreviewError] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();

  function releasePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    }
    setPreviewUrl(undefined);
  }

  function closeDialog() {
    abortControllerRef.current?.abort();
    releasePreview();
    onClose();
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeButtonRef.current?.focus();

    return () => {
      abortControllerRef.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previouslyFocused?.focus();
    };
  }, []);

  async function generatePreview() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    releasePreview();
    setPreviewState("loading");
    setPreviewError(undefined);

    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.sex) params.set("sex", filters.sex);
    if (filters.speciesId) params.set("speciesId", filters.speciesId);

    try {
      const blob = await client.requestBlob(`api/reports/birds/pdf${params.toString() ? `?${params.toString()}` : ""}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const nextUrl = URL.createObjectURL(blob);
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      setPreviewState("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) void onSessionExpired();
      setPreviewError(birdsReportError(error));
      setPreviewState("error");
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], iframe, select, input, [tabindex]:not([tabindex=\"-1\"])"
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

  const hasUnsupportedListFilters = Boolean(filters.search || filters.identificationPending);
  const speciesLabel = filters.speciesId ? filters.speciesName || "Espécie selecionada" : "Todas as espécies";

  return (
    <div
      className="bird-report-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
      role="presentation"
    >
      <section
        aria-describedby="bird-report-dialog-description"
        aria-labelledby="bird-report-dialog-title"
        aria-modal="true"
        className="bird-report-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className="bird-report-dialog-heading">
          <div>
            <p className="eyebrow">Relatório do criatório</p>
            <h2 id="bird-report-dialog-title">Prévia do relatório de aves</h2>
          </div>
          <button aria-label="Fechar prévia" className="bird-report-dialog-close" onClick={closeDialog} ref={closeButtonRef} type="button">×</button>
        </header>

        <p className="bird-report-dialog-intro" id="bird-report-dialog-description">
          Gere uma prévia temporária com os dados autorizados de <strong>{farmName}</strong>. O arquivo não é salvo no navegador.
        </p>

        <dl className="bird-report-dialog-filters">
          <div><dt>Situação</dt><dd>{filters.status ? statusLabel(filters.status) : "Todas as situações"}</dd></div>
          <div><dt>Sexo</dt><dd>{reportSexLabel(filters.sex)}</dd></div>
          <div><dt>Espécie</dt><dd>{speciesLabel}</dd></div>
        </dl>

        {hasUnsupportedListFilters && (
          <p className="bird-report-dialog-note" role="note">
            A busca por nome/anilha e o filtro de identificação pertencem somente à listagem e não alteram este relatório.
          </p>
        )}

        {previewState === "idle" && (
          <div className="bird-report-dialog-empty" role="status">
            <span aria-hidden="true" className="bird-report-dialog-mark"><DashboardIcon name="document" /></span>
            <div>
              <h3>Resumo do plantel</h3>
              <p>O documento reúne Matrizes, Filhotes, grupos por sexo e totais calculados pelo sistema.</p>
            </div>
            <button className="auth-primary-action" onClick={() => void generatePreview()} type="button">Gerar prévia do relatório</button>
          </div>
        )}

        {previewState === "loading" && (
          <div className="bird-report-dialog-loading" role="status" aria-live="polite">
            <span className="bird-report-dialog-spinner" aria-hidden="true" />
            <strong>Gerando prévia…</strong>
            <span>Consultando os dados autorizados do criatório.</span>
          </div>
        )}

        {previewState === "error" && (
          <div className="bird-report-dialog-error" role="alert">
            <strong>Não foi possível abrir a prévia</strong>
            <span>{previewError}</span>
            <button className="auth-secondary-action" onClick={() => void generatePreview()} type="button">Tentar novamente</button>
          </div>
        )}

        {previewState === "ready" && previewUrl && (
          <div className="bird-report-dialog-preview">
            {isMobileViewport ? (
              <div className="bird-report-dialog-mobile-preview" role="status">
                <span aria-hidden="true" className="bird-report-dialog-mobile-preview-mark">PDF</span>
                <strong>Prévia do relatório pronta</strong>
                <span>Abra o PDF em uma nova aba para visualizar o documento no celular.</span>
                <a className="auth-primary-action" href={previewUrl} rel="noopener noreferrer" target="_blank">Abrir prévia do PDF</a>
              </div>
            ) : (
              <iframe title="Prévia do relatório de aves cadastradas" src={previewUrl} />
            )}
            <div className="bird-report-dialog-actions">
              <a className="auth-primary-action" download="relatorio-aves-cadastradas.pdf" href={previewUrl}>Baixar relatório</a>
              <button className="auth-secondary-action" onClick={() => void generatePreview()} type="button">Gerar novamente</button>
            </div>
          </div>
        )}

        <footer className="bird-report-dialog-footer">
          <button className="text-action" onClick={() => { onClearFilters(); closeDialog(); }} type="button">Limpar filtros da listagem</button>
          <button className="auth-secondary-action" onClick={closeDialog} type="button">Fechar</button>
        </footer>
      </section>
    </div>
  );
}

function BirdListPage() {
  const { refresh, session } = useAuth();
  const [birds, setBirds] = useState<BirdListItem[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [filters, setFilters] = useState<BirdFilters>(defaultFilters);
  const [filtersReady, setFiltersReady] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);
  const [listError, setListError] = useState<string>();
  const [listState, setListState] = useState<ListState>("loading");
  const [mobileBirds, setMobileBirds] = useState<BirdListItem[]>([]);
  const [mobileLoadError, setMobileLoadError] = useState<string>();
  const [mobileLoadingMore, setMobileLoadingMore] = useState(false);
  const [mobileNextPage, setMobileNextPage] = useState(2);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(5);
  const [searchDraft, setSearchDraft] = useState("");
  const [speciesSelection, setSpeciesSelection] = useState<SpeciesFilterSelection>();
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const listRequestVersion = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const handleSessionExpired = useCallback(() => { void refresh(); }, [refresh]);
  const prepareStatusMutation = useCallback(async () => {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }, []);
  const handleStatusChanged = useCallback(() => {
    client.current?.clearCache();
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(max-width: 47.99rem)");
    if (!mediaQuery) return;
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener?.("change", updateViewport);
    return () => mediaQuery.removeEventListener?.("change", updateViewport);
  }, []);

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
        setMobileBirds(response.items);
        setMobileVisibleCount(5);
        setMobileNextPage(response.page + 1);
        setMobileLoadError(undefined);
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

  async function loadMoreBirds() {
    if (mobileLoadingMore || totalCount <= 5) return;

    if (mobileVisibleCount < mobileBirds.length) {
      setMobileVisibleCount((value) => Math.min(value + 5, mobileBirds.length));
      return;
    }

    if (mobileNextPage > totalPages) return;

    setMobileLoadingMore(true);
    setMobileLoadError(undefined);
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.sex) params.set("sex", filters.sex);
    if (filters.speciesId) params.set("speciesId", filters.speciesId);
    if (filters.status) params.set("status", filters.status);
    if (filters.identificationPending) params.set("identificationPending", filters.identificationPending);
    params.set("sortBy", filters.sortBy);
    params.set("sortDirection", filters.sortDirection);
    params.set("page", String(mobileNextPage));
    params.set("pageSize", "20");

    try {
      const response = await client.current!.request<BirdListResponse>(`api/birds?${params.toString()}`);
      setMobileBirds((current) => [...current, ...response.items]);
      setMobileVisibleCount((value) => value + 5);
      setMobileNextPage(response.page + 1);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await refresh();
      } else {
        setMobileLoadError("Não foi possível carregar mais aves agora.");
      }
    } finally {
      setMobileLoadingMore(false);
    }
  }

  const displayedBirds = isMobileViewport ? mobileBirds.slice(0, mobileVisibleCount) : birds;
  const canLoadMoreBirds = isMobileViewport && totalCount > 5 && (
    mobileVisibleCount < mobileBirds.length || mobileNextPage <= totalPages
  );

  if (!session) return null;

  if (farmState === "loading") {
    return <AppLoadingState activeNav="birds" email={session.email} farmName={farmName ?? "Criatório selecionado"} label="Carregando plantel" message="Buscando os registros do criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AccessState actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório antes de consultar o plantel."} />;
  }
  if (farmState === "error") {
    return <AccessState actionHref="/" actionLabel="Voltar para o início" heading="Não foi possível abrir o plantel" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} />;
  }

  const resultLabel = totalCount === 1 ? "1 ave encontrada" : `${totalCount} aves encontradas`;

  return (
    <BirdListLayout email={session.email} farmName={farmName ?? "Criatório selecionado"}>
      <nav aria-label="Navegação estrutural" className="bird-list-breadcrumb">
        <Link href="/dashboard">Painel</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Aves</span>
      </nav>

      <header className="bird-list-header">
        <div>
          <h1 id="titulo-lista-aves">Aves</h1>
          <p className="lede">Gerencie as aves cadastradas no seu criatório.</p>
        </div>
        <div className="bird-list-header-side">
          <button className="auth-secondary-action bird-list-report-action" onClick={() => setIsReportOpen(true)} type="button"><DashboardIcon name="document" /> Gerar relatório</button>
          <Link className="auth-primary-action bird-list-register-action" href="/plantel/aves/novo"><span aria-hidden="true">＋</span> Cadastrar ave</Link>
        </div>
      </header>

      <section aria-labelledby="titulo-busca-aves" className="bird-list-toolbar">
        <h2 className="sr-only" id="titulo-busca-aves">Buscar e filtrar aves</h2>
        <div className="bird-list-query-row">
          <aside aria-label="Resumo do plantel" className="bird-list-summary">
            <span aria-hidden="true" className="bird-list-summary-icon"><DashboardIcon name="bird" /></span>
            <div>
              <strong>{totalCount} {totalCount === 1 ? "ave cadastrada" : "aves cadastradas"}</strong>
              <p>Organize, acompanhe e mantenha o histórico do seu plantel sempre atualizado.</p>
            </div>
          </aside>

          <form className="bird-list-search-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); commitFilters({ ...filters, page: 1, search: searchDraft.trim() }); }}>
            <label className="sr-only" htmlFor="bird-list-search">Buscar ave</label>
            <div className="bird-list-search-control">
              <span aria-hidden="true" className="bird-list-search-icon"><DashboardIcon name="search" /></span>
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
              <button aria-label="Buscar" className="bird-list-search-submit" type="submit"><DashboardIcon name="search" /><span className="sr-only">Buscar</span></button>
            </div>
            <p id="bird-list-search-help">A busca consulta nome, anilha e espécie no criatório selecionado.</p>
          </form>
        </div>

        <details className="bird-filter-panel" onToggle={(event) => setIsFilterPanelOpen(event.currentTarget.open)} open={isFilterPanelOpen}>
          <summary aria-label={isFilterPanelOpen ? "Ocultar filtros" : "Mostrar mais filtros"}>
            <DashboardIcon name="filter" />
            <span className="bird-filter-panel-title">Filtros e ordenação</span>
            <span aria-hidden="true" className="bird-filter-panel-mobile-title">{isFilterPanelOpen ? "Ocultar filtros" : "Mais filtros"}</span>
            {activeFilterCount() > 0 && <span>{activeFilterCount()} ativo{activeFilterCount() === 1 ? "" : "s"}</span>}
          </summary>
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
              mobileIcon="gender"
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
              mobileIcon="tag"
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
              className="bird-filter-sort-control"
              value={filters.sortBy}
            />
            <BirdFilterSelect
              disabled={listState === "loading"}
              id="bird-sort-direction"
              label="Direção"
              onChange={(value) => changeFilter("sortDirection", value)}
              options={[{ label: "Crescente", value: "asc" }, { label: "Decrescente", value: "desc" }]}
              className="bird-filter-sort-control"
              value={filters.sortDirection}
            />
          </div>
          <button className="text-action bird-clear-filters" disabled={!hasActiveFilters() && filters.sortBy === "name" && filters.sortDirection === "asc"} onClick={clearFilters} type="button">Limpar filtros</button>
        </details>
      </section>

      <section aria-labelledby="titulo-resultados-aves" className="bird-list-results" aria-busy={listState === "loading"}>
        <div className="bird-list-results-heading">
          <div>
            <h2 id="titulo-resultados-aves"><span aria-hidden="true" className="bird-list-results-heading-icon"><DashboardIcon name="bird" /></span>{listState === "ready" ? resultLabel : "Aves cadastradas"}</h2>
            <span>Registros do criatório selecionado</span>
          </div>
          <label className="bird-list-inline-sort" htmlFor="bird-inline-sort">Ordenar por
            <select
              disabled={listState === "loading"}
              id="bird-inline-sort"
              onChange={(event) => changeFilter("sortBy", event.target.value)}
              value={filters.sortBy}
            >
              {birdSortFields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
            </select>
          </label>
        </div>
        {listState === "ready" && birds.length > 0 && (
          <div className="bird-list-table-heading">
            <span>Foto</span>
            <span>Nome</span>
            <span>Sexo</span>
            <span>Espécie/Raça</span>
            <span>Anilha</span>
            <span>Status</span>
            <span>Nascimento</span>
            <span>Ações</span>
          </div>
        )}
        {listState === "ready" && birds.length > 0
          ? <ul aria-label="Aves cadastradas" className="bird-list-cards">{displayedBirds.map((bird) => <BirdCard bird={bird} client={client.current!} key={bird.birdId} onSessionExpired={handleSessionExpired} onStatusChanged={handleStatusChanged} prepareStatusMutation={prepareStatusMutation} />)}</ul>
          : <BirdListState error={listError} hasActiveFilters={hasActiveFilters()} onClearFilters={clearFilters} onRetry={() => setReloadVersion((value) => value + 1)} state={listState} />}
        {listState === "ready" && birds.length > 0 && isMobileViewport && (
          <div className="bird-mobile-pagination">
            {canLoadMoreBirds && <button disabled={mobileLoadingMore} onClick={() => void loadMoreBirds()} type="button">{mobileLoadingMore ? "Carregando…" : "Carregar mais"}</button>}
            {mobileLoadError && <p role="alert">{mobileLoadError}</p>}
            <span aria-live="polite">Mostrando {Math.min(displayedBirds.length, totalCount)} de {totalCount} aves</span>
          </div>
        )}
        {listState === "ready" && <BirdPagination onPageChange={(page) => commitFilters({ ...filters, page })} page={filters.page} totalPages={totalPages} />}
      </section>

      <p className="auth-footer">Os dados exibidos ficam vinculados somente ao criatório selecionado.</p>
      {isReportOpen && (
        <BirdsReportDialog
          client={client.current!}
          farmName={farmName ?? "Criatório selecionado"}
          filters={filters}
          isMobileViewport={isMobileViewport}
          onClearFilters={clearFilters}
          onClose={() => setIsReportOpen(false)}
          onSessionExpired={handleSessionExpired}
        />
      )}
    </BirdListLayout>
  );
}

function BirdListScreen() {
  const { error, refresh, session, status } = useAuth();

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="birds" email={session?.email} label="Carregando plantel" message="Buscando os registros do criatório selecionado." />;
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
