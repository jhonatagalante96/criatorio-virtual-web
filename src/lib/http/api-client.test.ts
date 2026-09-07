import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient", () => {
  it("caches GET responses until the auth context is cleared", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: "owner@example.com" }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: "new-owner@example.com" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/auth/session")).resolves.toEqual({ email: "owner@example.com" });
    await expect(client.request("api/auth/session")).resolves.toEqual({ email: "owner@example.com" });
    client.clearCache();
    await expect(client.request("api/auth/session")).resolves.toEqual({ email: "new-owner@example.com" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the antiforgery token on mutations and preserves API field errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: { email: ["Informe um e-mail válido."] },
      title: "Dados inválidos."
    }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient("http://localhost:5000", () => "csrf-token");

    await expect(client.request("api/auth/login", { body: "{}", method: "POST" })).rejects.toMatchObject({
      fields: { email: ["Informe um e-mail válido."] },
      status: 400
    });
    const [, request] = fetchMock.mock.calls[0];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
  });

  it("keeps a 403 failure available to preserve the current session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const client = new ApiClient("http://localhost:5000");

    await expect(client.request("api/auth/logout", { method: "POST" })).rejects.toMatchObject({ status: 403 });
  });
});
