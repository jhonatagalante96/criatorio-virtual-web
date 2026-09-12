import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));

afterEach(() => {
  cleanup();
  routerReplace.mockReset();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function unauthenticatedResponse(): Response {
  return new Response(null, { status: 401 });
}

function apiErrorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ code, detail: "Raw API detail", title: "Raw API title" }), {
    headers: { "content-type": "application/problem+json" },
    status
  });
}

function authenticatedSession(): Response {
  return new Response(JSON.stringify({
    email: "owner@example.com",
    emailConfirmed: true,
    userId: "user-id"
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

function breedingFarmsResponse(farms: string[], selectedBreedingFarmId: string | null = null): Response {
  return new Response(JSON.stringify({
    breedingFarms: farms.map((breedingFarmId) => ({ breedingFarmId })),
    selectedBreedingFarmId
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("LoginPage", () => {
  it("restores an anonymous session and validates the form accessibly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthenticatedResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByText("Informe seu e-mail.")).toBeTruthy();
    expect(screen.getByText("Informe sua senha.")).toBeTruthy();
    expect(screen.getByLabelText("E-mail").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts Google authentication in a popup and confirms the server session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-id"], "farm-id"));
    const popup = { close: vi.fn(), closed: false } as unknown as Window;
    const openMock = vi.spyOn(window, "open").mockReturnValue(popup);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Continuar com Google" }).querySelector("img")?.getAttribute("src"))
      .toBe("/assets/icons/ui/google.svg");
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://localhost:58016/api/auth/google",
      "criatorio-google-authentication",
      "popup,width=520,height=680,resizable=yes,scrollbars=yes"
    );
    expect(screen.getByRole("status").textContent).toContain("Conclua a entrada");

    fireEvent.click(screen.getByRole("button", { name: "Verificar sessão" }));
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("automatically verifies the session when the Google popup returns to the frontend", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-id"], "farm-id"));
    const popupLocation = { href: "https://accounts.google.com/o/oauth2/auth" };
    const popup = { close: vi.fn(), closed: false, location: popupLocation } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    popupLocation.href = `${window.location.origin}/`;

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes the session when the Google callback popup notifies the login page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-id"], "farm-id"));
    const popup = { close: vi.fn(), closed: false } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    window.dispatchEvent(new MessageEvent("message", {
      data: { status: "success", type: "criatorio-google-authentication" },
      origin: window.location.origin
    }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("checks the session before reporting that the callback popup closed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-id"], "farm-id"));
    let popupClosed = false;
    const popup = { close: vi.fn(), get closed() { return popupClosed; } } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    popupClosed = true;

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("A janela do Google foi fechada antes da conclusão. Tente novamente.")).toBeNull();
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("reports a manually closed callback popup when no authenticated session exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(unauthenticatedResponse());
    let popupClosed = false;
    const popup = { close: vi.fn(), get closed() { return popupClosed; } } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    popupClosed = true;

    await waitFor(() => expect(screen.getByRole("alert").textContent)
      .toContain("A janela do Google foi fechada antes da conclusão"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a recoverable error when Google does not authenticate the session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(unauthenticatedResponse());
    vi.spyOn(window, "open").mockReturnValue({ close: vi.fn(), closed: false } as unknown as Window);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    fireEvent.click(screen.getByRole("button", { name: "Verificar sessão" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Não foi possível concluir a entrada com Google"));
    expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy();
  });

  it("maps the Google API code to a friendly message instead of rendering the payload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(apiErrorResponse(409, "google_account_already_exists"));
    vi.spyOn(window, "open").mockReturnValue({ close: vi.fn(), closed: false } as unknown as Window);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    fireEvent.click(screen.getByRole("button", { name: "Verificar sessão" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Esta conta Google já está cadastrada"));
    expect(screen.queryByText("Raw API title")).toBeNull();
    expect(screen.queryByText("Raw API detail")).toBeNull();
  });

  it("reads the Google error code from the callback URL and removes it from the address", async () => {
    window.history.replaceState({}, "", "/login?googleError=email_conflict&correlationId=trace-123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthenticatedResponse()));
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Esta conta Google já está cadastrada"));
    expect(window.location.search).toBe("");
    expect(screen.queryByText("email_conflict")).toBeNull();
    expect(screen.queryByText("trace-123")).toBeNull();
  });

  it("receives callback errors from the Google popup and restores the login state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthenticatedResponse());
    const popup = { close: vi.fn(), closed: false } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    expect(screen.getByRole("status")).toBeTruthy();

    window.dispatchEvent(new MessageEvent("message", {
      data: { code: "google_authentication_failed", status: "error", type: "criatorio-google-authentication" },
      origin: window.location.origin
    }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Não foi possível autenticar com Google"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("explains when the Google popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthenticatedResponse()));
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));

    expect(screen.getByRole("alert").textContent).toContain("Permita pop-ups");
  });

  it("opens the only associated breeding farm directly in the dashboard", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "before-login" }, status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-id"], "farm-id"));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " owner@example.com " } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.getByRole("heading", { name: "Abrindo seu espaço" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const [, loginRequest] = fetchMock.mock.calls[2];
    expect(new Headers(loginRequest.headers).get("x-xsrf-token")).toBe("before-login");
    expect(JSON.parse(loginRequest.body as string)).toEqual({ email: "owner@example.com", password: "StrongPassword!123" });
  });

  it("opens the breeding-farm selector after login when there is more than one farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "before-login" }, status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-a", "farm-b"], "farm-a"));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/criatorio/selecionar"));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("resumes onboarding when the only farm has not been selected yet", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "before-login" }, status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse(["farm-id"]));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "StrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/criatorio/selecionar"));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("opens onboarding automatically when the authenticated user has no farm", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticatedSession())
      .mockResolvedValueOnce(breedingFarmsResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/criatorio"));
    expect(screen.queryByRole("link", { name: /Continuar onboarding/i })).toBeNull();
  });

  it("shows a generic invalid-credentials message for a 401 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(new Response(null, { headers: { "X-XSRF-TOKEN": "csrf-token" }, status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Invalid email or password." }), {
        headers: { "content-type": "application/problem+json" },
        status: 401
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entre na sua conta" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "WrongPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("E-mail ou senha inválidos."));
    expect(screen.queryByText("Invalid email or password.")).toBeNull();
  });

  it("keeps a forbidden session response in a blocked state instead of redirecting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Acesso bloqueado" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Verificar novamente" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "E-mail" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});
