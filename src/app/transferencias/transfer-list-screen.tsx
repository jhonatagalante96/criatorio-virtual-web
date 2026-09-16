"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../lib/http/api-client";
import { useAuth } from "../../lib/auth/auth-context";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { DashboardIcon } from "../components/dashboard-icons";
import { normalizeFarmResponse, selectedFarmFromResponse, type BreedingFarmSelectionResponse } from "../reproducao/reproduction-data";
import {
  formatTransferTimestamp,
  normalizeTransferList,
  transferErrorMessage,
  transferStatusClass,
  transferStatusLabel,
  type InternalTransferListResponse,
  type TransferDirection,
  type TransferStatusFilter
} from "./transfer-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type ListState = "error" | "loading" | "ready";

const PAGE_SIZE = 20;

function directionTabId(direction: TransferDirection): string {
  return direction === "Received" ? "transfer-tab-received" : "transfer-tab-sent";
}

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar as transferências.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o criatório selecionado. Tente novamente.";
}

function TransferStateCard({
  actionHref,
  actionLabel,
  heading,
  message,
  onRetry
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void }>) {
  return (
    <section className="document-wizard-state" role={onRetry ? "alert" : undefined}>
      <span aria-hidden="true" className="document-wizard-state-icon"><DashboardIcon name="transfer" /></span>
      <h1>{heading}</h1>
      <p>{message}</p>
      {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}
      {actionHref && actionLabel && <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>}
    </section>
  );
}

function TransferStatusBadge({ status }: Readonly<{ status: string }>) {
  return <span className={`transfer-status-badge ${transferStatusClass(status)}`}>{transferStatusLabel(status)}</span>;
}

export function TransferListScreen() {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);
  const listRequestVersion = useRef(0);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [direction, setDirection] = useState<TransferDirection>("Received");
  const [filter, setFilter] = useState<TransferStatusFilter>("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<InternalTransferListResponse>();
  const [listError, setListError] = useState<string>();
  const [listState, setListState] = useState<ListState>("loading");

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
      setFarmState(error instanceof ApiError && [403, 404, 409].includes(error.status) ? "blocked" : "error");
      setFarmError(farmErrorMessage(error));
    }
  }, [refresh]);

  const loadTransfers = useCallback(async (recoverSession = true) => {
    if (!selectedFarmId) return;
    const version = ++listRequestVersion.current;
    setListState("loading");
    setListError(undefined);
    setList(undefined);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filter) query.set("status", filter);
    const path = direction === "Sent" ? "sent" : "received";

    try {
      const response = await client.current!.request<InternalTransferListResponse>(`api/internal-transfers/${path}?${query.toString()}`);
      if (version !== listRequestVersion.current) return;
      setList(normalizeTransferList(response));
      setListState("ready");
    } catch (error) {
      if (version !== listRequestVersion.current || error instanceof StaleTenantResponseError) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === listRequestVersion.current) {
          await loadTransfers(false);
          return;
        }
      }
      setListState("error");
      setListError(transferErrorMessage(error));
    }
  }, [direction, filter, page, refresh, selectedFarmId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadFarm();
    return () => {
      farmRequestVersion.current += 1;
      listRequestVersion.current += 1;
    };
  }, [loadFarm, status]);

  useEffect(() => {
    if (status !== "authenticated" || farmState !== "ready" || !selectedFarmId) return;
    void loadTransfers();
    return () => { listRequestVersion.current += 1; };
  }, [farmState, loadTransfers, selectedFarmId, status]);

  function changeDirection(value: TransferDirection) {
    setPage(1);
    setDirection(value);
  }

  function changeFilter(value: TransferStatusFilter) {
    setPage(1);
    setFilter(value);
  }

  function handleDirectionTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: TransferDirection) {
    let next: TransferDirection | undefined;
    if (event.key === "ArrowRight") next = current === "Received" ? "Sent" : "Received";
    if (event.key === "ArrowLeft") next = current === "Sent" ? "Received" : "Sent";
    if (event.key === "Home") next = "Received";
    if (event.key === "End") next = "Sent";
    if (!next) return;

    event.preventDefault();
    changeDirection(next);
    document.getElementById(directionTabId(next))?.focus();
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="transfers" email={session?.email} farmName={farmName} label="Preparando transferências" message="Consultando o criatório selecionado." />;
  }
  if (status === "unauthenticated") {
    return <TransferStateCard actionHref="/login" actionLabel="Entrar" heading="Entre para consultar as transferências" message="Sua sessão é necessária para visualizar as solicitações do criatório." />;
  }
  if (status === "forbidden" || status === "error") {
    return <TransferStateCard heading="Não foi possível abrir as transferências" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="transfers" email={session.email} farmName={farmName} label="Preparando transferências" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><TransferStateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para consultar as transferências."} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><TransferStateCard heading="Não foi possível consultar o criatório" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }

  const heading = direction === "Received" ? "Transferências recebidas" : "Transferências enviadas";
  const emptyHeading = filter ? "Nenhuma transferência encontrada" : direction === "Received" ? "Nenhuma transferência recebida" : "Nenhuma transferência enviada";
  const emptyMessage = filter
    ? "Não há solicitações com essa situação. Altere o filtro para consultar outras transferências."
    : direction === "Received"
      ? "Quando outro criatório solicitar uma transferência para você, ela aparecerá aqui."
      : "As solicitações iniciadas pelo seu criatório aparecerão aqui.";

  return (
    <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}>
      <main className="document-wizard-page transfer-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><span aria-current="page">Transferências</span></nav>
        <header className="document-wizard-header transfer-page-header">
          <div><p className="eyebrow">Transferências · Criatório selecionado</p><h1>Transferências</h1><p>Consulte solicitações enviadas e recebidas neste criatório.</p></div>
          <div className="document-wizard-header-actions"><Link className="auth-primary-action" href="/transferencias/nova">Nova transferência</Link></div>
        </header>

        <section aria-busy={listState === "loading"} aria-labelledby="titulo-transferencias" className="document-history-results document-wizard-card transfer-results">
          <header className="document-history-results-heading transfer-results-heading">
            <div><p className="eyebrow">{farmName}</p><h2 id="titulo-transferencias">{heading}</h2><p>Os detalhes mostram somente o resumo relacionado à transferência.</p></div>
            <label className="document-history-filter" htmlFor="filtro-status-transferencia"><span>Filtrar por situação</span><select id="filtro-status-transferencia" disabled={listState === "loading"} onChange={(event) => changeFilter(event.target.value as TransferStatusFilter)} value={filter}>
              <option value="">Todas as situações</option>
              <option value="Pending">Pendentes</option>
              <option value="Accepted">Concluídas</option>
              <option value="Rejected">Rejeitadas</option>
              <option value="Cancelled">Canceladas</option>
            </select></label>
          </header>

          <div aria-label="Tipo de transferência" className="transfer-direction-tabs" role="tablist">
            <button aria-controls="transfer-panel" aria-selected={direction === "Received"} id={directionTabId("Received")} onClick={() => changeDirection("Received")} onKeyDown={(event) => handleDirectionTabKeyDown(event, "Received")} role="tab" tabIndex={direction === "Received" ? 0 : -1} type="button">Recebidas</button>
            <button aria-controls="transfer-panel" aria-selected={direction === "Sent"} id={directionTabId("Sent")} onClick={() => changeDirection("Sent")} onKeyDown={(event) => handleDirectionTabKeyDown(event, "Sent")} role="tab" tabIndex={direction === "Sent" ? 0 : -1} type="button">Enviadas</button>
          </div>

          <div aria-labelledby={directionTabId(direction)} id="transfer-panel" role="tabpanel" tabIndex={0}>
            {listState === "loading" && <div className="document-history-state" role="status"><span aria-hidden="true" className="document-preview-dialog-spinner" /><strong>Consultando transferências…</strong><span>Buscando somente solicitações autorizadas para o criatório selecionado.</span></div>}
            {listState === "error" && <div className="document-history-state is-error" role="alert"><strong>Não foi possível consultar as transferências</strong><span>{listError}</span><button className="auth-secondary-action" onClick={() => void loadTransfers()} type="button">Tentar novamente</button></div>}
            {listState === "ready" && list?.items.length === 0 && <div className="document-history-state" role="status">
              <strong>{emptyHeading}</strong>
              <span>{emptyMessage}</span>
              {filter && <button className="auth-secondary-action" onClick={() => changeFilter("")} type="button">Limpar filtro</button>}
            </div>}
            {listState === "ready" && list && list.items.length > 0 && <>
              <ul aria-label={heading} className="document-history-list transfer-history-list">
                {list.items.map((item) => {
                  const otherFarmName = direction === "Sent" ? item.destinationBreedingFarmName : item.sourceBreedingFarmName;
                  return <li key={item.transferRequestId}>
                    <Link aria-label={`Ver detalhes da transferência de ${item.birdName}`} className="document-history-item transfer-history-item" href={`/transferencias/${encodeURIComponent(item.transferRequestId)}`}>
                      <span aria-hidden="true" className="document-history-item-icon"><DashboardIcon name="bird" /></span>
                      <span className="document-history-item-main">
                        <span className="document-history-item-title"><strong>{item.birdName}</strong><TransferStatusBadge status={item.status} /></span>
                        <span className="transfer-history-counterparty">{direction === "Sent" ? "Destino" : "Origem"}: {otherFarmName}</span>
                        <small>{item.ringNumber ? `Anilha ${item.ringNumber}` : "Sem anilha informada"} <span aria-hidden="true">·</span> Solicitada em {formatTransferTimestamp(item.createdAtUtc)}</small>
                      </span>
                      <span className="document-history-item-actions"><span className="auth-secondary-action">Ver detalhes <span aria-hidden="true">›</span></span></span>
                    </Link>
                  </li>;
                })}
              </ul>
              {list.totalPages > 1 && <nav aria-label="Paginação das transferências" className="document-history-pagination transfer-history-pagination">
                <button aria-label="Página anterior" className="auth-secondary-action" disabled={list.page <= 1} onClick={() => setPage(list.page - 1)} type="button">Anterior</button>
                <span aria-live="polite">Página {list.page} de {list.totalPages} · {list.totalCount} solicitações</span>
                <button aria-label="Próxima página" className="auth-secondary-action" disabled={list.page >= list.totalPages} onClick={() => setPage(list.page + 1)} type="button">Próxima</button>
              </nav>}
            </>}
          </div>
        </section>
        <p className="auth-footer">A ficha completa da ave não é aberta enquanto a transferência estiver pendente.</p>
      </main>
    </AuthenticatedShell>
  );
}
