"use client";

import { useEffect, useRef, useState } from "react";
import { lookupPostalCode, normalizePostalCode, PostalCodeAddress, PostalCodeNotFoundError } from "../../lib/postal-code";

export type PostalCodeLookupState = "error" | "idle" | "loading" | "not-found" | "ready";

export function postalCodeLookupMessage(state: PostalCodeLookupState): string {
  if (state === "loading") return "Consultando o CEP…";
  if (state === "ready") return "Endereço preenchido automaticamente. Você pode complementar os campos abaixo.";
  if (state === "not-found") return "CEP não encontrado. Confira os números e tente novamente.";
  if (state === "error") return "Não foi possível consultar o CEP agora. Tente novamente ou continue mais tarde.";
  return "Digite um CEP válido para preencher o endereço automaticamente.";
}

export function usePostalCodeLookup(postalCode: string, initialValueReady = false, skipLookupForPostalCode?: string): Readonly<{ address: PostalCodeAddress | undefined; state: PostalCodeLookupState }> {
  const [address, setAddress] = useState<PostalCodeAddress>();
  const [state, setState] = useState<PostalCodeLookupState>(initialValueReady && normalizePostalCode(postalCode).length === 8 ? "ready" : "idle");
  const hasHandledInitialValue = useRef(false);

  useEffect(() => {
    const normalizedPostalCode = normalizePostalCode(postalCode);
    const normalizedSkippedPostalCode = normalizePostalCode(skipLookupForPostalCode ?? "");
    setAddress(undefined);

    if (initialValueReady && normalizedPostalCode.length === 8 && normalizedPostalCode === normalizedSkippedPostalCode) {
      hasHandledInitialValue.current = true;
      setState("ready");
      return;
    }

    if (initialValueReady && !hasHandledInitialValue.current) {
      hasHandledInitialValue.current = true;
      setState(normalizedPostalCode.length === 8 ? "ready" : "idle");
      return;
    }

    if (normalizedPostalCode.length !== 8) {
      setState("idle");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    void lookupPostalCode(normalizedPostalCode, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAddress(result);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(error instanceof PostalCodeNotFoundError ? "not-found" : "error");
      });

    return () => controller.abort();
  }, [initialValueReady, postalCode, skipLookupForPostalCode]);

  return { address, state };
}
