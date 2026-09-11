"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { BrandLockup, BrandPanel } from "../components/brand";

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

interface DashboardIndicators {
  activeBirdCount: number;
  activeReproductionCount: number;
  pendingIdentificationCount: number;
}

interface DashboardPending {
  code: string;
  count: number;
  resourceType: string;
  title: string;
}

interface DashboardActivity {
  activityType: string;
  occurredAtUtc: string;
  resourceId: string;
  resourceType: string;
  title: string;
}

interface DashboardData {
  activities: DashboardActivity[];
  breedingFarmId: string;
  indicators: DashboardIndicators;
  isPartial: boolean;
  pending: DashboardPending[];
}

type DashboardView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "empty" }
  | { kind: "unselected" }
  | { kind: "missing" }
  | { kind: "ready"; dashboard: DashboardData; farm: BreedingFarmSummary };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeDashboard(value: unknown): DashboardData {
  const root = isRecord(value) ? value : {};
  const rawIndicators = isRecord(root.indicators) ? root.indicators : undefined;
  const rawPending = Array.isArray(root.pending) ? root.pending : undefined;
  const rawActivities = Array.isArray(root.activities) ? root.activities : undefined;

  const pending = (rawPending ?? []).filter(isRecord).map((item) => ({
    code: stringValue(item.code, "Pending"),
    count: countValue(item.count),
    resourceType: stringValue(item.resourceType, ""),
    title: stringValue(item.title, "Pendência no criatório")
  }));

  const activities = (rawActivities ?? []).filter(isRecord).map((item) => ({
    activityType: stringValue(item.activityType, "ActivityRegistered"),
    occurredAtUtc: stringValue(item.occurredAtUtc, ""),
    resourceId: stringValue(item.resourceId, ""),
    resourceType: stringValue(item.resourceType, ""),
    title: stringValue(item.title, "Atividade registrada")
  }));

  return {
    activities,
    breedingFarmId: stringValue(root.breedingFarmId, ""),
    indicators: {
      activeBirdCount: countValue(rawIndicators?.activeBirdCount),
      activeReproductionCount: countValue(rawIndicators?.activeReproductionCount),
      pendingIdentificationCount: countValue(rawIndicators?.pendingIdentificationCount)
    },
    isPartial: !rawIndicators || !rawPending || !rawActivities,
    pending
  };
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatActivityType(activityType: string): string {
  if (activityType === "BirdRegistered") return "Ave cadastrada";
  if (activityType === "ReproductionRegistered") return "Reprodução cadastrada";
  return "Atividade registrada";
}

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Data não disponível";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function activityHref(activity: DashboardActivity): string | undefined {
  return activity.resourceType.toLowerCase() === "bird" && activity.resourceId
    ? `/plantel/aves/${encodeURIComponent(activity.resourceId)}`
    : undefined;
}

function pendingHref(pending: DashboardPending): string | undefined {
  return pending.code === "BirdIdentificationPending" || pending.resourceType.toLowerCase() === "bird"
    ? "/plantel/aves?identificationPending=true"
    : undefined;
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
    <main className="auth-page dashboard-access-page">
      <a className="skip-link" href="#conteudo-dashboard-estado">Pular para o conteúdo</a>
      <div className="auth-shell dashboard-access-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-dashboard-estado" className="auth-form-panel">
          <div className="auth-form-content auth-state-card" id="conteudo-dashboard-estado">
            <BrandLockup stacked />
            <h1 id="titulo-dashboard-estado" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <a className="text-action" href={actionHref}>{actionLabel}</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardMetric({ label, value, detail, tone = "green" }: Readonly<{
  detail: string;
  label: string;
  tone?: "green" | "orange" | "blue" | "rose";
  value: number;
}>) {
  return (
    <article className={`dashboard-metric dashboard-metric-${tone}`}>
      <div className="dashboard-metric-icon" aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function PendingSection({ pending }: Readonly<{ pending: DashboardPending[] }>) {
  return (
    <section aria-labelledby="titulo-pendencias" className="dashboard-section dashboard-pending-section">
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Atenção</p>
          <h2 id="titulo-pendencias">Pendências <span className="dashboard-heading-badge">{pending.length}</span></h2>
        </div>
        <a className="dashboard-section-action" href="/plantel/aves?identificationPending=true">Ver todas <span aria-hidden="true">›</span></a>
      </div>
      {pending.length === 0 ? (
        <div className="dashboard-empty-state">
          <span aria-hidden="true" className="dashboard-empty-mark">✓</span>
          <div>
            <strong>Tudo em dia por aqui.</strong>
            <p>Não há pendências que precisem da sua atenção agora.</p>
          </div>
        </div>
      ) : (
        <ul className="dashboard-pending-list">
          {pending.map((item) => {
            const href = pendingHref(item);
            const content = (
              <>
                <span aria-hidden="true" className="dashboard-pending-mark">!</span>
                <span className="dashboard-pending-copy">
                  <strong>{item.title}</strong>
                  <span>{formatCount(item.count, "registro", "registros")}</span>
                </span>
                {href && <span aria-hidden="true" className="dashboard-card-arrow">→</span>}
              </>
            );

            return (
              <li key={`${item.code}-${item.resourceType}`}>
                {href ? <a href={href}>{content}</a> : <div className="dashboard-pending-item">{content}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActivitiesSection({ activities }: Readonly<{ activities: DashboardActivity[] }>) {
  return (
    <section aria-labelledby="titulo-atividades" className="dashboard-section dashboard-activities-section">
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Acompanhe de perto</p>
          <h2 id="titulo-atividades">Atividades recentes</h2>
        </div>
        <span className="dashboard-section-action">Ver mais <span aria-hidden="true">›</span></span>
      </div>
      {activities.length === 0 ? (
        <div className="dashboard-empty-state">
          <span aria-hidden="true" className="dashboard-empty-mark">·</span>
          <div>
            <strong>Seu histórico começa aqui.</strong>
            <p>As atividades recentes do criatório aparecerão nesta área.</p>
          </div>
        </div>
      ) : (
        <ol className="dashboard-activity-list">
          {activities.map((activity, index) => {
            const href = activityHref(activity);
            const activityTone = activity.activityType === "BirdRegistered"
              ? "green"
              : activity.activityType === "ReproductionRegistered"
                ? "rose"
                : "blue";
            const activityContent = (
              <>
                <span aria-hidden="true" className={`dashboard-activity-icon dashboard-activity-icon-${activityTone}`}>
                  {activityTone === "green" ? "♧" : activityTone === "rose" ? "♡" : "↔"}
                </span>
                <span className="dashboard-activity-copy">
                  <strong>{activity.title}</strong>
                  <span>{formatActivityType(activity.activityType)}</span>
                </span>
                <time dateTime={activity.occurredAtUtc}>{formatActivityDate(activity.occurredAtUtc)}</time>
                {href && <span aria-hidden="true" className="dashboard-card-arrow">›</span>}
              </>
            );

            return (
              <li key={`${activity.resourceType}-${activity.resourceId}-${activity.occurredAtUtc}-${index}`}>
                {href ? <a href={href}>{activityContent}</a> : <div className="dashboard-activity-item">{activityContent}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function QuickActionsSection() {
  const quickActions = [
    {
      description: "Adicione uma nova ave ao seu criatório",
      href: "/plantel/aves/novo",
      icon: "♧",
      title: "Cadastrar ave",
      tone: "green"
    },
    {
      description: "Acompanhe as aves cadastradas",
      href: "/plantel/aves",
      icon: "⌁",
      title: "Ver plantel",
      tone: "blue"
    },
    {
      description: "Gerencie outro criatório",
      href: "/onboarding/criatorio/selecionar",
      icon: "↔",
      title: "Trocar criatório",
      tone: "purple"
    }
  ];

  return (
    <section aria-labelledby="titulo-atalhos" className="dashboard-quick-actions dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Acesso rápido</p>
          <h2 id="titulo-atalhos">Atalhos rápidos</h2>
          <p className="dashboard-section-lede">Acesse as principais funcionalidades do sistema.</p>
        </div>
        <span aria-hidden="true" className="dashboard-quick-action-symbol">ϟ</span>
      </div>
      <div className="dashboard-quick-action-grid">
        {quickActions.map((action) => (
          <a className={`dashboard-quick-action dashboard-quick-action-${action.tone}`} href={action.href} key={action.href}>
            <span aria-hidden="true" className="dashboard-quick-action-icon">{action.icon}</span>
            <span className="dashboard-quick-action-copy">
              <strong>{action.title}</strong>
              <span>{action.description}</span>
            </span>
            <span aria-hidden="true" className="dashboard-card-arrow">›</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function InspirationSection() {
  return (
    <section aria-label="Mensagem do Criatório Virtual" className="dashboard-inspiration">
      <div className="dashboard-inspiration-image" aria-hidden="true">
        <img alt="" src="/assets/imagery/birds/great-tit-header-hd.webp" />
      </div>
      <div className="dashboard-inspiration-copy">
        <strong>Paixão que se organiza,<br />resultados que se multiplicam.</strong>
        <span>— Criatório Virtual</span>
      </div>
      <blockquote>“Cuidar de aves é preservar histórias, cores e gerações.”</blockquote>
    </section>
  );
}

function DashboardContent({
  dashboard,
  farm,
  onRefresh,
  refreshing,
  sessionEmail
}: Readonly<{
  dashboard: DashboardData;
  farm: BreedingFarmSummary;
  onRefresh: () => void;
  refreshing: boolean;
  sessionEmail: string;
}>) {
  const { activeBirdCount, activeReproductionCount, pendingIdentificationCount } = dashboard.indicators;

  return (
    <AuthenticatedShell activeNav="dashboard" email={sessionEmail} farmName={farm.name}>
      <header className="dashboard-page-header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Olá, criador.</h1>
          <p className="dashboard-lede">Aqui está um resumo do que está acontecendo no {farm.name}.</p>
        </div>
        <button aria-label="Atualizar dados do dashboard" className="dashboard-refresh-action" disabled={refreshing} onClick={onRefresh} type="button">
          <span aria-hidden="true">↻</span>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </header>

      {dashboard.isPartial && (
        <div className="dashboard-partial-notice" role="status">
          Alguns dados do painel não foram entregues. Os indicadores disponíveis continuam visíveis.
        </div>
      )}

      <section aria-labelledby="titulo-indicadores" className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">Hoje no criatório</p>
            <h2 id="titulo-indicadores">Indicadores principais</h2>
          </div>
        </div>
        <div className="dashboard-metrics-grid">
          <DashboardMetric detail={formatCount(activeBirdCount, "ave ativa", "aves ativas")} label="Aves ativas" value={activeBirdCount} />
          <DashboardMetric detail={formatCount(pendingIdentificationCount, "ave aguardando", "aves aguardando")} label="Identificação pendente" tone="orange" value={pendingIdentificationCount} />
          <DashboardMetric detail={formatCount(activeReproductionCount, "registro ativo", "registros ativos")} label="Reproduções ativas" tone="rose" value={activeReproductionCount} />
          <DashboardMetric detail={formatCount(dashboard.activities.length, "registro recente", "registros recentes")} label="Atividades recentes" tone="blue" value={dashboard.activities.length} />
        </div>
      </section>

      <QuickActionsSection />
      <div className="dashboard-secondary-grid">
        <PendingSection pending={dashboard.pending} />
        <ActivitiesSection activities={dashboard.activities} />
      </div>
      <InspirationSection />
    </AuthenticatedShell>
  );
}

function DashboardScreen() {
  const { error, refresh, session, status } = useAuth();
  const [view, setView] = useState<DashboardView>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const loadDashboard = useCallback(async (recoverSession = true) => {
    setView({ kind: "loading" });

    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      client.current!.setTenant(selection.selectedBreedingFarmId ?? undefined);

      if (selection.breedingFarms.length === 0) {
        setView({ kind: "empty" });
        return;
      }

      const selectedFarm = selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId);
      if (!selectedFarm) {
        setView({ kind: "unselected" });
        return;
      }

      const dashboard = normalizeDashboard(await client.current!.request<unknown>("api/dashboard"));
      if (dashboard.breedingFarmId !== selectedFarm.breedingFarmId) {
        throw new StaleTenantResponseError();
      }
      setView({ dashboard, farm: selectedFarm, kind: "ready" });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401 && recoverSession) {
        const refreshResult = await refresh();
        if (refreshResult.ok) await loadDashboard(false);
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 403) {
        setView({ kind: "blocked", message: "Sua conta não tem permissão para consultar este dashboard." });
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

      setView({
        kind: "error",
        message: requestError instanceof ApiError && requestError.status >= 500
          ? "O dashboard está indisponível no momento. Tente novamente em instantes."
          : requestError instanceof StaleTenantResponseError
            ? "O criatório selecionado mudou em outra janela. Atualize o dashboard para continuar."
            : "Verifique sua conexão e tente novamente."
      });
    }
  }, [refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadDashboard();
  }, [loadDashboard, status]);

  async function handleRefresh() {
    setRefreshing(true);
    client.current?.clearCache();
    await loadDashboard();
    setRefreshing(false);
  }

  if (status === "loading") return <AccessState heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <AccessState heading="Não foi possível abrir o dashboard" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <AccessState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated") return <AccessState heading="Entre para consultar o dashboard" message="Faça login para acompanhar os indicadores do seu criatório." />;

  if (view.kind === "loading") return <AccessState heading="Carregando seu dashboard" message="Só um instante enquanto organizamos os dados do criatório." />;
  if (view.kind === "error") return <AccessState heading="Não foi possível carregar o dashboard" message={view.message} onRetry={() => void loadDashboard()} />;
  if (view.kind === "blocked") return <AccessState heading="Acesso bloqueado" message={view.message} onRetry={() => void loadDashboard()} retryLabel="Verificar novamente" />;
  if (view.kind === "empty") return <AccessState actionHref="/onboarding/criatorio" actionLabel="Criar meu criatório" heading="Crie seu primeiro criatório" message="Ainda não existe um criatório vinculado a esta conta. Crie um agora para liberar seu dashboard." />;
  if (view.kind === "unselected") return <AccessState actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message="Escolha um criatório para consultar seus indicadores e atividades." />;
  if (view.kind === "missing") return <AccessState actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar outro criatório" heading="Criatório indisponível" message="Não foi possível localizar o criatório selecionado. Escolha outro para continuar." onRetry={() => void loadDashboard()} />;
  if (!session) return null;

  return <DashboardContent dashboard={view.dashboard} farm={view.farm} onRefresh={() => void handleRefresh()} refreshing={refreshing} sessionEmail={session.email} />;
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardScreen />
    </AuthProvider>
  );
}
