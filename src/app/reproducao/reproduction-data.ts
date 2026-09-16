export type ReproductionStatus = "Active" | "Finished" | "Cancelled";
export type ReproductionFilter = "" | ReproductionStatus;

export interface BreedingFarmSummary {
  breedingFarmId: string;
  isSelected: boolean;
  name: string;
  responsibleName: string;
}

export interface BreedingFarmSelectionResponse {
  breedingFarms: BreedingFarmSummary[];
  selectedBreedingFarmId: string | null;
}

export interface ReproductionBird {
  birthDate: string | null;
  birdId: string;
  name: string;
  ringNumber: string | null;
  sex: string;
  status: string;
}

export interface ReproductionListItem {
  breedingFarmId: string;
  createdAtUtc: string;
  endDate: string | null;
  femaleBird: ReproductionBird;
  maleBird: ReproductionBird;
  reproductionId: string;
  startDate: string;
  status: ReproductionStatus;
  updatedAtUtc: string;
}

export interface ReproductionListResponse {
  breedingFarmId: string;
  items: ReproductionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ReproductionDetailsResponse extends ReproductionListItem {
  notes: string | null;
}

export interface ReproductionOriginBirdOption {
  birthDate: string | null;
  birdId: string;
  name: string;
  ringNumber: string | null;
  sex: string;
}

export interface ReproductionOriginBirdOptionsResponse {
  breedingFarmId: string;
  items: ReproductionOriginBirdOption[];
}

export function normalizeFarmResponse(value: BreedingFarmSelectionResponse): BreedingFarmSelectionResponse {
  return {
    breedingFarms: Array.isArray(value.breedingFarms) ? value.breedingFarms : [],
    selectedBreedingFarmId: value.selectedBreedingFarmId ?? null
  };
}

export function selectedFarmFromResponse(response: BreedingFarmSelectionResponse): BreedingFarmSummary | undefined {
  return response.breedingFarms.find((farm) =>
    farm.breedingFarmId === response.selectedBreedingFarmId && farm.isSelected
  );
}

export function normalizeReproductionList(value: ReproductionListResponse): ReproductionListResponse {
  return {
    ...value,
    items: Array.isArray(value.items) ? value.items : [],
    page: typeof value.page === "number" ? value.page : 1,
    pageSize: typeof value.pageSize === "number" ? value.pageSize : 20,
    totalCount: typeof value.totalCount === "number" ? value.totalCount : 0,
    totalPages: typeof value.totalPages === "number" ? value.totalPages : 0
  };
}

export function formatReproductionDate(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Não informado" : new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatReproductionTimestamp(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function reproductionStatusLabel(status: string): string {
  if (status === "Active") return "Em andamento";
  if (status === "Finished") return "Encerrada";
  if (status === "Cancelled") return "Cancelada";
  return "Status não reconhecido";
}

export function reproductionStatusClass(status: string): string {
  if (status === "Active") return "is-active";
  if (status === "Finished") return "is-finished";
  if (status === "Cancelled") return "is-cancelled";
  return "is-unknown";
}

export function birdSexLabel(sex: string): string {
  if (sex === "Male") return "Macho";
  if (sex === "Female") return "Fêmea";
  return "Não identificado";
}

export function birdStatusLabel(status: string): string {
  if (status === "Active") return "Ativa";
  if (status === "Archived") return "Arquivada";
  if (status === "Transferred") return "Transferida";
  if (status === "Deceased") return "Falecida";
  if (status === "Escaped") return "Fugida";
  return "Não informada";
}
