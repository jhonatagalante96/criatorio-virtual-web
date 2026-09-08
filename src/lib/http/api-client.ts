export type ApiMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export const ANTIFORGERY_HEADER = "X-XSRF-TOKEN";

export type ValidationErrors = Record<string, string[]>;

export interface ApiRequestOptions {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: ApiMethod;
  signal?: AbortSignal;
}

interface ProblemDetailsPayload {
  detail?: string;
  errors?: ValidationErrors;
  status?: number;
  title?: string;
}

export class ApiError extends Error {
  readonly details: string | undefined;
  readonly fields: ValidationErrors;
  readonly status: number;

  constructor(status: number, title: string, details?: string, fields: ValidationErrors = {}) {
    super(title);
    this.name = "ApiError";
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

  if (!contentType.includes("json")) return new ApiError(response.status, fallbackTitle);

  const payload = await response.json() as ProblemDetailsPayload;
  return new ApiError(
    response.status,
    payload.title ?? fallbackTitle,
    payload.detail,
    readValidationErrors(payload)
  );
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
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;

    const data = await response.json() as T;
    if (requestVersion !== this.tenantVersion) throw new StaleTenantResponseError();

    if (method === "GET") this.cache.set(cacheKey, data);
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

export function createApiClient(csrfToken?: () => string | undefined): ApiClient {
  return new ApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000", csrfToken);
}

