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
  transferErrorMessage,
  transferStatusClass,
  transferStatusLabel,
  type InternalTransferDetailsResponse,
  type InternalTransferRequestResponse
} from "./transfer-data";

type FarmState = "blocked" | "error" | "loading" | "ready";
type DetailState = "error" | "loading" | "ready" | "not-found";
type ActionState = "error" | "idle" | "submitting";
type TransferAction = "accept" | "reject" | "cancel";

const transferActionCopy: Record<TransferAction, { button: string; confirmation: string; group: string; progress: string; prompt: string }> = {
  accept: {
    button: "Aceitar transferência",
    confirmation: "Confirmar aceite",
    group: "Confirmar aceite da transferência",
    progress: "Confirmando…",
    prompt: "Ao aceitar, a ave passará para o criatório selecionado. Confira os dados antes de confirmar."
  },
  reject: {
    button: "Rejeitar transferência",
    confirmation: "Confirmar rejeição",
    group: "Confirmar rejeição da transferência",
    progress: "Rejeitando…",
    prompt: "Ao rejeitar, a solicitação será encerrada e a ave permanecerá no criatório de origem."
  },
  cancel: {
    button: "Cancelar transferência",
    confirmation: "Confirmar cancelamento",
    group: "Confirmar cancelamento da transferência",
    progress: "Cancelando…",
    prompt: "Ao cancelar, a solicitação será encerrada e a ave permanecerá no criatório de origem."
  }
};

function farmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Sua conta não tem permissão para acessar este criatório.";
  if (error instanceof ApiError && error.status === 404) return "O criatório selecionado não está disponível.";
  if (error instanceof ApiError && error.status === 409) return "Selecione novamente um criatório antes de consultar a transferência.";
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

function birdSexLabel(sex: string): string {
  if (sex === "Female") return "Fêmea";
  if (sex === "Male") return "Macho";
  return "Não informado";
}

function birdStatusLabel(status: string): string {
  switch (status) {
    case "Active": return "Ativa";
    case "Archived": return "Arquivada";
    case "Transferred": return "Com transferência pendente";
    case "Deceased": return "Óbito registrado";
    case "Escaped": return "Fuga registrada";
    default: return "Não informado";
  }
}

export function TransferDetailScreen({ transferRequestId }: Readonly<{ transferRequestId: string }>) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const farmRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [selectedFarmId, setSelectedFarmId] = useState<string>();
  const [details, setDetails] = useState<InternalTransferDetailsResponse>();
  const [detailError, setDetailError] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [actionError, setActionError] = useState<string>();
  const [actionNotice, setActionNotice] = useState<string>();
  const [confirmingAction, setConfirmingAction] = useState<TransferAction | null>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const actionButtonRefs = useRef<Partial<Record<TransferAction, HTMLButtonElement | null>>>({});
  const actionErrorRef = useRef<HTMLParagraphElement | null>(null);
  const actionNoticeRef = useRef<HTMLParagraphElement | null>(null);
  const focusReturnAction = useRef<TransferAction | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    if (confirmingAction) {
      confirmationRef.current?.focus();
      return;
    }

    if (focusReturnAction.current) {
      actionButtonRefs.current[focusReturnAction.current]?.focus();
      focusReturnAction.current = null;
    }
  }, [confirmingAction]);

  useEffect(() => {
    if (detailState !== "ready") return;
    if (actionError) actionErrorRef.current?.focus();
    else if (actionNotice) actionNoticeRef.current?.focus();
  }, [actionError, actionNotice, detailState]);

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

  const loadDetails = useCallback(async (recoverSession = true) => {
    if (!selectedFarmId || !transferRequestId) return;
    const version = ++detailRequestVersion.current;
    setDetailState("loading");
    setDetailError(undefined);
    setDetails(undefined);
    try {
      const response = await client.current!.request<InternalTransferDetailsResponse>(`api/internal-transfers/${encodeURIComponent(transferRequestId)}`);
      if (version !== detailRequestVersion.current) return;
      setDetails(response);
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
      if (error instanceof ApiError && error.status === 404) {
        setDetailState("not-found");
        return;
      }
      setDetailState("error");
      setDetailError(transferErrorMessage(error));
    }
  }, [refresh, selectedFarmId, transferRequestId]);

  const performTransferAction = useCallback(async (action: TransferAction, recoverSession = true) => {
    if (!details || details.status !== "Pending" || !selectedFarmId) return;
    const authorizedFarmId = action === "cancel" ? details.sourceBreedingFarmId : details.destinationBreedingFarmId;
    if (authorizedFarmId !== selectedFarmId) return;

    const execute = async (allowSessionRecovery: boolean): Promise<void> => {
      setActionState("submitting");
      setActionError(undefined);
      try {
        if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
        await client.current!.request<InternalTransferRequestResponse>(`api/internal-transfers/${encodeURIComponent(transferRequestId)}/${action}`, { method: "POST" });
        client.current!.clearCache();
        setActionState("idle");
        setConfirmingAction(null);
        setActionNotice(action === "accept"
          ? "A transferência foi aceita. A ave agora pertence ao criatório selecionado."
          : action === "reject"
            ? "A transferência foi rejeitada. A ave permanece no criatório de origem."
            : "A transferência foi cancelada. A ave permanece no criatório de origem.");
        await loadDetails(false);
      } catch (error) {
        if (error instanceof StaleTenantResponseError) {
          setActionState("idle");
          setConfirmingAction(null);
          return;
        }
        if (error instanceof ApiError && error.status === 401 && allowSessionRecovery) {
          csrfToken.current = undefined;
          const result = await refresh({ showLoading: false });
          if (result.ok) {
            await execute(false);
            return;
          }
        }
        setActionState("error");
        setActionError(error instanceof ApiError && error.status === 409
          ? "A situação da transferência mudou enquanto você analisava. Os detalhes foram atualizados."
          : transferErrorMessage(error));
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          setConfirmingAction(null);
          client.current!.clearCache();
          await loadDetails(false);
        }
      }
    };

    await execute(recoverSession);
  }, [details, loadDetails, refresh, selectedFarmId, transferRequestId]);

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
    return <AppLoadingState activeNav="transfers" email={session?.email} farmName={farmName} label="Preparando transferência" message="Consultando os dados autorizados da solicitação." />;
  }
  if (status === "unauthenticated") {
    return <TransferStateCard actionHref="/login" actionLabel="Entrar" heading="Entre para consultar esta transferência" message="Sua sessão é necessária para visualizar os dados da solicitação." />;
  }
  if (status === "forbidden" || status === "error") {
    return <TransferStateCard heading="Não foi possível abrir esta transferência" message="Sua sessão não conseguiu acessar esta área. Tente novamente." onRetry={() => void refresh()} />;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="transfers" email={session.email} farmName={farmName} label="Preparando transferência" message="Consultando o criatório selecionado." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><TransferStateCard actionHref="/onboarding/criatorio/selecionar" actionLabel="Selecionar criatório" heading="Selecione um criatório" message={farmError ?? "Escolha um criatório para consultar esta transferência."} /></AuthenticatedShell>;
  }
  if (farmState === "error") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><TransferStateCard heading="Não foi possível consultar o criatório" message={farmError ?? "Tente novamente para continuar."} onRetry={() => void loadFarm()} /></AuthenticatedShell>;
  }
  if (detailState === "loading") {
    return <AppLoadingState activeNav="transfers" email={session.email} farmName={farmName} label="Consultando transferência" message="Carregando o resumo autorizado da solicitação." />;
  }
  if (detailState === "not-found") {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><main className="document-wizard-page transfer-page"><TransferStateCard actionHref="/transferencias" actionLabel="Voltar às transferências" heading="Transferência não encontrada" message="Esta solicitação não está disponível para o criatório selecionado." /></main></AuthenticatedShell>;
  }
  if (detailState === "error" || !details) {
    return <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}><main className="document-wizard-page transfer-page"><TransferStateCard actionHref="/transferencias" actionLabel="Voltar às transferências" heading="Não foi possível consultar a transferência" message={detailError ?? "Tente novamente para continuar."} onRetry={() => void loadDetails()} /></main></AuthenticatedShell>;
  }

  const received = details.destinationBreedingFarmId === selectedFarmId;
  const sent = details.sourceBreedingFarmId === selectedFarmId;
  const pending = details.status === "Pending";
  const canAccept = received && pending;
  const canReject = received && pending;
  const canCancel = sent && pending;
  const isSubmitting = actionState === "submitting";
  const confirmationCopy = confirmingAction ? transferActionCopy[confirmingAction] : undefined;

  return (
    <AuthenticatedShell activeNav="transfers" email={session.email} farmName={farmName}>
      <main className="document-wizard-page transfer-page transfer-detail-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/transferencias">Transferências</Link><span aria-hidden="true">›</span><span aria-current="page">Detalhes</span></nav>
        <header className="document-wizard-header transfer-detail-header">
          <div><p className="eyebrow">{received ? "Solicitação recebida" : "Solicitação enviada"}</p><h1>Detalhes da transferência</h1><p>Resumo da solicitação entre criatórios.</p></div>
          <Link className="auth-secondary-action" href="/transferencias">Voltar às transferências</Link>
        </header>

        {actionNotice && <p className="transfer-action-notice" ref={actionNoticeRef} role="status" tabIndex={-1}>{actionNotice}</p>}
        {actionError && <p className="transfer-action-error" ref={actionErrorRef} role="alert" tabIndex={-1}>{actionError}</p>}

        <div className="transfer-detail-grid">
          <section aria-labelledby="titulo-resumo-transferencia" className="document-wizard-card transfer-detail-card">
            <header className="transfer-detail-card-heading"><div><p className="eyebrow">Solicitação</p><h2 id="titulo-resumo-transferencia">Resumo</h2></div><span className={`transfer-status-badge ${transferStatusClass(details.status)}`}>{transferStatusLabel(details.status)}</span></header>
            <dl className="transfer-detail-facts">
              <div><dt>Protocolo</dt><dd>{details.transferRequestId}</dd></div>
              <div><dt>Criada em</dt><dd>{formatTransferTimestamp(details.createdAtUtc)}</dd></div>
              <div><dt>Atualizada em</dt><dd>{formatTransferTimestamp(details.updatedAtUtc)}</dd></div>
              <div><dt>Direção</dt><dd>{received ? "Recebida pelo criatório selecionado" : "Enviada pelo criatório selecionado"}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="titulo-ave-transferencia" className="document-wizard-card transfer-detail-card">
            <header className="transfer-detail-card-heading"><div><p className="eyebrow">Dados relacionados</p><h2 id="titulo-ave-transferencia">Ave</h2></div><span aria-hidden="true" className="transfer-detail-icon"><DashboardIcon name="bird" /></span></header>
            <dl className="transfer-detail-facts">
              <div><dt>Nome</dt><dd>{details.bird.name}</dd></div>
              <div><dt>Anilha</dt><dd>{details.bird.ringNumber ?? "Não informada"}</dd></div>
              <div><dt>Sexo</dt><dd>{birdSexLabel(details.bird.sex)}</dd></div>
              <div><dt>Situação atual</dt><dd>{birdStatusLabel(details.bird.status)}</dd></div>
            </dl>
            <p className="transfer-privacy-note">Esta tela mostra somente o resumo autorizado da transferência; a ficha completa da ave não é aberta aqui.</p>
          </section>

          <section aria-labelledby="titulo-criatorios-transferencia" className="document-wizard-card transfer-detail-card transfer-farms-card">
            <header className="transfer-detail-card-heading"><div><p className="eyebrow">Origem e destino</p><h2 id="titulo-criatorios-transferencia">Criatórios</h2></div><span aria-hidden="true" className="transfer-detail-icon"><DashboardIcon name="transfer" /></span></header>
            <dl className="transfer-detail-facts">
              <div><dt>Origem</dt><dd>{details.sourceBreedingFarmName}{details.sourceBreedingFarmId === selectedFarmId && <small>Criatório selecionado</small>}</dd></div>
              <div><dt>Destino</dt><dd>{details.destinationBreedingFarmName}{details.destinationBreedingFarmId === selectedFarmId && <small>Criatório selecionado</small>}</dd></div>
            </dl>
          </section>
        </div>

        {(canAccept || canReject || canCancel) && <section aria-labelledby="titulo-acao-transferencia" aria-busy={isSubmitting} className="document-wizard-card transfer-action-card">
          <p className="eyebrow">Ação disponível</p><h2 id="titulo-acao-transferencia">{received ? "Decidir sobre a transferência" : "Cancelar transferência"}</h2>
          <p>{received ? "Confira os dados e escolha como responder à solicitação recebida." : "Você pode cancelar esta solicitação enquanto o criatório de destino ainda não respondeu."}</p>
          {!confirmingAction ? <div className="transfer-action-buttons">
            {canAccept && <button className="auth-primary-action" disabled={isSubmitting} onClick={() => { setActionError(undefined); setConfirmingAction("accept"); }} ref={(element) => { actionButtonRefs.current.accept = element; }} type="button">{transferActionCopy.accept.button}</button>}
            {canReject && <button className="auth-secondary-action transfer-action-danger" disabled={isSubmitting} onClick={() => { setActionError(undefined); setConfirmingAction("reject"); }} ref={(element) => { actionButtonRefs.current.reject = element; }} type="button">{transferActionCopy.reject.button}</button>}
            {canCancel && <button className="auth-secondary-action transfer-action-danger" disabled={isSubmitting} onClick={() => { setActionError(undefined); setConfirmingAction("cancel"); }} ref={(element) => { actionButtonRefs.current.cancel = element; }} type="button">{transferActionCopy.cancel.button}</button>}
          </div> : <div aria-label={confirmationCopy?.group} className="transfer-action-confirmation" ref={confirmationRef} role="group" tabIndex={-1}>
            <p>{confirmationCopy?.prompt}</p>
            <div>
              <button className="auth-secondary-action" disabled={isSubmitting} onClick={() => { focusReturnAction.current = confirmingAction; setConfirmingAction(null); setActionError(undefined); }} type="button">Voltar</button>
              <button className={`auth-primary-action${confirmingAction === "accept" ? "" : " transfer-action-danger"}`} disabled={isSubmitting} onClick={() => void performTransferAction(confirmingAction)} type="button">{isSubmitting ? confirmationCopy?.progress : confirmationCopy?.confirmation}</button>
            </div>
          </div>}
        </section>}

        {pending && sent && <p className="transfer-pending-note" role="status">Aguardando decisão do criatório de destino.</p>}
      </main>
    </AuthenticatedShell>
  );
}
