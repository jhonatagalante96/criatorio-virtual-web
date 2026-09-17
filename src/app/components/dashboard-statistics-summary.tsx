"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import {
  normalizeBreedingFarmStatistics,
  statisticsRangeForDays,
  statisticsSexLabel,
  sumDailyStatistics,
  totalBirdCount,
  type BreedingFarmStatistics
} from "../../lib/statistics/statistics";
import { DashboardIcon } from "./dashboard-icons";
import { StatisticsDistribution, StatisticsTrendChart } from "./statistics-visuals";

type SummaryView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; statistics: BreedingFarmStatistics };

function sameTenantId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function DashboardStatisticsSummary({ farmId }: Readonly<{ farmId: string }>) {
  const { refresh } = useAuth();
  const [view, setView] = useState<SummaryView>({ kind: "loading" });
  const client = useRef<ApiClient | null>(null);
  const requestId = useRef(0);

  if (!client.current) client.current = createApiClient();

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const isCurrent = () => requestId.current === currentRequest;
    setView({ kind: "loading" });

    try {
      client.current!.setTenant(farmId);
      client.current!.clearCache();
      const range = statisticsRangeForDays(30);
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const response = await client.current!.request<unknown>(`api/breeding-farms/current/statistics?${query.toString()}`);
      if (!isCurrent()) return;
      const statistics = normalizeBreedingFarmStatistics(response);
      if (!sameTenantId(statistics.breedingFarmId, farmId)) throw new StaleTenantResponseError();
      setView({ kind: "ready", statistics });
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ApiError && error.status === 401) {
        await refresh();
        return;
      }
      setView({ kind: "error" });
    }
  }, [farmId, refresh]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  return (
    <section aria-labelledby="titulo-resumo-estatisticas" aria-busy={view.kind === "loading"} className="dashboard-statistics-card dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Visão analítica</p>
          <h2 id="titulo-resumo-estatisticas">Resumo do criatório</h2>
          <p className="dashboard-section-lede">Plantel atual e movimentações dos últimos 30 dias.</p>
        </div>
        <Link className="dashboard-section-action" href="/estatisticas">Ver estatísticas <span aria-hidden="true">›</span></Link>
      </div>

      {view.kind === "loading" && <p className="statistics-inline-state" role="status">Carregando resumo analítico…</p>}
      {view.kind === "error" && (
        <div className="statistics-inline-state statistics-inline-error" role="status">
          <span>Não foi possível carregar o resumo agora.</span>
          <button className="statistics-retry-action" onClick={() => void load()} type="button">Tentar novamente</button>
        </div>
      )}
      {view.kind === "ready" && (() => {
        const { statistics } = view;
        const outgoingTransfers = sumDailyStatistics(statistics.daily, "internalTransfersOutCount") +
          sumDailyStatistics(statistics.daily, "externalTransfersOutCount");
        const topSpecies = statistics.birdsBySpecies
          .filter((item) => item.count > 0)
          .map((item) => ({ count: item.count, key: item.speciesId || item.popularName, label: item.popularName }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 3);
        const birdsBySex = statistics.birdsBySex.map((item) => ({
          count: item.count,
          key: item.sex,
          label: statisticsSexLabel(item.sex)
        }));

        return (
          <>
            <div className="dashboard-statistics-metrics">
              <Link href="/plantel/aves"><span aria-hidden="true"><DashboardIcon name="bird" /></span><strong>{totalBirdCount(statistics).toLocaleString("pt-BR")}</strong><small>Aves no plantel</small><span aria-hidden="true" className="statistics-metric-arrow">›</span></Link>
              <Link href="/plantel/aves"><span aria-hidden="true"><DashboardIcon name="calendar" /></span><strong>{sumDailyStatistics(statistics.daily, "birthsRecordedCount").toLocaleString("pt-BR")}</strong><small>Nascimentos · 30 dias</small><span aria-hidden="true" className="statistics-metric-arrow">›</span></Link>
              <Link href="/reproducao"><span aria-hidden="true"><DashboardIcon name="heart" /></span><strong>{sumDailyStatistics(statistics.daily, "reproductionsStartedCount").toLocaleString("pt-BR")}</strong><small>Reproduções iniciadas</small><span aria-hidden="true" className="statistics-metric-arrow">›</span></Link>
              <Link href="/transferencias"><span aria-hidden="true"><DashboardIcon name="transfer" /></span><strong>{outgoingTransfers.toLocaleString("pt-BR")}</strong><small>Saídas · 30 dias</small><span aria-hidden="true" className="statistics-metric-arrow">›</span></Link>
            </div>
            <div className="dashboard-statistics-details">
              <StatisticsDistribution emptyMessage="Sem aves por sexo." limit={3} rows={birdsBySex} title="Distribuição por sexo" />
              <StatisticsDistribution emptyMessage="Nenhuma espécie cadastrada." limit={3} rows={topSpecies} title="Principais espécies" />
            </div>
            <StatisticsTrendChart compact daily={statistics.daily.slice(-30)} />
          </>
        );
      })()}
    </section>
  );
}
