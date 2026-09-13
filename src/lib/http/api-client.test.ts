import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, StaleTenantResponseError } from "./api-client";

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
});

