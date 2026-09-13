"use client";

import { useCallback, useRef, useState } from "react";
import { PasskeyClient, PasskeyOperationOptions } from "./passkey-client";
import { detectPasskeySupport, normalizePasskeyError, PasskeyError, PasskeySupport } from "./passkeys";

export type PasskeyHookStatus = "cancelled" | "error" | "idle" | "pending" | "success";

export interface PasskeyActionResult {
  credential?: PublicKeyCredential;
  error?: PasskeyError;
  ok: boolean;
}

export interface UsePasskeyOptions {
  client?: PasskeyClient;
}

export function usePasskey(options: UsePasskeyOptions = {}) {
  const clientRef = useRef<PasskeyClient | undefined>(undefined);
  if (!clientRef.current) clientRef.current = options.client ?? new PasskeyClient();

  const [error, setError] = useState<PasskeyError | undefined>();
  const [status, setStatus] = useState<PasskeyHookStatus>("idle");
  const support: PasskeySupport = detectPasskeySupport();

  const run = useCallback(async (
    operation: "authenticate" | "register",
    operationOptions?: PasskeyOperationOptions
  ): Promise<PasskeyActionResult> => {
    setError(undefined);
    setStatus("pending");

    try {
      const credential = operation === "register"
        ? await clientRef.current!.register(operationOptions)
        : await clientRef.current!.authenticate(operationOptions);
      setStatus("success");
      return { credential, ok: true };
    } catch (cause) {
      const normalized = normalizePasskeyError(cause, operation === "register" ? "registration" : "authentication");
      setError(normalized);
      setStatus(normalized.kind === "cancelled" ? "cancelled" : "error");
      return { error: normalized, ok: false };
    }
  }, []);

  const register = useCallback((operationOptions?: PasskeyOperationOptions) => run("register", operationOptions), [run]);
  const authenticate = useCallback((operationOptions?: PasskeyOperationOptions) => run("authenticate", operationOptions), [run]);
  const reset = useCallback(() => {
    setError(undefined);
    setStatus("idle");
  }, []);

  return { authenticate, error, register, reset, status, support };
}
