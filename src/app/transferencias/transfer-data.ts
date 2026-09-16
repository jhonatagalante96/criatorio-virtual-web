export type TransferDirection = "Received" | "Sent";
export type TransferStatus = "Pending" | "Accepted" | "Rejected" | "Cancelled";
export type TransferStatusFilter = "" | TransferStatus;

export interface InternalTransferListItem {
  transferRequestId: string;
  birdId: string;
  birdName: string;
  ringNumber: string | null;
  sourceBreedingFarmId: string;
  sourceBreedingFarmName: string;
  destinationBreedingFarmId: string;
  destinationBreedingFarmName: string;
  status: TransferStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface InternalTransferListResponse {
  direction: TransferDirection;
  breedingFarmId: string;
  items: InternalTransferListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface InternalTransferDetailsResponse {
  transferRequestId: string;
  bird: {
    birdId: string;
    name: string;
    sex: string;
    ringNumber: string | null;
    status: string;
  };
  sourceBreedingFarmId: string;
  sourceBreedingFarmName: string;
  destinationBreedingFarmId: string;
  destinationBreedingFarmName: string;
  status: TransferStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface InternalTransferRequestResponse {
  transferRequestId: string;
  birdId: string;
  sourceBreedingFarmId: string;
  destinationBreedingFarmId: string;
  status: TransferStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export function normalizeTransferList(value: InternalTransferListResponse): InternalTransferListResponse {
  return {
    ...value,
    items: Array.isArray(value.items) ? value.items : [],
    page: typeof value.page === "number" ? value.page : 1,
    pageSize: typeof value.pageSize === "number" ? value.pageSize : 20,
    totalCount: typeof value.totalCount === "number" ? value.totalCount : 0,
    totalPages: typeof value.totalPages === "number" ? value.totalPages : 0
  };
}

export function transferStatusLabel(status: string): string {
  switch (status) {
    case "Pending": return "Pendente";
    case "Accepted": return "Concluída";
    case "Rejected": return "Rejeitada";
    case "Cancelled": return "Cancelada";
    default: return "Situação indisponível";
  }
}

export function transferStatusClass(status: string): string {
  switch (status) {
    case "Pending": return "is-pending";
    case "Accepted": return "is-accepted";
    case "Rejected": return "is-rejected";
    case "Cancelled": return "is-cancelled";
    default: return "is-unknown";
  }
}

export function formatTransferTimestamp(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function transferErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  if (error instanceof Error && error.name === "StaleTenantResponseError") return "O criatório selecionado mudou. Atualize a consulta para continuar.";
  if (error && typeof error === "object" && "status" in error) {
    const status = Number(error.status);
    if (status === 400) return "O filtro da consulta não foi aceito. Revise a situação e tente novamente.";
    if (status === 401) return "Sua sessão expirou. Entre novamente antes de consultar as transferências.";
    if (status === 403) return "Sua conta não tem permissão para acessar estas transferências.";
    if (status === 404) return "Esta transferência não está disponível para o criatório selecionado.";
    if (status === 409) return "O criatório selecionado mudou ou não está disponível. Atualize o contexto e tente novamente.";
    if (status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  }
  return "Não foi possível consultar as transferências. Tente novamente.";
}
