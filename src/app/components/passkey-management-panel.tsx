"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiError } from "../../lib/http/api-client";
import { AccountPasskeySummary, PasskeyClient } from "../../lib/auth/passkey-client";
import { usePasskey } from "../../lib/auth/use-passkey";
import { DashboardIcon } from "./dashboard-icons";

type ManagementState = "error" | "loading" | "ready" | "unsupported";
type ActionState = "registering" | "renaming" | "removing" | undefined;
type Notice = { kind: "error" | "success" | "info"; text: string };

function listFailure(error: unknown): { message: string; state: ManagementState } {
  if (error instanceof ApiError && error.status === 503) {
    return {
      message: "A gestão de chaves de acesso não está disponível neste ambiente. Seu login por senha ou Google continua funcionando.",
      state: "unsupported"
    };
  }

  if (error instanceof ApiError && error.status === 401) {
    return { message: "Sua sessão expirou. Entre novamente para gerenciar suas chaves de acesso.", state: "error" };
  }

  if (error instanceof ApiError && error.status === 403) {
    return { message: "Não foi possível consultar as chaves de acesso desta conta. Tente novamente.", state: "error" };
  }

  if (error instanceof TypeError) {
    return { message: "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.", state: "error" };
  }

  return { message: "Não foi possível carregar suas chaves de acesso. Tente novamente.", state: "error" };
}

function mutationFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error instanceof ApiError && error.status === 404) return "Essa chave de acesso não está mais disponível. Atualizamos a lista.";
  if (error instanceof ApiError && error.fields.name?.length) return "Use um nome entre 1 e 100 caracteres.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível concluir essa ação. Tente novamente.";
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data de criação não informada";
  return `Criada em ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date)}`;
}

function formatTransport(value: string): string {
  const labels: Record<string, string> = {
    ble: "Bluetooth",
    hybrid: "Outro dispositivo",
    internal: "Este dispositivo",
    nfc: "NFC",
    usb: "USB"
  };
  return labels[value] ?? "Dispositivo compatível";
}

function passkeyTitle(passkey: AccountPasskeySummary, index: number): string {
  return passkey.name?.trim() || `Chave de acesso ${index + 1}`;
}

export function PasskeyManagementPanel() {
  const { refresh } = useAuth();
  const clientRef = useRef<PasskeyClient | undefined>(undefined);
  if (!clientRef.current) clientRef.current = new PasskeyClient();

  const passkey = usePasskey({ client: clientRef.current });
  const headingId = useId();
  const [clientReady, setClientReady] = useState(false);
  const [listState, setListState] = useState<ManagementState>("loading");
  const [passkeys, setPasskeys] = useState<AccountPasskeySummary[]>([]);
  const [notice, setNotice] = useState<Notice>();
  const [retryVersion, setRetryVersion] = useState(0);
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [confirmingId, setConfirmingId] = useState<string>();
  const [actionState, setActionState] = useState<ActionState>();
  const mountedRef = useRef(true);

  useEffect(() => setClientReady(true), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadPasskeys = useCallback(async (recoverSession: boolean): Promise<boolean> => {
    if (!mountedRef.current) return false;
    if (!passkey.support.supported) {
      setListState("unsupported");
      setPasskeys([]);
      setNotice({ kind: "info", text: "Chaves de acesso não estão disponíveis neste navegador. Seu login por senha ou Google continua funcionando." });
      return false;
    }

    setListState("loading");
    setNotice(undefined);
    try {
      const nextPasskeys = await clientRef.current!.list();
      if (!mountedRef.current) return false;
      setPasskeys(nextPasskeys);
      setListState("ready");
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) return loadPasskeys(false);
      }

      if (!mountedRef.current) return false;
      const failure = listFailure(error);
      setListState(failure.state);
      setPasskeys([]);
      setNotice({ kind: failure.state === "unsupported" ? "info" : "error", text: failure.message });
      return false;
    }
  }, [passkey.support.supported, refresh]);

  useEffect(() => {
    if (!clientReady) return;
    void loadPasskeys(true);
  }, [clientReady, loadPasskeys, retryVersion]);

  useEffect(() => {
    if (!confirmingId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmingId(undefined);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmingId]);

  function beginRename(item: AccountPasskeySummary, index: number) {
    setEditingId(item.credentialId);
    setEditingName(item.name?.trim() || passkeyTitle(item, index));
    setNameError(undefined);
    setNotice(undefined);
  }

  function cancelRename() {
    setEditingId(undefined);
    setEditingName("");
    setNameError(undefined);
  }

  async function handleRegister() {
    if (actionState) return;
    setActionState("registering");
    setNotice(undefined);
    const result = await passkey.register();
    if (!result.ok) {
      setActionState(undefined);
      if (result.error?.kind === "cancelled") {
        setNotice({ kind: "info", text: "Tudo bem. Você pode adicionar uma chave de acesso quando quiser." });
      } else {
        setNotice({ kind: result.error?.kind === "not-supported" ? "info" : "error", text: result.error?.message ?? "Não foi possível adicionar a chave de acesso. Tente novamente." });
      }
      return;
    }

    const loaded = await loadPasskeys(false);
    setActionState(undefined);
    if (loaded) setNotice({ kind: "success", text: "Chave de acesso adicionada. Ela poderá ser usada no próximo login." });
  }

  async function handleRename(item: AccountPasskeySummary) {
    const nextName = editingName.trim();
    if (!nextName || nextName.length > 100) {
      setNameError("Use um nome entre 1 e 100 caracteres.");
      return;
    }
    if (actionState) return;

    setActionState("renaming");
    setNotice(undefined);
    setNameError(undefined);
    try {
      await clientRef.current!.rename(item.credentialId, nextName);
      cancelRename();
      const loaded = await loadPasskeys(false);
      if (loaded) setNotice({ kind: "success", text: "Nome da chave de acesso atualizado." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      if (error instanceof ApiError && error.status === 404) {
        cancelRename();
        await loadPasskeys(false);
      }
      setNotice({ kind: "error", text: mutationFailure(error) });
    } finally {
      setActionState(undefined);
    }
  }

  async function handleRemove(item: AccountPasskeySummary) {
    if (actionState) return;
    setActionState("removing");
    setNotice(undefined);
    try {
      await clientRef.current!.remove(item.credentialId);
      setConfirmingId(undefined);
      const loaded = await loadPasskeys(false);
      if (loaded) setNotice({ kind: "success", text: "Chave de acesso removida. As sessões abertas continuam ativas." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await refresh();
      if (error instanceof ApiError && error.status === 404) {
        setConfirmingId(undefined);
        await loadPasskeys(false);
      }
      setNotice({ kind: "error", text: mutationFailure(error) });
    } finally {
      setActionState(undefined);
    }
  }

  if (!clientReady) return null;

  const isBusy = Boolean(actionState);
  const confirmingPasskey = passkeys.find((item) => item.credentialId === confirmingId);
  const addLabel = passkeys.length > 0 ? "Adicionar outra Passkey" : "Adicionar Passkey";

  return (
    <section aria-labelledby={headingId} className="passkey-management-card">
      <div className="passkey-management-header">
        <div className="passkey-management-icon" aria-hidden="true"><DashboardIcon name="shield" /></div>
        <div className="passkey-management-copy">
          <p className="eyebrow">Proteção da conta</p>
          <h2 id={headingId}>Chaves de acesso</h2>
          <p>Use a biometria ou o bloqueio do aparelho para entrar sem depender apenas da senha.</p>
        </div>
        {listState === "ready" && passkeys.length > 0 && <button className="auth-primary-action passkey-management-add" disabled={isBusy} onClick={() => void handleRegister()} type="button">{actionState === "registering" ? "Adicionando…" : addLabel}</button>}
      </div>

      {notice && <p className={`passkey-management-notice passkey-management-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

      {listState === "loading" && <div className="passkey-management-state" role="status"><strong>Carregando chaves de acesso…</strong><span>Estamos consultando apenas os metadados seguros da sua conta.</span></div>}
      {listState === "error" && <div className="passkey-management-state"><strong>Não foi possível carregar as chaves de acesso.</strong><button className="auth-secondary-action" onClick={() => setRetryVersion((version) => version + 1)} type="button">Tentar novamente</button></div>}
      {listState === "unsupported" && <div className="passkey-management-state"><strong>Este navegador não oferece suporte a chaves de acesso.</strong><span>Seu login por senha ou Google continua disponível.</span></div>}
      {listState === "ready" && passkeys.length === 0 && <div className="passkey-management-empty"><strong>Nenhuma chave de acesso cadastrada</strong><span>Adicione uma chave para entrar usando a biometria ou o bloqueio do aparelho.</span><button className="auth-primary-action" disabled={isBusy} onClick={() => void handleRegister()} type="button">{actionState === "registering" ? "Adicionando…" : addLabel}</button></div>}
      {listState === "ready" && passkeys.length > 0 && (
        <ul className="passkey-management-list">
          {passkeys.map((item, index) => {
            const title = passkeyTitle(item, index);
            const isEditing = editingId === item.credentialId;
            const itemBusy = isBusy && !isEditing;
            return (
              <li className="passkey-management-item" key={item.credentialId}>
                {isEditing ? (
                  <form className="passkey-rename-form" noValidate onSubmit={(event) => { event.preventDefault(); void handleRename(item); }}>
                    <label htmlFor={`passkey-name-${item.credentialId}`}>Nome da Passkey</label>
                    <input aria-describedby={nameError ? `passkey-name-error-${item.credentialId}` : undefined} aria-invalid={Boolean(nameError)} autoFocus id={`passkey-name-${item.credentialId}`} maxLength={100} onChange={(event) => { setEditingName(event.target.value); setNameError(undefined); }} value={editingName} />
                    {nameError && <p className="field-error" id={`passkey-name-error-${item.credentialId}`}>{nameError}</p>}
                    <div className="passkey-management-actions"><button className="auth-primary-action" disabled={actionState === "renaming"} type="submit">{actionState === "renaming" ? "Salvando…" : "Salvar nome"}</button><button className="settings-cancel-action" disabled={actionState === "renaming"} onClick={cancelRename} type="button">Cancelar</button></div>
                  </form>
                ) : (
                  <>
                    <div className="passkey-management-item-icon" aria-hidden="true"><DashboardIcon name="device" /></div>
                    <div className="passkey-management-item-copy"><strong>{title}</strong><span>{formatCreatedAt(item.createdAt)}</span><span>{item.transports.length > 0 ? item.transports.map(formatTransport).join(" · ") : "Chave de acesso compatível"}{item.isUserVerified ? " · Verificação do aparelho" : ""}{item.isBackedUp ? " · Sincronizada" : ""}</span></div>
                    <div className="passkey-management-actions"><button aria-label={`Renomear ${title}`} className="settings-cancel-action" disabled={itemBusy} onClick={() => beginRename(item, index)} type="button">Renomear</button><button aria-label={`Remover ${title}`} className="settings-danger-action" disabled={itemBusy} onClick={() => setConfirmingId(item.credentialId)} type="button">Remover</button></div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmingPasskey && <div aria-label="Confirmar remoção da chave de acesso" className="settings-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) setConfirmingId(undefined); }}><section aria-describedby="descricao-confirmacao-passkey" aria-labelledby="titulo-confirmacao-passkey" aria-modal="true" className="settings-dialog" role="dialog"><span aria-hidden="true" className="settings-dialog-icon"><DashboardIcon name="shield" /></span><h2 id="titulo-confirmacao-passkey">Remover chave de acesso?</h2><p id="descricao-confirmacao-passkey">A chave “{passkeyTitle(confirmingPasskey, passkeys.indexOf(confirmingPasskey))}” será removida. As sessões já abertas não serão encerradas, e sua senha ou Google continuarão disponíveis.</p><div className="settings-dialog-actions"><button autoFocus className="settings-cancel-action" disabled={isBusy} onClick={() => setConfirmingId(undefined)} type="button">Cancelar</button><button className="settings-danger-action" disabled={actionState === "removing"} onClick={() => void handleRemove(confirmingPasskey)} type="button">{actionState === "removing" ? "Removendo…" : "Remover"}</button></div></section></div>}
    </section>
  );
}
