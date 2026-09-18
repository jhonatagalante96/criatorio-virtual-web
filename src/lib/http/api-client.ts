export type ApiMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export const ANTIFORGERY_HEADER = "X-XSRF-TOKEN";
export const FUNCTIONAL_ACCESS_BLOCKED_CODE = "functional_access_blocked";

export type FunctionalAccessBlockedListener = () => void | Promise<void>;

const functionalAccessBlockedListeners = new Set<FunctionalAccessBlockedListener>();

export function onFunctionalAccessBlocked(listener: FunctionalAccessBlockedListener): () => void {
  functionalAccessBlockedListeners.add(listener);
  return () => {
    functionalAccessBlockedListeners.delete(listener);
  };
}

export function notifyFunctionalAccessBlocked(): void {
  for (const listener of functionalAccessBlockedListeners) {
    try {
      void listener();
    } catch {
      // safe ignore
    }
  }
}

export type ValidationErrors = Record<string, string[]>;

export interface ApiRequestOptions {
  accept?: string;
  acceptedStatuses?: readonly number[];
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: ApiMethod;
  signal?: AbortSignal;
}

interface ProblemDetailsPayload {
  code?: string;
  detail?: string;
  errors?: ValidationErrors;
  status?: number;
  title?: string;
}

export class ApiError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;
  readonly fields: ValidationErrors;
  readonly status: number;

  constructor(status: number, title: string, details?: string, fields: ValidationErrors = {}, code?: string) {
    super(title);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.fields = fields;
  }
}

export class StaleTenantResponseError extends Error {
  constructor() {
    super("A resposta pertence a um contexto de criatório anterior.");
    this.name = "StaleTenantResponseError";
  }
}

function isMutation(method: ApiMethod): boolean {
  return method !== "GET";
}

function readValidationErrors(payload: ProblemDetailsPayload): ValidationErrors {
  return payload.errors ?? {};
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallbackTitle = response.status >= 500 ? "Não foi possível concluir a solicitação." : "Não foi possível concluir a solicitação.";
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("json")) {
    return new ApiError(response.status, fallbackTitle);
  }

  const payload = await response.json() as ProblemDetailsPayload;
  const error = new ApiError(
    response.status,
    payload.title ?? fallbackTitle,
    payload.detail,
    readValidationErrors(payload),
    payload.code
  );

  if (response.status === 403 && payload.code === FUNCTIONAL_ACCESS_BLOCKED_CODE) {
    notifyFunctionalAccessBlocked();
  }

  return error;
}

export class ApiClient {
  private readonly cache = new Map<string, unknown>();
  private readonly csrfToken: () => string | undefined;
  private readonly endpoint: string;
  private tenantId: string | undefined;
  private tenantVersion = 0;

  constructor(endpoint: string, csrfToken: () => string | undefined = () => undefined) {
    this.endpoint = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
    this.csrfToken = csrfToken;
  }

  setTenant(tenantId: string | undefined): void {
    if (this.tenantId === tenantId) return;

    this.tenantId = tenantId;
    this.tenantVersion += 1;
    this.cache.clear();
  }

  clearCache(): void {
    this.cache.clear();
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const url = new URL(path, this.endpoint).toString();
    const cacheKey = `${this.tenantId ?? "anonymous"}:${url}`;

    if (method === "GET" && this.cache.has(cacheKey)) return this.cache.get(cacheKey) as T;

    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");

    if (isMutation(method)) {
      const token = this.csrfToken();
      if (token) headers.set(ANTIFORGERY_HEADER, token);
    }

    const requestVersion = this.tenantVersion;
    const response = await fetch(url, {
      body: options.body,
      credentials: "include",
      headers,
      method,
      signal: options.signal
    });

    if (requestVersion !== this.tenantVersion) throw new StaleTenantResponseError();
    if (!response.ok && !options.acceptedStatuses?.includes(response.status)) {
      const error = await toApiError(response);
      if (error.code === FUNCTIONAL_ACCESS_BLOCKED_CODE) {
        this.clearCache();
      }
      throw error;
    }
    if (response.status === 204) return undefined as T;

    const data = await response.json() as T;
    if (requestVersion !== this.tenantVersion) throw new StaleTenantResponseError();

    if (method === "GET") this.cache.set(cacheKey, data);
    return data;
  }

  async upload<T>(
    path: string,
    body: FormData,
    onProgress?: (percent: number) => void,
    options: Omit<ApiRequestOptions, "body"> = {}
  ): Promise<T> {
    const method = options.method ?? "POST";
    const url = new URL(path, this.endpoint).toString();
    if (new URL(url).origin !== new URL(this.endpoint).origin) {
      throw new Error("File uploads must use the configured API origin.");
    }
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");

    if (isMutation(method)) {
      const token = this.csrfToken();
      if (token) headers.set(ANTIFORGERY_HEADER, token);
    }

    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("A solicitação foi cancelada.", "AbortError");
    }

    const requestVersion = this.tenantVersion;
    return new Promise<T>((resolve, reject) => {
      const request = new XMLHttpRequest();
      let settled = false;

      const cleanup = () => options.signal?.removeEventListener("abort", abortRequest);
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const abortRequest = () => request.abort();

      request.open(method, url, true);
      request.withCredentials = true;
      headers.forEach((value, name) => request.setRequestHeader(name, value));
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      });
      request.addEventListener("load", async () => {
        if (requestVersion !== this.tenantVersion) {
          fail(new StaleTenantResponseError());
          return;
        }

        if (request.status === 0) {
          fail(new Error("Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente."));
          return;
        }

        const response = new Response(request.status === 204 ? null : request.responseText, {
          headers: { "content-type": request.getResponseHeader("content-type") ?? "" },
          status: request.status
        });
        if (!response.ok && !options.acceptedStatuses?.includes(response.status)) {
          try {
            fail(await toApiError(response));
          } catch (error) {
            fail(error);
          }
          return;
        }
        if (request.status === 204) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(undefined as T);
          return;
        }

        try {
          const data = JSON.parse(request.responseText) as T;
          if (requestVersion !== this.tenantVersion) {
            fail(new StaleTenantResponseError());
            return;
          }
          if (settled) return;
          settled = true;
          cleanup();
          resolve(data);
        } catch (error) {
          fail(error);
        }
      });
      request.addEventListener("error", () => fail(new Error("Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.")));
      request.addEventListener("abort", () => fail(options.signal?.reason ?? new DOMException("A solicitação foi cancelada.", "AbortError")));
      options.signal?.addEventListener("abort", abortRequest, { once: true });
      request.send(body);
    });
  }

  async requestBlob(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
    const method = options.method ?? "GET";
    const url = new URL(path, this.endpoint).toString();
    if (new URL(url).origin !== new URL(this.endpoint).origin) {
      throw new Error("Binary API requests must use the configured API origin.");
    }
    const headers = new Headers(options.headers);
    headers.set("accept", options.accept ?? "application/pdf");

    if (isMutation(method)) {
      const token = this.csrfToken();
      if (token) headers.set(ANTIFORGERY_HEADER, token);
    }

    const requestVersion = this.tenantVersion;
    const response = await fetch(url, {
      body: options.body,
      credentials: "include",
      headers,
      method,
      signal: options.signal
    });

    if (requestVersion !== this.tenantVersion) throw new StaleTenantResponseError();
    if (!response.ok) throw await toApiError(response);

    const data = await response.blob();
    if (requestVersion !== this.tenantVersion) throw new StaleTenantResponseError();
    return data;
  }

  async fetchAntiforgeryToken(path = "antiforgery/token"): Promise<string> {
    const url = new URL(path, this.endpoint).toString();
    const response = await fetch(url, {
      credentials: "include",
      headers: { accept: "application/json" },
      method: "GET"
    });

    if (!response.ok) throw await toApiError(response);

    const token = response.headers.get(ANTIFORGERY_HEADER);
    if (!token) throw new Error("O token de segurança não foi disponibilizado.");

    return token;
  }
}

export function getApiUrl(path: string): string {
  return new URL(path, process.env.NEXT_PUBLIC_API_URL ?? "https://localhost:58016").toString();
}

export function createApiClient(csrfToken?: () => string | undefined): ApiClient {
  return new ApiClient(process.env.NEXT_PUBLIC_API_URL ?? "https://localhost:58016", csrfToken);
}

