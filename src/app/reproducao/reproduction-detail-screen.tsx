"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import {
  birdSexLabel,
  birdStatusLabel,
  formatReproductionDate,
  formatReproductionTimestamp,
  normalizeFarmResponse,
  reproductionStatusClass,
  reproductionStatusLabel,
  selectedFarmFromResponse,
  type BreedingFarmSelectionResponse,
  type ReproductionDetailsResponse
} from "./reproduction-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type DetailState = "error" | "loading" | "ready";

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de continuar.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado. Tente novamente.";
}

function reproductionDetailsErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "Esta reprodução não existe ou não está disponível no criatório selecionado.";
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para consultar esta reprodução.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar esta reprodução.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar esta reprodução. Tente novamente.";
}

function StateCard({
  actionHref,
  actionLabel,
  heading,
  message,
  onRetry
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return (
    <main className="document-wizard-page">
      <section className="document-wizard-state" role={onRetry ? "alert" : undefined}>
        <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="heart" /></span>
        <h1>{heading}</h1>
        <p>{message}</p>
        {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
        {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
      </section>
    </main>
  );
}

export function ReproductionBirdSnapshot({
  label,
  bird
}: Readonly<{ label: string; bird: ReproductionDetailsResponse["maleBird"] }>) {
  return (
    <article className="reproduction-detail-bird">
      <header><span aria-hidden="true" className="reproduction-detail-bird-icon"><DashboardIcon name="bird" /></span><div><p className="eyebrow">{label}</p><h3>{bird.name}</h3></div></header>
      <dl>
        <div><dt>Sexo</dt><dd>{birdSexLabel(bird.sex)}</dd></div>
        <div><dt>Anilha</dt><dd>{bird.ringNumber || "Não informada"}</dd></div>
        <div><dt>Nascimento</dt><dd>{formatReproductionDate(bird.birthDate)}</dd></div>
        <div><dt>Situação retornada</dt><dd>{birdStatusLabel(bird.status)}</dd></div>
      </dl>
    </article>
  );
}

export function ReproductionDetailScreen({ reproductionId }: Readonly<{ reproductionId: string }>) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [detail, setDetail] = useState<ReproductionDetailsResponse>();
  const [detailError, setDetailError] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>("loading");

  if (!client.current) client.current = createApiClient();

  const loadFarm = useCallback(async (recoverSession = true) => {
    const version = ++farmRequestVersion.current;
    setFarmState("loading");
    setFarmError(undefined);
    try {
      const rawResponse = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (version !== farmRequestVersion.current) return;
      const selectedFarm = selectedFarmFromResponse(normalizeFarmResponse(rawResponse));
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setSelectedFarmId(undefined);
        setFarmName("Criatório selecionado");
        setFarmState("blocked");
        return;
      }

      client.current!.setTenant(selectedFarm.breedingFarmId);
      setSelectedFarmId(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      setFarmState("ready");
    } catch (error) {
      if (version !== farmRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === farmRequestVersion.current) {
          await loadFarm(false);
          return;
        }
      }
      setFarmState(error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409) ? "blocked" : "error");
      setFarmError(farmErrorMessage(error));
    }
  }, [refresh]);

  const loadDetails = useCallback(async (recoverSession = true) => {
    if (!selectedFarmId || !reproductionId) return;
    const version = ++detailRequestVersion.current;
    setDetailState("loading");
    setDetailError(undefined);
    setDetail(undefined);
    try {
      const response = await client.current!.request<ReproductionDetailsResponse>(`api/reproductions/${encodeURIComponent(reproductionId)}`);
      if (version !== detailRequestVersion.current) return;
      setDetail(response);
      setDetailState("ready");
    } catch (error) {
      if (version !== detailRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === detailRequestVersion.current) {
          await loadDetails(false);
          return;
        }
      }
      setDetailState("error");
      setDetailError(reproductionDetailsErrorMessage(error));
    }
  }, [refresh, reproductionId, selectedFarmId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadFarm();
    return () => {
      farmRequestVersion.current += 1;
      detailRequestVersion.current += 1;
    };
  }, [loadFarm, status]);

  useEffect(() => {
    if (status !== "authenticated" || farmState !== "ready" || !selectedFarmId) return;
    void loadDetails();
    return () => { detailRequestVersion.current += 1; };
  }, [farmState, loadDetails, selectedFarmId, status]);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="reproduction" email={session?.email} farmName={farmName} label="Preparando reprodução" message="Consultando o criatório selecionado." />;
  }
  if (status === "unauthenticated") {
    return <StateCard actionHref="/login" actionLabel="Entrar" heading="Entre para consultar esta reprodução" message="Sua sessão é necessária para visualizar o histórico privado do criatório." />;
  }
  if (status === "forbidden" || status === "error") {
    return <StateCard heading="Não foi possível abrir a reprodução" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="reproduction" email={session.email} farmName={farmName} label="Preparando reprodução" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para consultar esta reprodução."} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard heading="Não foi possível consultar o criatório" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }
  if (detailState === "error") {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><StateCard actionHref={detailError?.includes("Selecione novamente") ? "/onboarding/criatorio/selecionar" : "/reproducao"} actionLabel={detailError?.includes("Selecione novamente") ? "Selecionar criatório" : "Voltar às reproduções"} heading="Não foi possível consultar esta reprodução" message={detailError ?? "Tente novamente para continuar."} onRetry={() => void loadDetails()} /></AuthenticatedShell>;
  }
  if (detailState === "loading" || !detail) {
    return <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}><main className="document-wizard-page"><div className="document-history-state" role="status"><span aria-hidden="true" className="document-preview-dialog-spinner" /><strong>Consultando reprodução…</strong><span>Carregando os dados retornados pelo histórico do criatório.</span></div></main></AuthenticatedShell>;
  }

  return (
    <AuthenticatedShell activeNav="reproduction" email={session.email} farmName={farmName}>
      <main className="document-wizard-page reproduction-history-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/reproducao">Reproduções</Link><span aria-hidden="true">›</span><span aria-current="page">Detalhes</span></nav>
        <header className="document-wizard-header">
          <div><p className="eyebrow">Histórico na origem</p><h1>Detalhes da reprodução</h1><p>Registro consultado no contexto do criatório selecionado.</p></div>
          <Link className="document-wizard-back-link" href="/reproducao">Voltar às reproduções</Link>
        </header>

        <section aria-labelledby="titulo-detalhes-reproducao" className="document-wizard-card reproduction-detail-card">
          <header className="reproduction-detail-heading">
            <div><p className="eyebrow">Período da reprodução</p><h2 id="titulo-detalhes-reproducao">{formatReproductionDate(detail.startDate)}{detail.endDate ? ` — ${formatReproductionDate(detail.endDate)}` : " — em andamento"}</h2></div>
            <span className={`reproduction-status-badge ${reproductionStatusClass(detail.status)}`}>{reproductionStatusLabel(detail.status)}</span>
          </header>

          <div className="reproduction-detail-pair" aria-label="Casal registrado">
            <ReproductionBirdSnapshot bird={detail.maleBird} label="Macho" />
            <span aria-hidden="true" className="reproduction-detail-pair-mark">×</span>
            <ReproductionBirdSnapshot bird={detail.femaleBird} label="Fêmea" />
          </div>

          <dl className="reproduction-detail-record">
            <div><dt>Data de início</dt><dd>{formatReproductionDate(detail.startDate)}</dd></div>
            <div><dt>Data de término</dt><dd>{formatReproductionDate(detail.endDate)}</dd></div>
            <div><dt>Criada em</dt><dd>{formatReproductionTimestamp(detail.createdAtUtc)}</dd></div>
            <div><dt>Última atualização</dt><dd>{formatReproductionTimestamp(detail.updatedAtUtc)}</dd></div>
          </dl>

          <section aria-labelledby="titulo-observacoes-reproducao" className="reproduction-detail-notes">
            <h3 id="titulo-observacoes-reproducao">Observações</h3>
            <p>{detail.notes?.trim() || "Nenhuma observação informada."}</p>
          </section>
          <p className="document-wizard-privacy-note"><span aria-hidden="true">i</span>Os dados do casal são os fornecidos pelo endpoint de histórico na origem. Esta tela não consulta fichas atuais de aves transferidas.</p>
        </section>
      </main>
    </AuthenticatedShell>
  );
}
