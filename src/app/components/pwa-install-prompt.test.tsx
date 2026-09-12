import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaInstallPrompt } from "./pwa-install-prompt";

const originalMatchMedia = window.matchMedia;
const originalUserAgent = window.navigator.userAgent;

function mockViewport(isMobile: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: query.includes("max-width") ? isMobile : false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn()
  })) as typeof window.matchMedia;
}

function mockUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.matchMedia = originalMatchMedia;
  mockUserAgent(originalUserAgent);
});

describe("PwaInstallPrompt", () => {
  it("does not render on desktop", async () => {
    mockViewport(false);

    render(<PwaInstallPrompt />);

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows mobile installation guidance after the authenticated shell loads", async () => {
    mockViewport(true);

    render(<PwaInstallPrompt />);

    expect(await screen.findByRole("status", { name: "Instale o Criatório Virtual" })).toBeTruthy();
    expect(screen.getByText(/Adicionar à tela inicial/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entendi" })).toBeTruthy();
  });

  it("uses the browser installation prompt when it becomes available", async () => {
    mockViewport(true);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = new Event("beforeinstallprompt");
    Object.defineProperties(installEvent, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: "accepted", platform: "web" }) }
    });

    render(<PwaInstallPrompt />);
    await screen.findByRole("status", { name: "Instale o Criatório Virtual" });

    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    const installButton = await screen.findByRole("button", { name: "Instalar agora" });
    await act(async () => {
      fireEvent.click(installButton);
    });

    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows the iOS-specific installation instructions", async () => {
    mockViewport(true);
    mockUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");

    render(<PwaInstallPrompt />);

    expect(await screen.findByText(/Toque em Compartilhar e escolha Adicionar à Tela de Início/i)).toBeTruthy();
  });

  it("remembers when the user dismisses the guidance", async () => {
    mockViewport(true);
    const { unmount } = render(<PwaInstallPrompt />);

    const dismissButton = await screen.findByRole("button", { name: "Entendi" });
    fireEvent.click(dismissButton);
    expect(screen.queryByRole("status")).toBeNull();
    unmount();

    render(<PwaInstallPrompt />);

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
