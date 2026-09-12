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
});
