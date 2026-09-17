export interface StatisticsDateRange {
  from: string;
  to: string;
}

export interface StatisticsCountByStatus {
  status: string;
  count: number;
}

export interface StatisticsCountBySex {
  sex: string;
  count: number;
}

export interface StatisticsCountBySpecies {
  speciesId: string;
  popularName: string;
  scientificName: string;
  count: number;
}

export interface DailyStatistics {
  date: string;
  birdsRegisteredCount: number;
  birthsRecordedCount: number;
  reproductionsStartedCount: number;
  reproductionsCompletedCount: number;
  internalTransfersInCount: number;
  internalTransfersOutCount: number;
  externalTransfersOutCount: number;
}

export interface TransferStatistics {
  internalTransfersInCount: number;
  internalTransfersOutCount: number;
  externalTransfersOutCount: number;
  incomingRequestsByStatus: StatisticsCountByStatus[];
  outgoingRequestsByStatus: StatisticsCountByStatus[];
}

export interface BreedingFarmStatistics {
  breedingFarmId: string;
  from: string;
  to: string;
  birdsByStatus: StatisticsCountByStatus[];
  birdsBySex: StatisticsCountBySex[];
  birdsBySpecies: StatisticsCountBySpecies[];
  daily: DailyStatistics[];
  transfers: TransferStatistics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeStatusCounts(value: unknown): StatisticsCountByStatus[] {
  return arrayRecords(value).map((item) => ({
    count: countValue(item.count),
    status: stringValue(item.status)
  }));
}

export function normalizeBreedingFarmStatistics(value: unknown): BreedingFarmStatistics {
  const root = isRecord(value) ? value : {};
  const transfers = isRecord(root.transfers) ? root.transfers : {};

  return {
    breedingFarmId: stringValue(root.breedingFarmId),
    from: stringValue(root.from),
    to: stringValue(root.to),
    birdsByStatus: normalizeStatusCounts(root.birdsByStatus),
    birdsBySex: arrayRecords(root.birdsBySex).map((item) => ({
      count: countValue(item.count),
      sex: stringValue(item.sex)
    })),
    birdsBySpecies: arrayRecords(root.birdsBySpecies).map((item) => ({
      count: countValue(item.count),
      popularName: stringValue(item.popularName) || "Espécie sem nome",
      scientificName: stringValue(item.scientificName),
      speciesId: stringValue(item.speciesId)
    })),
    daily: arrayRecords(root.daily).map((item) => ({
      date: stringValue(item.date),
      birdsRegisteredCount: countValue(item.birdsRegisteredCount),
      birthsRecordedCount: countValue(item.birthsRecordedCount),
      reproductionsStartedCount: countValue(item.reproductionsStartedCount),
      reproductionsCompletedCount: countValue(item.reproductionsCompletedCount),
      internalTransfersInCount: countValue(item.internalTransfersInCount),
      internalTransfersOutCount: countValue(item.internalTransfersOutCount),
      externalTransfersOutCount: countValue(item.externalTransfersOutCount)
    })),
    transfers: {
      internalTransfersInCount: countValue(transfers.internalTransfersInCount),
      internalTransfersOutCount: countValue(transfers.internalTransfersOutCount),
      externalTransfersOutCount: countValue(transfers.externalTransfersOutCount),
      incomingRequestsByStatus: normalizeStatusCounts(transfers.incomingRequestsByStatus),
      outgoingRequestsByStatus: normalizeStatusCounts(transfers.outgoingRequestsByStatus)
    }
  };
}

export function statisticsRangeForDays(days: number, now = new Date()): StatisticsDateRange {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(`${to}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - Math.max(1, Math.floor(days)) + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

function utcDayNumber(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  return Math.floor(date.getTime() / 86_400_000);
}

export function validateStatisticsRange(range: StatisticsDateRange, now = new Date()): string | undefined {
  const from = utcDayNumber(range.from);
  const to = utcDayNumber(range.to);
  if (from === undefined || to === undefined) return "Informe datas válidas para o período.";
  if (from > to) return "A data inicial deve ser anterior ou igual à data final.";
  const today = utcDayNumber(now.toISOString().slice(0, 10));
  if (today !== undefined && to > today) return "A data final não pode estar no futuro.";
  if (to - from + 1 > 366) return "O período não pode ultrapassar 366 dias.";
  return undefined;
}

export function sumDailyStatistics(daily: DailyStatistics[], field: keyof Omit<DailyStatistics, "date">): number {
  return daily.reduce((total, item) => total + item[field], 0);
}

export function totalBirdCount(statistics: BreedingFarmStatistics): number {
  return statistics.birdsByStatus.reduce((total, item) => total + item.count, 0);
}

export function hasStatisticsData(statistics: BreedingFarmStatistics): boolean {
  return totalBirdCount(statistics) > 0 || statistics.transfers.internalTransfersInCount > 0 ||
    statistics.transfers.internalTransfersOutCount > 0 || statistics.transfers.externalTransfersOutCount > 0 ||
    statistics.transfers.incomingRequestsByStatus.some((item) => item.count > 0) ||
    statistics.transfers.outgoingRequestsByStatus.some((item) => item.count > 0) || statistics.daily.some((day) =>
    day.birdsRegisteredCount > 0 || day.birthsRecordedCount > 0 || day.reproductionsStartedCount > 0 ||
    day.reproductionsCompletedCount > 0 || day.internalTransfersInCount > 0 ||
    day.internalTransfersOutCount > 0 || day.externalTransfersOutCount > 0
  );
}

export function statisticsStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    Active: "Ativas",
    Archived: "Arquivadas",
    Deceased: "Falecidas",
    Escaped: "Fugidas",
    Transferred: "Transferidas",
    Pending: "Pendentes",
    Accepted: "Aceitas",
    Rejected: "Recusadas",
    Cancelled: "Canceladas"
  };
  return labels[status] ?? (status.replace(/([a-z])([A-Z])/g, "$1 $2") || "Outros");
}

export function statisticsSexLabel(sex: string): string {
  if (sex === "Male") return "Machos";
  if (sex === "Female") return "Fêmeas";
  if (sex === "Unknown") return "Não informado";
  return statisticsStatusLabel(sex);
}
