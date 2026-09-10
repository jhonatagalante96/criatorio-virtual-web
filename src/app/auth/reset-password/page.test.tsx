import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

function antiforgeryResponse(): Response {
  return new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 });
}

describe("ResetPasswordPage", () => {
  it("shows an invalid state and does not call the API when the link is incomplete", async () => {
    window.history.replaceState({}, "", "/auth/reset-password");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ResetPasswordPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Solicitar novo link" }).getAttribute("href")).toBe("/auth/forgot-password");
  });

  it("resets the password with the contract fields and removes the sensitive query", async () => {
    window.history.replaceState({}, "", "/auth/reset-password?userId=user-id&token=encoded-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResetPasswordPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crie uma nova senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "ResetStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "ResetStrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Senha redefinida!" })).toBeTruthy());
    expect(window.location.search).toBe("");
    expect(screen.queryByText("encoded-token")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, request] = fetchMock.mock.calls[1];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({
      confirmPassword: "ResetStrongPassword!123",
      newPassword: "ResetStrongPassword!123",
      token: "encoded-token",
      userId: "user-id"
    });
  });

  it("rejects a weak or mismatched password before sending", async () => {
    window.history.replaceState({}, "", "/auth/reset-password?userId=user-id&token=token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ResetPasswordPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crie uma nova senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "weak" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(screen.getByLabelText("Senha nova").getAttribute("aria-describedby")).toBe("new-password-error");
    expect(screen.getByText("As senhas não coincidem.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not render a reset token when the API rejects the link", async () => {
    window.history.replaceState({}, "", "/auth/reset-password?userId=user-id&token=expired-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(antiforgeryResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Raw API title" }), {
        headers: { "content-type": "application/problem+json" },
        status: 400
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResetPasswordPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Crie uma nova senha" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Senha nova"), { target: { value: "ResetStrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha nova"), { target: { value: "ResetStrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeTruthy());
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect(screen.queryByText("expired-token")).toBeNull();
  });
});
