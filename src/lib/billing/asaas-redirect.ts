/**
 * Validação centralizada e segura de URLs de redirecionamento hospedadas pelo Asaas.
 *
 * Política obrigatória:
 * - Esquema somente HTTPS;
 * - Hostname exatamente "asaas.com" ou subdomínio real de ".asaas.com";
 * - Sem credenciais embutidas (username/password);
 * - Porta vazia/padrão ou 443;
 * - Rejeitar URL malformada e esquemas inseguros (javascript:, data:, etc.);
 * - Comparação estrita por hostname (nunca substring insegura).
 */

export function isSafeHostedAsaasUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "https:") {
      return false;
    }

    if (url.username || url.password) {
      return false;
    }

    if (url.port !== "" && url.port !== "443") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === "asaas.com") {
      return true;
    }

    if (hostname.endsWith(".asaas.com")) {
      const labels = hostname.split(".");
      return labels.length >= 3 && labels.every((label) => label.length > 0);
    }

    return false;
  } catch {
    return false;
  }
}

export function sanitizeHostedAsaasUrl(value: unknown): string | undefined {
  if (!isSafeHostedAsaasUrl(value)) {
    return undefined;
  }

  try {
    return new URL(value.trim()).toString();
  } catch {
    return undefined;
  }
}

function defaultNavigate(url: string): void {
  if (typeof window !== "undefined") {
    window.location.assign(url);
  }
}

export function redirectToHostedAsaas(
  url: string,
  navigate: (destination: string) => void = defaultNavigate
): boolean {
  if (!isSafeHostedAsaasUrl(url)) {
    return false;
  }

  navigate(url);
  return true;
}
