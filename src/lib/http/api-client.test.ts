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
    expect(new Headers(request.headers).get("x-csrf-token")).toBe("csrf-token");
  });

  it("preserves a 403 response without session side effects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/private")).rejects.toMatchObject({ status: 403 });
  });
});
