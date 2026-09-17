"use client";

import React, { useState } from "react";
import type { DailyStatistics } from "../../lib/statistics/statistics";

export interface StatisticsDistributionItem {
  count: number;
  key: string;
  label: string;
}

export function StatisticsDistribution({
  emptyMessage,
  limit,
  rows,
  title
}: Readonly<{
  emptyMessage: string;
  limit?: number;
  rows: StatisticsDistributionItem[];
  title: string;
}>) {
  const sortedRows = [...rows].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "pt-BR"));
  const visibleRows = limit === undefined ? sortedRows : sortedRows.slice(0, limit);
  const maximum = Math.max(1, ...visibleRows.map((row) => row.count));

  return (
    <section aria-label={title} className="statistics-distribution">
      <h3>{title}</h3>
      {visibleRows.length === 0 ? (
        <p className="statistics-empty-inline">{emptyMessage}</p>
      ) : (
        <ul>
          {visibleRows.map((row) => (
            <li key={row.key}>
              <div className="statistics-distribution-row">
                <span>{row.label}</span>
                <strong>{row.count.toLocaleString("pt-BR")}</strong>
              </div>
              <span aria-hidden="true" className="statistics-distribution-track">
                <span style={{ width: `${(row.count / maximum) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type TrendKey = "birdsRegisteredCount" | "birthsRecordedCount";

function pointsFor(daily: DailyStatistics[], field: TrendKey, maximum: number): string {
  if (daily.length === 0) return "";
  const width = 640;
  const height = 180;
  const left = 20;
  const top = 18;
  const bottom = 154;
  const usableWidth = width - left * 2;
  const usableHeight = bottom - top;

  return daily.map((day, index) => {
    const x = daily.length === 1 ? width / 2 : left + (index / (daily.length - 1)) * usableWidth;
    const y = bottom - (day[field] / maximum) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function formatChartDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

function formatChartAccessibleDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatChartCount(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : plural}`;
}

function chartX(index: number, count: number): number {
  return count === 1 ? 320 : 20 + (index / (count - 1)) * 600;
}

function chartBand(index: number, count: number): Readonly<{ start: number; width: number }> {
  const x = chartX(index, count);
  const previous = index === 0 ? 20 : (chartX(index - 1, count) + x) / 2;
  const next = index === count - 1 ? 620 : (x + chartX(index + 1, count)) / 2;
  return { start: previous, width: next - previous };
}

export function StatisticsTrendChart({ daily, compact = false }: Readonly<{ daily: DailyStatistics[]; compact?: boolean }>) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maximum = Math.max(1, ...daily.flatMap((day) => [day.birdsRegisteredCount, day.birthsRecordedCount]));
  const chartTitleId = compact ? "titulo-evolucao-resumo" : "titulo-evolucao-estatisticas";
  const chartDescriptionId = compact ? "descricao-evolucao-resumo" : "descricao-evolucao-estatisticas";
  const activeDay = activeIndex === null ? undefined : daily[activeIndex];
  const activeX = activeIndex === null ? 0 : chartX(activeIndex, daily.length);
  const tooltipAlignment = activeIndex === 0 ? "is-start" : activeIndex === daily.length - 1 ? "is-end" : "";

  return (
    <section aria-labelledby={chartTitleId} className={`statistics-trend${compact ? " statistics-trend-compact" : ""}`}>
      <div className="statistics-panel-heading">
        <div>
          <p className="eyebrow">Evolução</p>
          <h2 id={chartTitleId}>{compact ? "Cadastros e nascimentos" : "Aves cadastradas e nascimentos"}</h2>
          <p className="statistics-panel-lede">Contagens por dia no período selecionado, em UTC.</p>
        </div>
      </div>
      {daily.length === 0 ? (
        <p className="statistics-empty-inline">Não há movimentações para exibir neste período.</p>
      ) : (
        <>
          <div className="statistics-chart-legend" aria-hidden="true">
            <span><i className="statistics-legend-registered" /> Aves cadastradas</span>
            <span><i className="statistics-legend-births" /> Nascimentos</span>
          </div>
          <div className="statistics-chart-plot">
            <svg aria-labelledby={`${chartTitleId} ${chartDescriptionId}`} className="statistics-line-chart" preserveAspectRatio="none" role="group" viewBox="0 0 640 180">
            <desc id={chartDescriptionId}>
              {compact
                ? "Gráfico interativo da variação diária de aves cadastradas e nascimentos. Passe o cursor, toque ou use o teclado sobre um dia para consultar os valores."
                : "Passe o cursor, toque ou use o teclado sobre um dia para consultar as contagens de aves cadastradas e nascimentos."}
            </desc>
            <line className="statistics-chart-gridline" x1="20" x2="620" y1="18" y2="18" />
            <line className="statistics-chart-gridline" x1="20" x2="620" y1="86" y2="86" />
            <line className="statistics-chart-gridline" x1="20" x2="620" y1="154" y2="154" />
            <polyline className="statistics-chart-registered" points={pointsFor(daily, "birdsRegisteredCount", maximum)} />
            <polyline className="statistics-chart-births" points={pointsFor(daily, "birthsRecordedCount", maximum)} />
            {daily.map((day, index) => {
              const band = chartBand(index, daily.length);
              const label = `${formatChartAccessibleDate(day.date)}: ${formatChartCount(day.birdsRegisteredCount, "ave cadastrada", "aves cadastradas")}, ${formatChartCount(day.birthsRecordedCount, "nascimento", "nascimentos")}`;
              return (
                <rect
                  aria-label={label}
                  className="statistics-chart-hit-area"
                  height="136"
                  key={day.date}
                  onClick={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onPointerEnter={() => setActiveIndex(index)}
                  role="button"
                  tabIndex={0}
                  width={band.width}
                  x={band.start}
                  y="18"
                />
              );
            })}
            {activeDay && (
              <>
                <line className="statistics-chart-focus-line" x1={activeX} x2={activeX} y1="18" y2="154" />
                <circle className="statistics-chart-focus-registered" cx={activeX} cy={154 - (activeDay.birdsRegisteredCount / maximum) * 136} r="4.5" />
                <circle className="statistics-chart-focus-births" cx={activeX} cy={154 - (activeDay.birthsRecordedCount / maximum) * 136} r="4.5" />
              </>
            )}
            </svg>
            {activeDay && (
              <div
                aria-hidden="true"
                className={`statistics-chart-tooltip ${tooltipAlignment}`}
                style={{ left: `${(activeX / 640) * 100}%` }}
              >
                <strong>{formatChartDate(activeDay.date)}</strong>
                <span><i className="statistics-legend-registered" /> {formatChartCount(activeDay.birdsRegisteredCount, "ave cadastrada", "aves cadastradas")}</span>
                <span><i className="statistics-legend-births" /> {formatChartCount(activeDay.birthsRecordedCount, "nascimento", "nascimentos")}</span>
              </div>
            )}
          </div>
          <p className="statistics-chart-hint">Passe o cursor, toque ou use Tab sobre um ponto para ver os valores do dia.</p>
          {!compact && (
            <details className="statistics-chart-data">
              <summary>Consultar valores por dia</summary>
              <div className="statistics-chart-table-wrap">
                <table>
                  <thead><tr><th scope="col">Data</th><th scope="col">Aves cadastradas</th><th scope="col">Nascimentos</th></tr></thead>
                  <tbody>{daily.map((day) => <tr key={day.date}><th scope="row">{formatChartDate(day.date)}</th><td>{day.birdsRegisteredCount.toLocaleString("pt-BR")}</td><td>{day.birthsRecordedCount.toLocaleString("pt-BR")}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
