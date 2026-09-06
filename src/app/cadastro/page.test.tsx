import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RegistrationPage", () => {
  it("shows accessible validation feedback without sending an incomplete form", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegistrationPage />);

    fireEvent.submit(screen.getByRole("button", { name: "Criar minha conta" }));

    expect(screen.getByText("Informe seu e-mail.")).toBeTruthy();
    expect(screen.getByText("Informe uma senha.")).toBeTruthy();
    expect(screen.getByText("Confirme sua senha.")).toBeTruthy();
    expect(screen.getByLabelText("E-mail").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers with the API contract and shows the confirmation navigation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: { "X-XSRF-TOKEN": "csrf-token" },
        status: 204
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: "owner@example.com",
        emailConfirmationRequired: true,
        userId: "user-id"
      }), { headers: { "content-type": "application/json" }, status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegistrationPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " owner@example.com " } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirme sua senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar minha conta" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confirme seu e-mail" })).toBeTruthy());
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/login");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, request] = fetchMock.mock.calls[1];
    expect(new Headers(request.headers).get("x-xsrf-token")).toBe("csrf-token");
    expect(JSON.parse(request.body as string)).toEqual({ email: "owner@example.com", password: "StrongPassword!123" });
  });

  it("keeps the form available and maps API field errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: { "X-XSRF-TOKEN": "csrf-token" },
        status: 204
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: { email: ["Este e-mail já está em uso."] },
        title: "Dados inválidos."
      }), { headers: { "content-type": "application/problem+json" }, status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegistrationPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirme sua senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar minha conta" }));

    await waitFor(() => expect(screen.getByText("Este e-mail já está em uso.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Criar minha conta" })).toBeTruthy();
  });

  it("shows a duplicate-account message without hiding the login link", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: { "X-XSRF-TOKEN": "csrf-token" },
        status: 204
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: "Já existe uma conta com este e-mail."
      }), { headers: { "content-type": "application/problem+json" }, status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegistrationPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirme sua senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar minha conta" }));

    await waitFor(() => expect(screen.getByText(/Já existe uma conta com este e-mail/)).toBeTruthy());
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/login");
  });

  it("disables the form while the request is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<RegistrationPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.change(screen.getByLabelText("Confirme sua senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar minha conta" }));

    expect((screen.getByRole("button", { name: "Criando sua conta…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("E-mail") as HTMLInputElement).disabled).toBe(true);
  });
});

