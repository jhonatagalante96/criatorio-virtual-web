import { ApiError } from "../../lib/http/api-client";

export interface CompetitionBirdSummary {
  birdId: string;
  name: string;
  ringNumber: string | null;
}

export interface CompetitionListItem {
  competitionId: string;
  breedingFarmId: string;
  bird: CompetitionBirdSummary;
  name: string;
  date: string | null;
  category: string | null;
  placement: number | null;
  location: string | null;
  notes: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CompetitionListResponse {
  breedingFarmId: string;
  items: CompetitionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface CompetitionFilterValues {
  birdId?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

export function formatCompetitionDate(value: string | null | undefined): string {
  if (!value) return "Data não informada";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatPlacement(placement: number | null | undefined): string | null {
  if (typeof placement !== "number" || placement <= 0) return null;
  return `${placement}º lugar`;
}

export function buildCompetitionQuery(
  filters: CompetitionFilterValues,
  page = 1,
  pageSize = 20
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  if (filters.birdId?.trim()) params.set("birdId", filters.birdId.trim());
  if (filters.category?.trim()) params.set("category", filters.category.trim());
  if (filters.fromDate?.trim()) params.set("fromDate", filters.fromDate.trim());
  if (filters.toDate?.trim()) params.set("toDate", filters.toDate.trim());
  if (filters.search?.trim()) params.set("search", filters.search.trim());

  return params.toString();
}

export function validateFilterDates(fromDate?: string, toDate?: string): string | undefined {
  if (fromDate && toDate && fromDate > toDate) {
    return "A data final deve ser igual ou posterior à data inicial.";
  }
  return undefined;
}

export function competitionListErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return error.details || "Parâmetros de consulta inválidos. Revise os filtros e tente novamente.";
  }
  if (error instanceof ApiError && error.status === 401) {
    return "Sua sessão expirou. Entre novamente para consultar as competições.";
  }
  if (error instanceof ApiError && error.status === 403) {
    return "Sua conta não tem permissão para consultar as competições deste criatório.";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "O criatório selecionado não foi encontrado.";
  }
  if (error instanceof ApiError && error.status === 409) {
    return "Selecione um criatório antes de consultar as competições.";
  }
  if (error instanceof ApiError && error.status >= 500) {
    return "O serviço está indisponível no momento. Tente novamente em instantes.";
  }
  if (error instanceof TypeError) {
    return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  }
  return "Não foi possível carregar a lista de competições. Tente novamente.";
}

export function hasAnyFilter(filters: CompetitionFilterValues): boolean {
  return Boolean(
    filters.birdId?.trim() ||
    filters.category?.trim() ||
    filters.fromDate?.trim() ||
    filters.toDate?.trim() ||
    filters.search?.trim()
  );
}
