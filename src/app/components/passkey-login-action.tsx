"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth/auth-context";
import { PasskeyClient } from "../../lib/auth/passkey-client";
import { usePasskey } from "../../lib/auth/use-passkey";

function messageForPasskeyFailure(error: { kind?: string; message?: string } | undefined): string {
  if (error?.kind === "cancelled") return "Tudo bem. Você pode entrar com e-mail e senha ou Google.";

  const message = error?.message ?? "Não foi possível entrar com a chave de acesso. Tente novamente.";
  return `${message} Você também pode entrar com senha ou Google.`;
}

export function PasskeyLoginAction() {
  const { refresh } = useAuth();
  const clientRef = useRef<PasskeyClient | undefined>(undefined);
  if (!clientRef.current) clientRef.current = new PasskeyClient();

  const passkey = usePasskey({ client: clientRef.current });
  const [clientReady, setClientReady] = useState(false);
  const [message, setMessage] = useState<string>();
  const [bootstrappingSession, setBootstrappingSession] = useState(false);

  useEffect(() => setClientReady(true), []);

  if (!clientReady || !passkey.support.supported) return null;

  const isPending = passkey.status === "pending" || bootstrappingSession;

  async function handlePasskeyLogin() {
    if (isPending) return;

    setMessage(undefined);
    const result = await passkey.authenticate();
    if (!result.ok) {
      setMessage(messageForPasskeyFailure(result.error));
      return;
    }

    setBootstrappingSession(true);
    const session = await refresh({ showLoading: false });
    if (session.ok) return;

    setBootstrappingSession(false);
    setMessage(`${session.error ?? "Não foi possível abrir sua sessão."} Você também pode entrar com senha ou Google.`);
  }

  return (
    <div aria-live="polite" className="passkey-login-action">
      <button
        aria-busy={isPending}
        className="auth-secondary-action passkey-login-button"
        disabled={isPending}
        onClick={() => void handlePasskeyLogin()}
        type="button"
      >
        <img src="/assets/icons/ui/lock.svg" alt="" aria-hidden="true" />
        {isPending ? "Entrando…" : "Entrar com biometria"}
      </button>
      <p className="passkey-login-help">Use a biometria ou o bloqueio do aparelho.</p>
      {message && <p className="passkey-login-feedback" role={message.startsWith("Tudo bem") ? "status" : "alert"}>{message}</p>}
    </div>
  );
}
