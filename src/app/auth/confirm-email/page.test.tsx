import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmEmailPage from "./page";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

function antiforgeryResponse(): Response {
  return new Response(null, {
    headers: { "X-XSRF-TOKEN": "csrf-token" },
    status: 204
  });
}

function problemResponse(status: number): Response {
  return new Response(JSON.stringify({
    detail: "Raw API detail",
    title: "Raw API title"
  }), {
    headers: { "content-type": "application/problem+json" },
    status
  });
}

describe("ConfirmEmailPage", () => {
  it("confirms the email, removes the sensitive query parameters, and shows the login action", async () => {
    window.history.replaceState({}, "", "/auth/confirm-email?userId=user-id&token=encoded-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "E-mail confirmado!" })).toBeTruthy());
    expect(window.location.search).toBe("");
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByText("encoded-token")).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, request] = fetchMock.mock.calls[1];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({ token: "encoded-token", userId: "user-id" });
  });

  it("does not call the API when the link parameters are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: "Solicitar novo link de confirmação" })).toBeTruthy();
  });

  it("maps an invalid API response to a friendly state without rendering the payload", async () => {
    window.history.replaceState({}, "", "/auth/confirm-email?userId=user-id&token=expired-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(problemResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect(screen.queryByText("Raw API detail")).toBeNull();
    expect(screen.queryByText("expired-token")).toBeNull();
  });

  it("shows a recoverable service error without rendering the API payload", async () => {
    window.history.replaceState({}, "", "/auth/confirm-email?userId=user-id&token=token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(problemResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Não foi possível confirmar seu e-mail" })).toBeTruthy());
    expect(screen.getByText(/O serviço está indisponível no momento/)).toBeTruthy();
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect(screen.queryByText("Raw API detail")).toBeNull();
  });

  it("resends a confirmation link with a fresh email value", async () => {
    window.history.replaceState({}, "", "/auth/confirm-email?userId=user-id&token=expired-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(problemResponse(400))
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());

    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: " owner@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar novo link" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("enviaremos um novo link"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, request] = fetchMock.mock.calls[3];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({ email: "owner@example.com" });
  });

  it("validates the resend email before sending", async () => {
    window.history.replaceState({}, "", "/auth/confirm-email");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Enviar novo link" }));

    expect(screen.getByText("Informe seu e-mail.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains when the resend request is rate limited", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(problemResponse(429));
    vi.stubGlobal("fetch", fetchMock);

    render(<ConfirmEmailPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("E-mail cadastrado"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar novo link" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Aguarde alguns instantes"));
    expect(screen.queryByText("Raw API title")).toBeNull();
  });
});
