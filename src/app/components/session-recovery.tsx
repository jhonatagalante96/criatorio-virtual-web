"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/auth-context";
import { PasskeyClient } from "../../lib/auth/passkey-client";
import { usePasskey } from "../../lib/auth/use-passkey";
import { AppLoadingState } from "./app-loading-state";

export function SessionRecovery() {
  const { refresh } = useAuth();
  const router = useRouter();
  const clientRef = useRef<PasskeyClient | undefined>(undefined);
  const attemptedRef = useRef(false);
  const [clientReady, setClientReady] = useState(false);

  if (!clientRef.current) clientRef.current = new PasskeyClient();

  const passkey = usePasskey({ client: clientRef.current });

  useEffect(() => setClientReady(true), []);

  useEffect(() => {
    if (!clientReady || attemptedRef.current) return;
    attemptedRef.current = true;
    let cancelled = false;

    async function restoreSession() {
      if (!passkey.support.supported) {
        router.replace("/login");
        return;
      }

      const authentication = await passkey.authenticate();
      if (cancelled) return;

      if (!authentication.ok) {
        router.replace("/login");
        return;
      }

      const session = await refresh({ showLoading: false });
      if (!cancelled && !session.ok) router.replace("/login");
    }

    void restoreSession();
    return () => { cancelled = true; };
  }, [clientReady, passkey.authenticate, passkey.support.supported, refresh, router]);

  return <AppLoadingState label="Verificando sua identidade" message="Confirme sua identidade para continuar." />;
}
