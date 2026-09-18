import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, MissingCsrfTokenError, StaleTenantResponseError } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient", () => {
  it("isolates cached responses by tenant", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "A" }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "B" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    client.setTenant("tenant-a");
    expect(await client.request("api/birds")).toEqual({ name: "A" });
    expect(await client.request("api/birds")).toEqual({ name: "A" });

    client.setTenant("tenant-b");
    expect(await client.request("api/birds")).toEqual({ name: "B" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a response that arrives after the tenant changes", async () => {
    let resolveResponse: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    client.setTenant("tenant-a");
    const request = client.request("api/birds");
    client.setTenant("tenant-b");
    resolveResponse(new Response(JSON.stringify([]), { headers: { "content-type": "application/json" } }));

    await expect(request).rejects.toBeInstanceOf(StaleTenantResponseError);
  });

  it("sends the CSRF token for mutations and keeps field errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: { email: ["Informe um e-mail válido."] },
      title: "Dados inválidos."
    }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000", () => "csrf-token");

    await expect(client.request("api/accounts", { body: "{}", method: "POST" })).rejects.toMatchObject({
      fields: { email: ["Informe um e-mail válido."] },
      status: 400
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(request.credentials).toBe("include");
  });

  it("preserves the API error code without exposing the response payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "google_account_already_exists",
      detail: "Sign in using the existing account or recover access before linking Google.",
      title: "A Google account is already registered."
    }), { headers: { "content-type": "application/problem+json" }, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/auth/google/callback")).rejects.toMatchObject({
      code: "google_account_already_exists",
      status: 409
    });
  });

  it("gets the antiforgery token from the API response header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      headers: { "X-XSRF-TOKEN": "csrf-token" },
      status: 204
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    await expect(client.fetchAntiforgeryToken()).resolves.toBe("csrf-token");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/antiforgery/token", expect.objectContaining({
      credentials: "include",
      method: "GET"
    }));
  });

  it("preserves a 403 response without session side effects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/private")).rejects.toMatchObject({ status: 403 });
  });

  it("returns an explicitly accepted non-success JSON status to the caller", async () => {
    const payload = { status: "NoDocumentsGenerated", items: [{ status: "MissingRingNumber" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: 422
    })));
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/birds/documents/batch", {
      acceptedStatuses: [422],
      body: "{}",
      method: "POST"
    })).resolves.toEqual(payload);
  });

  it("requests PDF content without caching it and keeps the tenant guard", async () => {
    const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(pdf, {
      headers: { "content-type": "application/pdf" },
      status: 200
    })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");
    client.setTenant("tenant-a");

    const response = await client.requestBlob("api/reports/birds/pdf?sex=Female");
    expect(response.type).toBe("application/pdf");
    const secondResponse = await client.requestBlob("api/reports/birds/pdf?sex=Female");
    expect(secondResponse.type).toBe("application/pdf");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/reports/birds/pdf?sex=Female", expect.objectContaining({
      credentials: "include",
      method: "GET"
    }));
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("accept")).toBe("application/pdf");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows authenticated blob requests to declare the expected media type", async () => {
    const image = new Blob(["png"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(image, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    await client.requestBlob("api/breeding-farms/visual-identity/content", { accept: "image/png" });

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("accept")).toBe("image/png");
  });

  it("sends authenticated multipart uploads and reports their transfer progress", async () => {
    let instance: MockUploadRequest | undefined;
    class MockUploadRequest extends EventTarget {
      upload = new EventTarget();
      status = 201;
      responseText = JSON.stringify({ attachmentId: "attachment-a" });
      withCredentials = false;
      requestHeaders = new Map<string, string>();
      sentBody: FormData | undefined;

      open = vi.fn();
      setRequestHeader(name: string, value: string) { this.requestHeaders.set(name, value); }
      getResponseHeader(name: string) { return name.toLowerCase() === "content-type" ? "application/json" : null; }
      send(body: FormData) {
        this.sentBody = body;
        this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: 50, total: 100 }));
        this.dispatchEvent(new Event("load"));
      }
      abort() { this.dispatchEvent(new Event("abort")); }

      constructor() {
        super();
        instance = this;
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockUploadRequest);
    const client = new ApiClient("http://localhost:5000", () => "csrf-token");
    const form = new FormData();
    form.set("file", new File(["bird"], "bird.jpg", { type: "image/jpeg" }));
    const progress = vi.fn();

    await expect(client.upload("api/birds/bird-a/attachments", form, progress)).resolves.toEqual({ attachmentId: "attachment-a" });

    expect(instance?.open).toHaveBeenCalledWith("POST", "http://localhost:5000/api/birds/bird-a/attachments", true);
    expect(instance?.withCredentials).toBe(true);
    expect(instance?.requestHeaders.get("accept")).toBe("application/json");
    expect(instance?.requestHeaders.get("x-xsrf-token")).toBe("csrf-token");
    expect(instance?.sentBody).toBe(form);
    expect(progress).toHaveBeenCalledWith(50);
  });

  it("does not send credentialed multipart uploads outside the configured API origin", async () => {
    const request = vi.fn();
    vi.stubGlobal("XMLHttpRequest", request);
    const client = new ApiClient("https://api.example.test");

    await expect(client.upload("https://untrusted.example/upload", new FormData()))
      .rejects.toThrow("File uploads must use the configured API origin.");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not send credentialed blob requests to an origin outside the configured API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("https://api.example.test");

    await expect(client.requestBlob("https://untrusted.example/private-image"))
      .rejects.toThrow("Binary API requests must use the configured API origin.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifies listeners and clears cache on 403 functional_access_blocked", async () => {
    const { onFunctionalAccessBlocked } = await import("./api-client");
    const listener = vi.fn();
    const unsubscribe = onFunctionalAccessBlocked(listener);

    const client = new ApiClient("http://localhost:5000");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "CachedBird" }), { headers: { "content-type": "application/json" }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "functional_access_blocked",
        detail: "Functional access is blocked by billing.",
        title: "Forbidden"
      }), { headers: { "content-type": "application/problem+json" }, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    // Initial successful request gets cached
    expect(await client.request("api/birds")).toEqual({ name: "CachedBird" });

    // Second request receives 403 functional_access_blocked
    await expect(client.request("api/birds/action", { method: "POST" })).rejects.toMatchObject({
      code: "functional_access_blocked",
      status: 403
    });

    expect(listener).toHaveBeenCalledTimes(1);

    // Cache should be cleared, next GET should hit fetchMock again
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: "FreshBird" }), { headers: { "content-type": "application/json" }, status: 200 }));
    expect(await client.request("api/birds")).toEqual({ name: "FreshBird" });

    unsubscribe();
  });

  it("fails before network request when a marked protected mutation is missing CSRF token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/reproductions/rep-1/status", {
      body: JSON.stringify({ status: "Finished" }),
      method: "PATCH",
      requiresCsrf: true
    })).rejects.toBeInstanceOf(MissingCsrfTokenError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails before network upload when a protected upload is missing CSRF token", async () => {
    const request = vi.fn();
    vi.stubGlobal("XMLHttpRequest", request);
    const client = new ApiClient("http://localhost:5000");
    const form = new FormData();

    await expect(client.upload("api/birds/bird-a/attachments", form, undefined, {
      requiresCsrf: true
    })).rejects.toBeInstanceOf(MissingCsrfTokenError);

    expect(request).not.toHaveBeenCalled();
  });

  it("fails before network request when a protected blob mutation is missing CSRF token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    await expect(client.requestBlob("api/reports/generate", {
      method: "POST",
      requiresCsrf: true
    })).rejects.toBeInstanceOf(MissingCsrfTokenError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires CSRF token for public mutations like login when defaultRequiresCsrf is true", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000", () => undefined, { defaultRequiresCsrf: true });

    // Public/anonymous mutations still require CSRF under defaultRequiresCsrf mode
    await expect(client.request("api/auth/login", { body: "{}", method: "POST" })).rejects.toBeInstanceOf(MissingCsrfTokenError);
    await expect(client.request("api/auth/register", { body: "{}", method: "POST" })).rejects.toBeInstanceOf(MissingCsrfTokenError);
    await expect(client.request("api/auth/confirm-email", { body: "{}", method: "POST" })).rejects.toBeInstanceOf(MissingCsrfTokenError);
    await expect(client.request("api/auth/forgot-password", { body: "{}", method: "POST" })).rejects.toBeInstanceOf(MissingCsrfTokenError);
    await expect(client.request("api/auth/reset-password", { body: "{}", method: "POST" })).rejects.toBeInstanceOf(MissingCsrfTokenError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows mutations without CSRF token only when explicitly exempt via exemptCsrf", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200
    })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000", () => undefined, { defaultRequiresCsrf: true });

    // Explicitly exempt mutation is allowed
    await expect(client.request("api/custom-webhook", { body: "{}", exemptCsrf: true, method: "POST" })).resolves.toEqual({ ok: true });
    // requiresCsrf: false does NOT bypass defaultRequiresCsrf: true
    await expect(client.request("api/custom-action", { body: "{}", method: "POST", requiresCsrf: false })).rejects.toBeInstanceOf(MissingCsrfTokenError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends X-XSRF-TOKEN when CSRF token is provided for protected mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "Finished" }), {
      headers: { "content-type": "application/json" },
      status: 200
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000", () => "csrf-token-abc");

    const result = await client.request("api/reproductions/rep-1/status", {
      body: JSON.stringify({ status: "Finished" }),
      method: "PATCH",
      requiresCsrf: true
    });

    expect(result).toEqual({ status: "Finished" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token-abc");
  });
});


