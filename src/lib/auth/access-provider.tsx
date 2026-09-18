"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, createApiClient, onFunctionalAccessBlocked } from "../http/api-client";
import { useAuth } from "./auth-context";
import { AccessContextResult, parseAccessContext } from "./access-context";

export type AccessStatus = "error" | "loading" | "ready" | "unauthenticated";

export interface AccessContextValue {
  accessContext: AccessContextResult | undefined;
  error: string | undefined;
  refetch: () => Promise<AccessContextResult | undefined>;
  status: AccessStatus;
}

const AccessContext = createContext<AccessContextValue | undefined>(undefined);

function AccessProviderInner({ children }: Readonly<{ children: React.ReactNode }>) {
  const { status: authStatus, refresh: refreshAuth } = useAuth();
  const [accessContext, setAccessContext] = useState<AccessContextResult | undefined>();
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [error, setError] = useState<string | undefined>();
  const client = useRef<ApiClient | null>(null);
  const fetchRequestId = useRef(0);

  if (!client.current) {
    client.current = createApiClient();
  }

  const loadAccessContext = useCallback(async (isBackground = false): Promise<AccessContextResult | undefined> => {
    const requestId = ++fetchRequestId.current;
    const isCurrent = () => fetchRequestId.current === requestId;

    if (!isBackground) {
      setStatus("loading");
    }
    setError(undefined);

    try {
      client.current!.clearCache();
      const rawPayload = await client.current!.request<unknown>("api/me/access-context");
      if (!isCurrent()) return undefined;

      const result = parseAccessContext(rawPayload);
      client.current!.setTenant(result.breedingFarm?.id ?? undefined);
      setAccessContext(result);
      setStatus("ready");
      return result;
    } catch (cause) {
      if (!isCurrent()) return undefined;

      if (cause instanceof ApiError && cause.status === 401) {
        const refreshResult = await refreshAuth();
        if (!isCurrent()) return undefined;
        if (refreshResult.ok) {
          return await loadAccessContext(isBackground);
        }
        setAccessContext(undefined);
        setStatus("unauthenticated");
        return undefined;
      }

      setAccessContext(undefined);
      setStatus("error");
      setError(
        cause instanceof ApiError && cause.status >= 500
          ? "O serviço está indisponível no momento. Tente novamente em instantes."
          : cause instanceof Error
            ? cause.message
            : "Não foi possível carregar as permissões de acesso. Tente novamente."
      );
      return undefined;
    }
  }, [refreshAuth]);

  useEffect(() => {
    if (authStatus === "loading" || authStatus === "authenticating") {
      setStatus("loading");
      return;
    }

    if (authStatus === "unauthenticated") {
      setAccessContext(undefined);
      setStatus("unauthenticated");
      return;
    }

    if (authStatus === "authenticated") {
      void loadAccessContext();
    }
  }, [authStatus, loadAccessContext]);

  // Central 403 functional_access_blocked listener
  useEffect(() => {
    const unsubscribe = onFunctionalAccessBlocked(() => {
      // Immediately clear current access context to prevent flash of previously rendered functional UI
      setAccessContext(undefined);
      setStatus("loading");
      void loadAccessContext();
    });

    return () => {
      unsubscribe();
    };
  }, [loadAccessContext]);

  const refetch = useCallback(async () => {
    return await loadAccessContext();
  }, [loadAccessContext]);

  return (
    <AccessContext.Provider value={{ accessContext, error, refetch, status }}>
      {children}
    </AccessContext.Provider>
  );
}

export function AccessProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const existing = useContext(AccessContext);
  if (existing) return <>{children}</>;
  return <AccessProviderInner>{children}</AccessProviderInner>;
}

export function useAccessContext(): AccessContextValue | undefined {
  return useContext(AccessContext);
}
