"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, createApiClient } from "../http/api-client";

export interface AccountSession {
  email: string;
  emailConfirmed: boolean;
  userId: string;
}

export type AuthStatus = "authenticated" | "authenticating" | "error" | "forbidden" | "loading" | "signing-out" | "unauthenticated";

export interface AuthResult {
  error?: string;
  ok: boolean;
}

interface AuthContextValue {
  clearError: () => void;
  error: string | undefined;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<AuthResult>;
  refresh: () => Promise<void>;
  session: AccountSession | undefined;
  status: AuthStatus;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function messageForFailure(error: unknown, action: "login" | "logout" | "session"): string {
  if (error instanceof ApiError) {
    if (action === "login" && error.status === 401) return "E-mail ou senha inválidos.";
    if (error.status === 403) return "Seu acesso não está autorizado para esta ação.";
    if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  }

  if (action === "login") return "Não foi possível entrar. Verifique sua conexão e tente novamente.";
  if (action === "logout") return "Não foi possível sair agora. Tente novamente em instantes.";
  return "Não foi possível restaurar sua sessão. Tente novamente.";
}

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [session, setSession] = useState<AccountSession | undefined>();
  const [status, setStatus] = useState<AuthStatus>("loading");

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const clearSession = useCallback(() => {
    csrfToken.current = undefined;
    client.current?.clearCache();
    setSession(undefined);
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(undefined);

    try {
      const currentSession = await client.current!.request<AccountSession>("api/auth/session");
      setSession(currentSession);
      setStatus("authenticated");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        setStatus("unauthenticated");
        return;
      }

      setStatus(requestError instanceof ApiError && requestError.status === 403 ? "forbidden" : "error");
      setError(messageForFailure(requestError, "session"));
    }
  }, [clearSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    setStatus("authenticating");
    setError(undefined);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/login", {
        body: JSON.stringify({ email: email.trim(), password }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      // A successful login changes the authenticated identity. The token fetched
      // before login must not be reused for the next authenticated mutation.
      csrfToken.current = undefined;
      client.current!.clearCache();
      const currentSession = await client.current!.request<AccountSession>("api/auth/session");
      setSession(currentSession);
      setStatus("authenticated");
      return { ok: true };
    } catch (requestError) {
      setSession(undefined);
      setStatus(requestError instanceof ApiError && requestError.status === 403 ? "forbidden" : "unauthenticated");
      const message = messageForFailure(requestError, "login");
      setError(message);
      return { error: message, ok: false };
    }
  }, []);

  const logout = useCallback(async (): Promise<AuthResult> => {
    setStatus("signing-out");
    setError(undefined);

    try {
      // The backend invalidates antiforgery tokens when the identity changes.
      csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await client.current!.request<void>("api/auth/logout", { method: "POST" });
      clearSession();
      setStatus("unauthenticated");
      return { ok: true };
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        setStatus("unauthenticated");
        const message = "Sua sessão expirou. Entre novamente para continuar.";
        setError(message);
        return { error: message, ok: false };
      }

      setStatus("authenticated");
      const message = messageForFailure(requestError, "logout");
      setError(message);
      return { error: message, ok: false };
    }
  }, [clearSession]);

  const clearError = useCallback(() => setError(undefined), []);

  return (
    <AuthContext.Provider value={{ clearError, error, login, logout, refresh, session, status }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
