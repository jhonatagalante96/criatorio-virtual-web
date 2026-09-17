"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import {
  hasStatisticsData,
  normalizeBreedingFarmStatistics,
  statisticsRangeForDays,
  statisticsSexLabel,
  statisticsStatusLabel,
  sumDailyStatistics,
  totalBirdCount,
  validateStatisticsRange,
  type BreedingFarmStatistics,
  type StatisticsDateRange
} from "../../lib/statistics/statistics";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { AppLoadingContent, AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { SessionRecovery } from "../components/session-recovery";
import { DashboardIcon } from "../components/dashboard-icons";
import { StatisticsDistribution, StatisticsTrendChart, type StatisticsDistributionItem } from "../components/statistics-visuals";

interface BreedingFarmSummary {
  breedingFarmId: string;
  name: string;
}

interface BreedingFarmSelectionResponse {
  breedingFarms: BreedingFarmSummary[];
  selectedBreedingFarmId: string | null;
}

type StatisticsView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "blocked" }
  | { kind: "empty" }
  | { kind: "unselected" }
  | { kind: "missing" }
  | { kind: "ready"; farm: BreedingFarmSummary; statistics: BreedingFarmStatistics };

type PeriodOption = "30" | "90" | "180" | "custom";

function sameTenantId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function sumCounts(items: Array<{ count: number }>): number {
  return items.reduce((total, item) => total + item.count, 0);
}

function StatisticsStateCard({
  actionHref,
  actionLabel,
  email = "",
  farmName = "Criatório selecionado",
  heading,
  message,
  onRetry
}: Readonly<{
  actionHref?: string;
  actionLabel?: string;
  email?: string;
  farmName?: string;
  heading: string;
  message: string;
  onRetry?: () => void;
}>) {
  return (
    <AuthenticatedShell activeNav="statistics" email={email} farmName={farmName}>
      <section className="statistics-state-card">
        <span aria-hidden="true" className="statistics-state-icon"><DashboardIcon name="chart" /></span>
        <h1>{heading}</h1>
        <p>{message}</p>
        <div className="statistics-state-actions">
          {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
          {actionHref && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
        </div>
      </section>
    </AuthenticatedShell>
  );
}

function SummaryMetric({ href, icon, label, value }: Readonly<{ href: string; icon: "bird" | "calendar" | "heart" | "transfer"; label: string; value: number }>) {
  return (
    <Link className="statistics-metric" href={href}>
      <span aria-hidden="true"><DashboardIcon name={icon} /></span>
      <strong>{value.toLocaleString("pt-BR")}</strong>
      <small>{label}</small>
      <span aria-hidden="true" className="statistics-metric-arrow">›</span>
    </Link>
  );
}

function StatisticsContent({
  email,
  farm,
  isApplying,
  onApply,
  onRangeChange,
  onPeriodChange,
  onRetry,
  period,
  range,
  rangeError,
  statistics
}: Readonly<{
  farm: BreedingFarmSummary;
  email: string;
  isApplying: boolean;
  onApply: (event: React.FormEvent<HTMLFormElement>) => void;
  onRangeChange: (range: StatisticsDateRange) => void;
  onPeriodChange: (period: PeriodOption) => void;
  onRetry: () => void;
  period: PeriodOption;
  range: StatisticsDateRange;
  rangeError: string | undefined;
  statistics: BreedingFarmStatistics;
}>) {
  const topSpecies: StatisticsDistributionItem[] = statistics.birdsBySpecies
    .filter((item) => item.count > 0)
    .map((item) => ({ count: item.count, key: item.speciesId || item.popularName, label: item.popularName }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
  const birdsByStatus = statistics.birdsByStatus.map((item) => ({ count: item.count, key: item.status, label: statisticsStatusLabel(item.status) }));
  const birdsBySex = statistics.birdsBySex.map((item) => ({ count: item.count, key: item.sex, label: statisticsSexLabel(item.sex) }));
  const incomingRequests = statistics.transfers.incomingRequestsByStatus.map((item) => ({ count: item.count, key: item.status, label: statisticsStatusLabel(item.status) }));
  const outgoingRequests = statistics.transfers.outgoingRequestsByStatus.map((item) => ({ count: item.count, key: item.status, label: statisticsStatusLabel(item.status) }));
  const transfersOut = sumDailyStatistics(statistics.daily, "internalTransfersOutCount") + sumDailyStatistics(statistics.daily, "externalTransfersOutCount");

  return (
    <AuthenticatedShell activeNav="statistics" email={email} farmName={farm.name}>
      <div aria-busy={isApplying} className="statistics-page">
        <header className="statistics-page-header">
          <div>
            <p className="eyebrow">Análise do criatório</p>
            <h1>Estatísticas</h1>
            <p>Entenda o plantel e acompanhe a evolução do seu criatório no período escolhido.</p>
          </div>
          <Link className="statistics-back-link" href="/dashboard"><DashboardIcon name="home" /> Voltar ao Painel</Link>
        </header>

        <form className="statistics-filter-card" onSubmit={onApply}>
          <fieldset>
            <legend>Período de análise</legend>
            <div className="statistics-period-options">
              {([
                ["30", "30 dias"],
                ["90", "90 dias"],
                ["180", "180 dias"],
                ["custom", "Personalizado"]
              ] as Array<[PeriodOption, string]>).map(([value, label]) => (
                <label className="statistics-period-option" key={value}>
                  <input checked={period === value} name="period" onChange={() => onPeriodChange(value)} type="radio" value={value} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {period === "custom" && (
            <div className="statistics-date-fields">
              <label htmlFor="statistics-from">Data inicial<input aria-describedby={`statistics-range-hint${rangeError ? " statistics-range-error" : ""}`} aria-invalid={Boolean(rangeError)} id="statistics-from" max={new Date().toISOString().slice(0, 10)} onChange={(event) => onRangeChange({ ...range, from: event.target.value })} type="date" value={range.from} /></label>
              <label htmlFor="statistics-to">Data final<input aria-describedby={`statistics-range-hint${rangeError ? " statistics-range-error" : ""}`} aria-invalid={Boolean(rangeError)} id="statistics-to" max={new Date().toISOString().slice(0, 10)} onChange={(event) => onRangeChange({ ...range, to: event.target.value })} type="date" value={range.to} /></label>
            </div>
          )}
          <div className="statistics-filter-actions">
            <p id="statistics-range-hint">O período aceita até 366 dias completos. As datas são consideradas em UTC.</p>
            <button className="auth-primary-action" disabled={isApplying} type="submit">{isApplying ? "Atualizando…" : "Atualizar período"}</button>
          </div>
          {rangeError && <p className="statistics-range-error" id="statistics-range-error" role="alert">{rangeError}</p>}
        </form>

        <div className="statistics-range-caption">Dados de {formatDate(statistics.from)} a {formatDate(statistics.to)} · {farm.name}</div>
        {!hasStatisticsData(statistics) && <p className="statistics-empty-notice" role="status">Não há movimentações registradas neste período. Os zeros são mantidos para mostrar que a consulta foi concluída.</p>}

        <section aria-label="Indicadores do período" className="statistics-metrics-grid">
          <SummaryMetric href="/plantel/aves" icon="bird" label="Aves no plantel" value={totalBirdCount(statistics)} />
          <SummaryMetric href="/plantel/aves" icon="calendar" label="Nascimentos" value={sumDailyStatistics(statistics.daily, "birthsRecordedCount")} />
          <SummaryMetric href="/reproducao" icon="heart" label="Reproduções iniciadas" value={sumDailyStatistics(statistics.daily, "reproductionsStartedCount")} />
          <SummaryMetric href="/reproducao" icon="heart" label="Reproduções concluídas" value={sumDailyStatistics(statistics.daily, "reproductionsCompletedCount")} />
          <SummaryMetric href="/transferencias" icon="transfer" label="Saídas de aves" value={transfersOut} />
        </section>

        <StatisticsTrendChart daily={statistics.daily} />

        <div className="statistics-distributions-grid">
          <StatisticsDistribution emptyMessage="Ainda não há aves por situação." rows={birdsByStatus} title="Plantel por situação" />
          <StatisticsDistribution emptyMessage="Ainda não há aves classificadas por sexo." rows={birdsBySex} title="Plantel por sexo" />
          <StatisticsDistribution emptyMessage="Ainda não há espécies cadastradas." limit={8} rows={topSpecies} title="Principais espécies" />
          <StatisticsDistribution emptyMessage="Nenhuma solicitação recebida no período." rows={incomingRequests} title="Solicitações de transferência recebidas" />
          <StatisticsDistribution emptyMessage="Nenhuma solicitação enviada no período." rows={outgoingRequests} title="Solicitações de transferência enviadas" />
        </div>

        <section aria-label="Movimentações de transferência concluídas" className="statistics-transfer-breakdown">
          <h2>Transferências concluídas no período</h2>
          <dl>
            <div><dt>Entradas internas</dt><dd>{sumDailyStatistics(statistics.daily, "internalTransfersInCount").toLocaleString("pt-BR")}</dd></div>
            <div><dt>Saídas internas</dt><dd>{sumDailyStatistics(statistics.daily, "internalTransfersOutCount").toLocaleString("pt-BR")}</dd></div>
            <div><dt>Saídas externas</dt><dd>{sumDailyStatistics(statistics.daily, "externalTransfersOutCount").toLocaleString("pt-BR")}</dd></div>
          </dl>
          <button className="statistics-retry-action" onClick={onRetry} type="button">Atualizar dados</button>
        </section>
      </div>
    </AuthenticatedShell>
  );
}

function StatisticsScreen() {
  const { error: authError, refresh, session, status } = useAuth();
  const initialRange = useRef(statisticsRangeForDays(30)).current;
  const [range, setRange] = useState<StatisticsDateRange>(initialRange);
  const [period, setPeriod] = useState<PeriodOption>("30");
  const [view, setView] = useState<StatisticsView>({ kind: "loading" });
  const [isApplying, setIsApplying] = useState(false);
  const [rangeError, setRangeError] = useState<string | undefined>();
  const client = useRef<ApiClient | null>(null);
  const requestId = useRef(0);

  if (!client.current) client.current = createApiClient();

  const loadStatistics = useCallback(async (requestedRange: StatisticsDateRange) => {
    const currentRequest = ++requestId.current;
    const isCurrent = () => requestId.current === currentRequest;
    setView({ kind: "loading" });
    setIsApplying(true);

    try {
      client.current!.clearCache();
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (!isCurrent()) return;
      if (selection.breedingFarms.length === 0) {
        setView({ kind: "empty" });
        return;
      }
      if (!selection.selectedBreedingFarmId) {
        setView({ kind: "unselected" });
        return;
      }
      const farm = selection.breedingFarms.find((candidate) => sameTenantId(candidate.breedingFarmId, selection.selectedBreedingFarmId!));
      if (!farm) {
        setView({ kind: "unselected" });
        return;
      }

      client.current!.setTenant(farm.breedingFarmId);
      const query = new URLSearchParams({ from: requestedRange.from, to: requestedRange.to });
      const response = normalizeBreedingFarmStatistics(await client.current!.request<unknown>(`api/breeding-farms/current/statistics?${query.toString()}`));
      if (!isCurrent()) return;
      if (!sameTenantId(response.breedingFarmId, farm.breedingFarmId)) throw new StaleTenantResponseError();
      setView({ farm, kind: "ready", statistics: response });
      setRange(requestedRange);
      setRangeError(undefined);
    } catch (requestError) {
      if (!isCurrent()) return;
      if (requestError instanceof ApiError && requestError.status === 401) {
        await refresh();
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 403) {
        setView({ kind: "blocked" });
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 409) {
        setView({ kind: "unselected" });
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 404) {
        setView({ kind: "missing" });
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 400) {
        setRangeError("A API não aceitou este intervalo. Revise as datas e tente novamente.");
        setView({ kind: "error", message: "O período informado não pôde ser consultado." });
        return;
      }
      setView({
        kind: "error",
        message: requestError instanceof StaleTenantResponseError
          ? "O criatório selecionado mudou durante a consulta. Atualize para carregar o contexto atual."
          : "Não foi possível carregar as estatísticas. Verifique sua conexão e tente novamente."
      });
    } finally {
      if (isCurrent()) setIsApplying(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadStatistics(initialRange);
    return () => { requestId.current += 1; };
  }, [initialRange, loadStatistics, status]);

  const handleApply = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateStatisticsRange(range);
    if (validation) {
      setRangeError(validation);
      return;
    }
    setRangeError(undefined);
    void loadStatistics(range);
  }, [loadStatistics, range]);

  const handlePeriodChange = useCallback((nextPeriod: PeriodOption) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") setRange(statisticsRangeForDays(Number(nextPeriod)));
  }, []);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="statistics" email={session?.email} label="Carregando estatísticas" message="Consultando os dados agregados do criatório." />;
  }
  if (status === "error") {
    return <StatisticsStateCard email={session?.email} heading="Não foi possível consultar a sessão" message={authError ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  }
  if (status === "forbidden") {
    return <StatisticsStateCard email={session?.email} heading="Acesso bloqueado" message={authError ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} />;
  }
  if (status === "unauthenticated") return <SessionRecovery />;
  if (view.kind === "loading") return <AppLoadingState activeNav="statistics" email={session?.email} label="Carregando estatísticas" message="Consultando os dados agregados do criatório." />;
  if (view.kind === "empty") return <StatisticsStateCard actionHref="/onboarding/criatorio" actionLabel="Criar meu criatório" email={session?.email} heading="Crie seu primeiro criatório" message="Ainda não existe um criatório vinculado a esta conta." />;
  if (view.kind === "unselected") return <StatisticsStateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" email={session?.email} heading="Selecione um criatório" message="Escolha um criatório para consultar as estatísticas." />;
  if (view.kind === "missing") return <StatisticsStateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar outro criatório" email={session?.email} heading="Criatório indisponível" message="Não foi possível localizar um criatório autorizado para esta consulta." onRetry={() => void loadStatistics(range)} />;
  if (view.kind === "blocked") return <StatisticsStateCard email={session?.email} heading="Acesso bloqueado" message="Sua conta não tem permissão para consultar as estatísticas deste criatório." onRetry={() => void loadStatistics(range)} />;
  if (view.kind === "error") return <StatisticsStateCard email={session?.email} heading="Não foi possível carregar as estatísticas" message={view.message} onRetry={() => void loadStatistics(range)} />;
  if (!session) return null;

  return (
    <StatisticsContent
      email={session.email}
      farm={view.farm}
      isApplying={isApplying}
      onApply={handleApply}
      onRangeChange={setRange}
      onPeriodChange={handlePeriodChange}
      onRetry={() => void loadStatistics(range)}
      period={period}
      range={range}
      rangeError={rangeError}
      statistics={view.statistics}
    />
  );
}

export default function StatisticsPage() {
  return <AuthProvider><StatisticsScreen /></AuthProvider>;
}
