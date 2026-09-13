"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../lib/auth/auth-context";
import { ApiError } from "../../lib/http/api-client";
import { PasskeyClient } from "../../lib/auth/passkey-client";
import { usePasskey } from "../../lib/auth/use-passkey";
import { DashboardIcon } from "./dashboard-icons";

type PromptState = "error" | "has-passkeys" | "loading" | "ready" | "success" | "unsupported";

interface PasskeyActivationPromptProps {
  variant: "dashboard" | "settings";
}

function listFailure(error: unknown): { message: string; state: "error" | "unsupported" } {
  if (error instanceof ApiError && error.status === 503) {
    return {
      message: "O login rápido não está disponível neste ambiente. Seu login por senha ou Google continua funcionando.",
      state: "unsupported"
    };
  }

  if (error instanceof ApiError && error.status === 401) {
    return { message: "Sua sessão expirou. Entre novamente para ativar o login rápido.", state: "error" };
  }

  if (error instanceof ApiError && error.status === 403) {
    return { message: "Não foi possível consultar as chaves de acesso desta conta. Tente novamente.", state: "error" };
  }

  return { message: "Não foi possível verificar o login rápido agora. Tente novamente.", state: "error" };
}

export function PasskeyActivationPrompt({ variant }: Readonly<PasskeyActivationPromptProps>) {
  const { refresh } = useAuth();
  const clientRef = useRef<PasskeyClient | undefined>(undefined);
  if (!clientRef.current) clientRef.current = new PasskeyClient();

  const passkey = usePasskey({ client: clientRef.current });
  const headingId = useId();
  const [clientReady, setClientReady] = useState(false);
  const [message, setMessage] = useState<string>();
  const [promptState, setPromptState] = useState<PromptState>("loading");
  const [retryVersion, setRetryVersion] = useState(0);
  const [canRegister, setCanRegister] = useState(false);

  useEffect(() => setClientReady(true), []);

  useEffect(() => {
    if (!clientReady) return;

    let cancelled = false;
    const client = clientRef.current!;
    const support = passkey.support;

    if (!support.supported) {
      setCanRegister(false);
      setPromptState("unsupported");
      setMessage("Chaves de acesso não estão disponíveis neste navegador. Seu login por senha ou Google continua funcionando.");
      return () => { cancelled = true; };
    }

    setCanRegister(false);
    setMessage(undefined);
    setPromptState("loading");

    async function loadPasskeys(recoverSession: boolean): Promise<void> {
      try {
        const passkeys = await client.list();
        if (cancelled) return;
        setCanRegister(passkeys.length === 0);
        setPromptState(passkeys.length === 0 ? "ready" : "has-passkeys");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && recoverSession) {
          const result = await refresh({ showLoading: false });
          if (result.ok && !cancelled) {
            await loadPasskeys(false);
            return;
          }
        }

        if (cancelled) return;
        const failure = listFailure(error);
        setCanRegister(false);
        setPromptState(failure.state);
        setMessage(failure.message);
      }
    }

    void loadPasskeys(true);
    return () => { cancelled = true; };
  }, [clientReady, passkey.support.supported, refresh, retryVersion]);

  async function handleRegister() {
    setMessage(undefined);
    const result = await passkey.register();
    if (result.ok) {
      setCanRegister(false);
      setPromptState("success");
      setMessage("Login rápido ativado. Nas próximas vezes, você poderá usar a biometria ou o bloqueio do aparelho.");
      return;
    }

    const error = result.error;
    if (error?.kind === "cancelled") {
      setPromptState("ready");
      setCanRegister(true);
      setMessage("Tudo bem. Você pode ativar o login rápido quando quiser.");
      return;
    }

    setPromptState(error?.kind === "not-supported" ? "unsupported" : "error");
    setCanRegister(error?.kind !== "not-supported");
    setMessage(error?.message ?? "Não foi possível ativar o login rápido. Tente novamente.");
  }

  if (!clientReady || promptState === "has-passkeys") return null;

  const heading = variant === "dashboard" ? "Ative o login rápido" : "Login rápido";
  const description = variant === "dashboard"
    ? "Use a biometria ou o bloqueio do aparelho para entrar mais rápido nas próximas vezes."
    : "Cadastre uma chave de acesso para entrar usando a biometria ou o bloqueio do aparelho, sem depender apenas da senha.";
  const isLoading = promptState === "loading";
  const isRegistering = passkey.status === "pending";
  const messageRole = promptState === "error" ? "alert" : "status";

  return (
    <section aria-labelledby={headingId} className={`passkey-activation-card passkey-activation-card-${variant}`}>
      <div className="passkey-activation-icon" aria-hidden="true"><DashboardIcon name="shield" /></div>
      <div className="passkey-activation-copy">
        <p className="eyebrow">Segurança da conta</p>
        <h2 id={headingId}>{heading}</h2>
        <p>{description}</p>
        {isLoading && <p className="passkey-activation-feedback" role="status">Verificando se sua conta já possui uma chave de acesso…</p>}
        {!isLoading && message && <p className={`passkey-activation-feedback${promptState === "error" ? " is-error" : ""}`} role={messageRole}>{message}</p>}
      </div>
      {isLoading ? (
        <span className="passkey-activation-pending" role="status">Verificando…</span>
      ) : promptState === "error" && !canRegister ? (
        <button className="auth-secondary-action" onClick={() => setRetryVersion((version) => version + 1)} type="button">Tentar novamente</button>
      ) : promptState === "unsupported" || promptState === "success" ? null : (
        <button className="auth-primary-action" disabled={isRegistering || !canRegister} onClick={() => void handleRegister()} type="button">
          {isRegistering ? "Ativando…" : "Ativar login rápido"}
        </button>
      )}
    </section>
  );
}
