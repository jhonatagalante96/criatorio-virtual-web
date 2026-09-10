import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./page";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

describe("ForgotPasswordPage", () => {
  it("validates the e-mail before sending a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ForgotPasswordPage />);

    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));

    expect(screen.getByText("Informe seu e-mail.")).toBeTruthy();
    expect(screen.getByLabelText("E-mail").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the generic recovery response and never discloses whether the e-mail exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " owner@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Verifique seu e-mail" })).toBeTruthy());
    expect(screen.getByText(/Se o e-mail estiver cadastrado/)).toBeTruthy();
    expect(screen.queryByText("owner@example.com")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, request] = fetchMock.mock.calls[1];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({ email: "owner@example.com" });
  });

  it("keeps the form available when the recovery service fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Raw API title" }), {
        headers: { "content-type": "application/problem+json" },
        status: 503
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Não foi possível solicitar"));
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar instruções" })).toBeTruthy();
  });
});
