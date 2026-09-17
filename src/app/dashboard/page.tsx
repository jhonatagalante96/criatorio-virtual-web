"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { AppLoadingState } from "../components/app-loading-state";
import { BrandLockup, BrandPanel } from "../components/brand";
import { DashboardIcon } from "../components/dashboard-icons";
import { PasskeyActivationPrompt } from "../components/passkey-activation-prompt";
import { SessionRecovery } from "../components/session-recovery";
import { DashboardStatisticsSummary } from "../components/dashboard-statistics-summary";
import type { DashboardIconName } from "../components/dashboard-icons";
import { resolveBirdImageUrl } from "../plantel/aves/bird-image";

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
  imageUrl?: string | null;
  resourceType: string;
  title: string;
}

interface DashboardActivity {
  activityType: string;
  occurredAtUtc: string;
  imageUrl?: string | null;
  resourceId: string;
  resourceType: string;
  title: string;
}

interface DashboardBirdImage {
  birdId: string;
  imageUrl?: string | null;
}

interface DashboardBirdImageResponse {
  breedingFarmId: string;
  items: DashboardBirdImage[];
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

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function sameTenantId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function normalizeDashboard(value: unknown): DashboardData {
  const root = isRecord(value) ? value : {};
  const rawIndicators = isRecord(root.indicators) ? root.indicators : undefined;
  const rawPending = Array.isArray(root.pending) ? root.pending : undefined;
  const rawActivities = Array.isArray(root.activities) ? root.activities : undefined;

  const pending = (rawPending ?? []).filter(isRecord).map((item) => {
    const code = stringValue(item.code, "Pending");
    return {
      code,
      count: countValue(item.count),
      imageUrl: nullableString(item.imageUrl),
      resourceType: stringValue(item.resourceType, ""),
      title: code === "BirdIdentificationPending"
        ? "Aves com identificação pendente"
        : stringValue(item.title, "Pendência no criatório")
    };
  });

  const activities = (rawActivities ?? []).filter(isRecord).map((item) => ({
    activityType: stringValue(item.activityType, "ActivityRegistered"),
    occurredAtUtc: stringValue(item.occurredAtUtc, ""),
    imageUrl: nullableString(item.imageUrl),
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

function normalizeDashboardBirdImages(value: unknown): DashboardBirdImageResponse {
  const root = isRecord(value) ? value : {};
  const rawItems = Array.isArray(root.items) ? root.items : [];

  return {
    breedingFarmId: stringValue(root.breedingFarmId, ""),
    items: rawItems.filter(isRecord).map((item) => ({
      birdId: stringValue(item.birdId, ""),
      imageUrl: nullableString(item.imageUrl)
    }))
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

function formatDashboardDate(value = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric"
  }).format(value);
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

function isBirdActivity(activity: DashboardActivity): boolean {
  return activity.resourceType.toLowerCase() === "bird" && Boolean(activity.resourceId);
}

async function requestDashboardBirdImages(
  client: ApiClient,
  path: string,
  breedingFarmId: string
): Promise<DashboardBirdImage[]> {
  try {
    const response = normalizeDashboardBirdImages(await client.request<unknown>(path));
    if (!sameTenantId(response.breedingFarmId, breedingFarmId)) throw new StaleTenantResponseError();
    return response.items;
  } catch (requestError) {
    if (requestError instanceof StaleTenantResponseError) throw requestError;
    return [];
  }
}

async function enrichDashboardWithBirdImages(
  client: ApiClient,
  dashboard: DashboardData,
  breedingFarmId: string
): Promise<DashboardData> {
  const hasBirdActivities = dashboard.activities.some(isBirdActivity);
  const hasBirdPending = dashboard.pending.some((item) => Boolean(pendingHref(item)));
  if (!hasBirdActivities && !hasBirdPending) return dashboard;

  const [recentBirds, pendingBirds] = await Promise.all([
    hasBirdActivities
      ? requestDashboardBirdImages(client, "api/birds?sortBy=createdAt&sortDirection=desc&page=1&pageSize=10", breedingFarmId)
      : Promise.resolve([]),
    hasBirdPending
      ? requestDashboardBirdImages(client, "api/birds?identificationPending=true&sortBy=createdAt&sortDirection=desc&page=1&pageSize=1", breedingFarmId)
      : Promise.resolve([])
  ]);

  const imagesByBirdId = new Map(recentBirds.map((bird) => [bird.birdId, bird.imageUrl]));
  const pendingImageUrl = pendingBirds[0]?.imageUrl ?? null;

  return {
    ...dashboard,
    activities: dashboard.activities.map((activity) => {
      const imageUrl = imagesByBirdId.get(activity.resourceId);
      return imageUrl ? { ...activity, imageUrl } : activity;
    }),
    pending: dashboard.pending.map((item) => item.imageUrl || !pendingHref(item)
      ? item
      : { ...item, imageUrl: pendingImageUrl })
  };
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
            <Link className="text-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardMetric({ href, icon, label, value, tone = "green" }: Readonly<{
  href?: string;
  icon: DashboardIconName;
  label: string;
  tone?: "green" | "orange" | "blue" | "rose";
  value: number;
}>) {
  const metric = (
    <article className={`dashboard-metric dashboard-metric-${tone}`}>
      <span aria-hidden="true" className="dashboard-metric-icon"><DashboardIcon name={icon} /></span>
      <div className="dashboard-metric-main">
        <strong>{value}</strong>
        <span className="dashboard-metric-label">{label}</span>
      </div>
      <span aria-hidden="true" className="dashboard-metric-arrow">›</span>
    </article>
  );

  return href
    ? <Link aria-label={`Ver ${label.toLowerCase()}`} className="dashboard-metric-link" href={href}>{metric}</Link>
    : metric;
}

function DashboardBirdPhoto({ className, imageUrl }: Readonly<{ className: string; imageUrl?: string | null }>) {
  if (!imageUrl) return null;

  return (
    <span aria-hidden="true" className={className}>
      <img alt="" src={resolveBirdImageUrl(imageUrl)} />
    </span>
  );
}

function PendingSection({ pending }: Readonly<{ pending: DashboardPending[] }>) {
  return (
    <section aria-labelledby="titulo-pendencias" className="dashboard-section dashboard-pending-section">
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Atenção</p>
          <h2 id="titulo-pendencias">Pendências <span className="dashboard-heading-badge">{pending.length}</span></h2>
          <p className="dashboard-section-lede">Itens que precisam da sua atenção.</p>
        </div>
        <Link className="dashboard-section-action" href="/plantel/aves?identificationPending=true">Ver todas <span aria-hidden="true">›</span></Link>
      </div>
      {pending.length === 0 ? (
        <div className="dashboard-empty-state">
          <span aria-hidden="true" className="dashboard-empty-mark">✓</span>
          <div>
            <strong>Tudo em dia por aqui.</strong>
            <p>Não há pendências que precisam da sua atenção agora.</p>
          </div>
        </div>
      ) : (
        <ul className="dashboard-pending-list">
          {pending.map((item) => {
            const href = pendingHref(item);
            const content = (
              <>
                {item.imageUrl ? (
                  <DashboardBirdPhoto className="dashboard-pending-mark dashboard-bird-photo" imageUrl={item.imageUrl} />
                ) : (
                  <span aria-hidden="true" className="dashboard-pending-mark">!</span>
                )}
                <span className="dashboard-pending-copy">
                  <strong>{item.title}</strong>
                  <span>{formatCount(item.count, "registro", "registros")}</span>
                </span>
                {href && <span aria-hidden="true" className="dashboard-card-arrow">→</span>}
              </>
            );

            return (
              <li key={`${item.code}-${item.resourceType}`}>
                {href ? <Link href={href}>{content}</Link> : <div className="dashboard-pending-item">{content}</div>}
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
          <p className="dashboard-section-lede">Últimas ações realizadas no seu criatório.</p>
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
            const activityIcon: DashboardIconName = activityTone === "green"
              ? "bird"
              : activityTone === "rose"
                ? "heart"
                : "transfer";
            const activityContent = (
              <>
                {activity.imageUrl ? (
                  <DashboardBirdPhoto className={`dashboard-activity-icon dashboard-activity-icon-${activityTone} dashboard-bird-photo`} imageUrl={activity.imageUrl} />
                ) : (
                  <span aria-hidden="true" className={`dashboard-activity-icon dashboard-activity-icon-${activityTone}`}>
                    <DashboardIcon name={activityIcon} />
                  </span>
                )}
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
                {href ? <Link href={href}>{activityContent}</Link> : <div className="dashboard-activity-item">{activityContent}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function QuickActionsSection() {
  const quickActions: Array<{
    description: string;
    href?: string;
    icon: DashboardIconName;
    title: string;
    tone: "blue" | "green" | "purple" | "rose";
  }> = [
    {
      description: "Adicione uma nova ave ao seu criatório",
      href: "/plantel/aves/novo",
      icon: "bird",
      title: "Cadastrar ave",
      tone: "green"
    },
    {
      description: "Acompanhe seus cruzamentos",
      href: "/reproducao/novo",
      icon: "heart",
      title: "Registrar reprodução",
      tone: "rose"
    },
    {
      description: "Registre entrada ou saída de aves",
      href: "/transferencias/nova",
      icon: "transfer",
      title: "Nova transferência",
      tone: "blue"
    },
    {
      description: "Adicione resultados de competições",
      icon: "trophy",
      title: "Registrar competição",
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
        <span className="dashboard-quick-action-customize"><DashboardIcon name="settings" /> Personalizar atalhos</span>
      </div>
      <div className="dashboard-quick-action-grid">
        {quickActions.map((action) => (
          action.href ? (
            <Link className={`dashboard-quick-action dashboard-quick-action-${action.tone}`} href={action.href} key={action.title}>
              <span aria-hidden="true" className="dashboard-quick-action-icon"><DashboardIcon name={action.icon} /></span>
              <span className="dashboard-quick-action-copy">
                <strong>{action.title}</strong>
                <span>{action.description}</span>
              </span>
              <span aria-hidden="true" className="dashboard-card-arrow">›</span>
            </Link>
          ) : (
            <div aria-disabled="true" className={`dashboard-quick-action dashboard-quick-action-${action.tone} is-disabled`} key={action.title} title="Módulo em desenvolvimento">
              <span aria-hidden="true" className="dashboard-quick-action-icon"><DashboardIcon name={action.icon} /></span>
              <span className="dashboard-quick-action-copy">
                <strong>{action.title}</strong>
                <span>{action.description}</span>
              </span>
              <span aria-hidden="true" className="dashboard-card-arrow">›</span>
            </div>
          )
        ))}
      </div>
    </section>
  );
}

function InspirationSection() {
  return (
    <section aria-label="Mensagem do Criatório Virtual" className="dashboard-inspiration">
      <div aria-hidden="true" className="dashboard-inspiration-image" />
      <div className="dashboard-inspiration-copy">
        <strong>Paixão que se organiza,<br />resultados que se multiplicam.</strong>
        <span>— Criatório Virtual</span>
      </div>
      <blockquote>
        <span>“Cuidar de aves é preservar histórias, cores e gerações.”</span>
        <DashboardIcon name="leaf" />
      </blockquote>
    </section>
  );
}

function DashboardContent({
  dashboard,
  farm,
  sessionEmail
}: Readonly<{
  dashboard: DashboardData;
  farm: BreedingFarmSummary;
  sessionEmail: string;
}>) {
  const { activeBirdCount, activeReproductionCount, pendingIdentificationCount } = dashboard.indicators;
  const transferCount = dashboard.activities.filter((activity) => activity.activityType.toLowerCase().includes("transfer")).length;

  return (
    <AuthenticatedShell activeNav="dashboard" email={sessionEmail} farmName={farm.name}>
      <header className="dashboard-page-header">
        <div>
          <h1>Painel</h1>
          <p className="dashboard-lede">Visão geral do seu criatório. Acompanhe suas aves, reproduções, transferências e muito mais.</p>
        </div>
        <div className="dashboard-page-context">
          <p><DashboardIcon name="calendar" /> <span>{formatDashboardDate()}</span></p>
          <p><DashboardIcon name="leaf" /> <span>Que tal fazer hoje um grande dia para o seu criatório?</span></p>
        </div>
      </header>

      {dashboard.isPartial && (
        <div className="dashboard-partial-notice" role="status">
          Alguns dados do painel não foram entregues. Os indicadores disponíveis continuam visíveis.
        </div>
      )}

      <PasskeyActivationPrompt variant="dashboard" />

      <section aria-labelledby="titulo-indicadores" className="dashboard-section">
        <h2 className="sr-only" id="titulo-indicadores">Indicadores principais</h2>
        <div className="dashboard-metrics-grid">
          <DashboardMetric href="/plantel/aves" icon="bird" label="Aves Ativas" value={activeBirdCount} />
          <DashboardMetric icon="heart" label="Reproduções registradas" tone="rose" value={activeReproductionCount} />
          <DashboardMetric icon="alert" label="Pendências" tone="orange" value={pendingIdentificationCount} />
          <DashboardMetric icon="transfer" label="Transferências" tone="blue" value={transferCount} />
        </div>
      </section>

      <DashboardStatisticsSummary farmId={farm.breedingFarmId} />
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
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const loadRequestId = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const loadDashboard = useCallback(async (recoverSession = true, staleRetry = 0) => {
    const requestId = ++loadRequestId.current;
    const isCurrentRequest = () => loadRequestId.current === requestId;

    setView({ kind: "loading" });

    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (!isCurrentRequest()) return;

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
      if (!isCurrentRequest()) return;
      if (!sameTenantId(dashboard.breedingFarmId, selectedFarm.breedingFarmId)) {
        throw new StaleTenantResponseError();
      }
      const enrichedDashboard = await enrichDashboardWithBirdImages(client.current!, dashboard, selectedFarm.breedingFarmId);
      if (!isCurrentRequest()) return;
      setView({ dashboard: enrichedDashboard, farm: selectedFarm, kind: "ready" });
    } catch (requestError) {
      if (!isCurrentRequest()) return;

      if (requestError instanceof StaleTenantResponseError && staleRetry < 1) {
        client.current!.clearCache();
        await loadDashboard(false, staleRetry + 1);
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 401 && recoverSession) {
        const refreshResult = await refresh();
        if (!isCurrentRequest()) return;
        if (refreshResult.ok) await loadDashboard(false);
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 403) {
        setView({ kind: "blocked", message: "Sua conta não tem permissão para consultar este painel." });
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
          ? "O painel está indisponível no momento. Tente novamente em instantes."
          : requestError instanceof StaleTenantResponseError
            ? "O criatório selecionado mudou em outra janela. Atualize o painel para continuar."
            : "Verifique sua conexão e tente novamente."
      });
    }
  }, [refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadDashboard();
    return () => {
      loadRequestId.current += 1;
    };
  }, [loadDashboard, status]);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="dashboard" email={session?.email} label="Carregando painel" message="Um instante enquanto preparamos seu espaço." />;
  }
  if (status === "error") return <AccessState heading="Não foi possível abrir o painel" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <AccessState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated") return <SessionRecovery />;

  if (view.kind === "loading") {
    return <AppLoadingState activeNav="dashboard" email={session?.email} label="Carregando painel" message="Um instante enquanto preparamos seu espaço." />;
  }
  if (view.kind === "error") return <AccessState heading="Não foi possível carregar o painel" message={view.message} onRetry={() => void loadDashboard()} />;
  if (view.kind === "blocked") return <AccessState heading="Acesso bloqueado" message={view.message} onRetry={() => void loadDashboard()} retryLabel="Verificar novamente" />;
  if (view.kind === "empty") return <AccessState actionHref="/onboarding/criatorio" actionLabel="Criar meu criatório" heading="Crie seu primeiro criatório" message="Ainda não existe um criatório vinculado a esta conta. Crie um agora para liberar seu painel." />;
  if (view.kind === "unselected") return <AccessState actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message="Escolha um criatório para consultar seus indicadores e atividades." />;
  if (view.kind === "missing") return <AccessState actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar outro criatório" heading="Criatório indisponível" message="Não foi possível localizar o criatório selecionado. Escolha outro para continuar." onRetry={() => void loadDashboard()} />;
  if (!session) return null;

  return <DashboardContent dashboard={view.dashboard} farm={view.farm} sessionEmail={session.email} />;
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardScreen />
    </AuthProvider>
  );
}
