import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthenticatedShell } from "./authenticated-shell";
import { clearShellIdentity } from "../../lib/auth/shell-identity";

afterEach(() => {
  cleanup();
  clearShellIdentity();
});

describe("AuthenticatedShell", () => {
  it("keeps the last known account and farm identity during a loading shell", async () => {
    const { rerender } = render(
      <AuthenticatedShell activeNav="dashboard" email="jhonata@example.com" farmName="Criatório Aurora">
        <div>Conteúdo carregado</div>
      </AuthenticatedShell>
    );

    await waitFor(() => expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0));

    rerender(
      <AuthenticatedShell activeNav="birds" email="" farmName="Criatório selecionado">
        <div role="status">Carregando plantel</div>
      </AuthenticatedShell>
    );

    expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Criatório Aurora").length).toBeGreaterThan(0);
  });

  it("restores the last known identity after a full page reload", () => {
    window.sessionStorage.setItem(
      "criatorio-shell-identity",
      JSON.stringify({ email: "jhonata.galante@example.com", farmName: "Criatório Aurora" })
    );

    render(
      <AuthenticatedShell activeNav="birds" email="" farmName="Criatório selecionado">
        <div>Carregando plantel</div>
      </AuthenticatedShell>
    );

    expect(screen.getAllByText("Jhonata Galante").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Criatório Aurora").length).toBeGreaterThan(0);
  });

  it("keeps the mobile navigation and account menu available", async () => {
    const { container } = render(
      <AuthenticatedShell activeNav="birds" email="jhonata@example.com" farmName="Criatório Aurora">
        <div>Conteúdo carregado</div>
      </AuthenticatedShell>
    );

    await waitFor(() => expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0));

    expect(container.querySelector(".authenticated-mobile-menu")).not.toBeNull();
    expect(container.querySelector(".authenticated-mobile-account-control")).not.toBeNull();
    expect(container.querySelector(".authenticated-account-menu-panel a[href='/configuracoes/criatorio']")).not.toBeNull();
    expect(container.querySelector(".authenticated-account-menu-panel a[href='/configuracoes']")).not.toBeNull();
  });

  it("opens the reproduction history from the primary navigation", async () => {
    render(
      <AuthenticatedShell activeNav="reproduction" email="jhonata@example.com" farmName="Criatório Aurora">
        <div>Histórico de reproduções</div>
      </AuthenticatedShell>
    );

    await waitFor(() => expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0));

    const reproductionLinks = screen.getAllByRole("link", { name: "Reprodução" });
    expect(reproductionLinks.length).toBeGreaterThan(0);
    expect(reproductionLinks.every((link) => link.getAttribute("href") === "/reproducao")).toBe(true);
    expect(reproductionLinks.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("opens the transfer list from the primary navigation", async () => {
    render(
      <AuthenticatedShell activeNav="transfers" email="jhonata@example.com" farmName="Criatório Aurora">
        <div>Nova transferência</div>
      </AuthenticatedShell>
    );

    await waitFor(() => expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0));

    const transferLinks = screen.getAllByRole("link", { name: "Transferências" });
    expect(transferLinks.length).toBeGreaterThan(0);
    expect(transferLinks.every((link) => link.getAttribute("href") === "/transferencias")).toBe(true);
    expect(transferLinks.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });
});
