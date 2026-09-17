import { describe, expect, it } from "vitest";
import {
  hasStatisticsData,
  normalizeBreedingFarmStatistics,
  statisticsRangeForDays,
  statisticsSexLabel,
  statisticsStatusLabel,
  sumDailyStatistics,
  totalBirdCount,
  validateStatisticsRange
} from "./statistics";

describe("breeding farm statistics", () => {
  it("normalizes the API response without turning valid zeroes into missing data", () => {
    const statistics = normalizeBreedingFarmStatistics({
      breedingFarmId: "farm-a",
      birdsByStatus: [{ status: "Active", count: 0 }],
      birdsBySex: [{ sex: "Unknown", count: 0 }],
      birdsBySpecies: [{ speciesId: "species-a", popularName: "Canário", scientificName: "Serinus", count: 0 }],
      daily: [{ date: "2026-09-17", birdsRegisteredCount: 0, birthsRecordedCount: 0 }],
      transfers: { internalTransfersInCount: 0 },
      from: "2026-08-19",
      to: "2026-09-17"
    });

    expect(statistics.birdsByStatus[0]).toEqual({ status: "Active", count: 0 });
    expect(statistics.birdsBySpecies[0].popularName).toBe("Canário");
    expect(statistics.transfers.internalTransfersInCount).toBe(0);
    expect(totalBirdCount(statistics)).toBe(0);
    expect(hasStatisticsData(statistics)).toBe(false);
  });

  it("builds inclusive UTC ranges and validates the API's 366-day limit", () => {
    const now = new Date("2026-09-17T02:00:00.000Z");
    const thirtyDays = statisticsRangeForDays(30, now);
    expect(thirtyDays).toEqual({ from: "2026-08-19", to: "2026-09-17" });
    expect(validateStatisticsRange(thirtyDays, now)).toBeUndefined();
    expect(validateStatisticsRange({ from: "2025-09-16", to: "2026-09-17" }, now)).toContain("366 dias");
    expect(validateStatisticsRange({ from: "2026-09-18", to: "2026-09-17" }, now)).toContain("data inicial");
    expect(validateStatisticsRange({ from: "2026-09-16", to: "2026-09-18" }, now)).toContain("futuro");
    expect(validateStatisticsRange({ from: "2026-02-30", to: "2026-03-01" }, now)).toContain("datas válidas");
  });

  it("aggregates period totals and uses readable Portuguese labels", () => {
    const statistics = normalizeBreedingFarmStatistics({
      birdsByStatus: [{ status: "Active", count: 4 }, { status: "Archived", count: 1 }],
      daily: [
        { date: "2026-09-16", birthsRecordedCount: 2, birdsRegisteredCount: 1 },
        { date: "2026-09-17", birthsRecordedCount: 1, birdsRegisteredCount: 3 }
      ]
    });

    expect(totalBirdCount(statistics)).toBe(5);
    expect(sumDailyStatistics(statistics.daily, "birthsRecordedCount")).toBe(3);
    expect(hasStatisticsData(statistics)).toBe(true);
    expect(statisticsStatusLabel("Active")).toBe("Ativas");
    expect(statisticsStatusLabel("Escaped")).toBe("Fugidas");
    expect(statisticsStatusLabel("FutureStatus")).toBe("Future Status");
    expect(statisticsSexLabel("Male")).toBe("Machos");
    expect(statisticsSexLabel("Unknown")).toBe("Não informado");
  });
});
