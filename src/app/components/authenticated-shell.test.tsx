import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedShell } from "./authenticated-shell";
import { clearShellIdentity } from "../../lib/auth/shell-identity";

afterEach(() => {
  cleanup();
  clearShellIdentity();
  vi.unstubAllGlobals();
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

  it("keeps both desktop navigation groups in a separate scroll region above the inspiration footer", async () => {
    const { container } = render(
      <AuthenticatedShell activeNav="dashboard" email="jhonata@example.com" farmName="Criatório Aurora">
        <div>Conteúdo carregado</div>
      </AuthenticatedShell>
    );

    await waitFor(() => expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0));

    const sidebar = container.querySelector(".authenticated-sidebar");
    const navigationRegion = container.querySelector(".authenticated-sidebar-navigation");
    const inspirationFooter = container.querySelector(".authenticated-sidebar-inspiration");

    expect(navigationRegion?.querySelectorAll("nav")).toHaveLength(2);
    expect(navigationRegion?.contains(inspirationFooter)).toBe(false);
    expect(inspirationFooter?.parentElement).toBe(sidebar);
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

  it("opens Estatísticas from the primary navigation on desktop and mobile", async () => {
    render(
      <AuthenticatedShell activeNav="statistics" email="jhonata@example.com" farmName="Criatório Aurora">
        <div>Resumo analítico</div>
      </AuthenticatedShell>
    );

    await waitFor(() => expect(screen.getAllByText("Jhonata").length).toBeGreaterThan(0));
    const statisticsLinks = screen.getAllByRole("link", { name: "Estatísticas" });
    expect(statisticsLinks).toHaveLength(2);
    expect(statisticsLinks.every((link) => link.getAttribute("href") === "/estatisticas")).toBe(true);
    expect(statisticsLinks.every((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });

  describe("AccessContext guard and billing routing", () => {
    const validUser = {
      id: "usr-1",
      name: "Jhonata Galante",
      email: "jhonata@example.com",
      avatarUrl: null
    };

    const validFarm = {
      id: "farm-1",
      name: "Criatório Aurora",
      role: "Owner"
    };

    const baseContext = {
      user: validUser,
      breedingFarm: validFarm,
      onboarding: { status: "Completed", nextStep: null },
      access: {
        status: "Active",
        canAccessApp: true,
        blockedReason: null,
        requiredAction: "None",
        trialEndsAt: null,
        gracePeriodEndsAt: null
      },
      subscription: {
        plan: "standard",
        cycle: "monthly",
        status: "Active"
      }
    };

    it("FE-086-AC01: displays loading state without flashing protected functional content", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      let resolveAccess!: (res: Response) => void;
      const accessPromise = new Promise<Response>((resolve) => {
        resolveAccess = resolve;
      });

      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api/auth/session")) {
          return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        if (url.includes("api/me/access-context")) {
          return accessPromise;
        }
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <AuthProvider>
          <AccessProvider>
            <AuthenticatedShell activeNav="dashboard">
              <div data-testid="protected-content">Conteúdo Protegido</div>
            </AuthenticatedShell>
          </AccessProvider>
        </AuthProvider>
      );

      // Loading state should be visible immediately
      expect(screen.getByText("Carregando")).not.toBeNull();
      // Protected content MUST NOT be rendered
      expect(screen.queryByTestId("protected-content")).toBeNull();

      // Resolve access context
      resolveAccess(new Response(JSON.stringify(baseContext), {
        headers: { "content-type": "application/json" },
        status: 200
      }));

      // Now protected content is revealed
      await waitFor(() => {
        expect(screen.getByTestId("protected-content")).not.toBeNull();
      });
    });

    it("FE-086-AC02: releases the app for Trial, Active and GracePeriod with canAccessApp=true", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      for (const status of ["Trial", "Active", "GracePeriod"] as const) {
        cleanup();
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("api/auth/session")) {
            return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
              headers: { "content-type": "application/json" },
              status: 200
            });
          }
          if (url.includes("api/me/access-context")) {
            return new Response(JSON.stringify({
              ...baseContext,
              access: {
                ...baseContext.access,
                status,
                canAccessApp: true,
                requiredAction: status === "GracePeriod" ? "Regularize" : "None",
                trialEndsAt: status === "Trial" ? "2026-09-25T00:00:00Z" : null,
                gracePeriodEndsAt: status === "GracePeriod" ? "2026-09-22T00:00:00Z" : null
              }
            }), {
              headers: { "content-type": "application/json" },
              status: 200
            });
          }
          return new Response(null, { status: 404 });
        });
        vi.stubGlobal("fetch", fetchMock);

        render(
          <AuthProvider>
            <AccessProvider>
              <AuthenticatedShell activeNav="birds">
                <div data-testid={`content-${status}`}>Plantel Liberado</div>
              </AuthenticatedShell>
            </AccessProvider>
          </AuthProvider>
        );

        await waitFor(() => {
          expect(screen.getByTestId(`content-${status}`)).not.toBeNull();
        });
      }
    });

    it("FE-086-AC03: blocks functional content when canAccessApp=false and follows requiredAction", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      const testCases = [
        {
          action: "Subscribe" as const,
          blockedReason: "SubscriptionRequired" as const,
          expectedHref: "/billing/subscription-checkout",
          expectedLabel: "Contratar assinatura",
          status: "PendingSubscription" as const
        },
        {
          action: "Regularize" as const,
          blockedReason: "PaymentOverdue" as const,
          expectedHref: "/assinatura",
          expectedLabel: "Regularizar pagamento",
          status: "Blocked" as const
        },
        {
          action: "Resubscribe" as const,
          blockedReason: "SubscriptionCancelled" as const,
          expectedHref: "/assinatura",
          expectedLabel: "Reativar assinatura",
          status: "Cancelled" as const
        },
        {
          action: "None" as const,
          blockedReason: null,
          expectedHref: null,
          expectedLabel: "Verificar novamente",
          status: "Blocked" as const
        }
      ];

      for (const tc of testCases) {
        cleanup();
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("api/auth/session")) {
            return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
              headers: { "content-type": "application/json" },
              status: 200
            });
          }
          if (url.includes("api/me/access-context")) {
            return new Response(JSON.stringify({
              ...baseContext,
              access: {
                ...baseContext.access,
                status: tc.status,
                canAccessApp: false,
                blockedReason: tc.blockedReason,
                requiredAction: tc.action
              }
            }), {
              headers: { "content-type": "application/json" },
              status: 200
            });
          }
          return new Response(null, { status: 404 });
        });
        vi.stubGlobal("fetch", fetchMock);

        render(
          <AuthProvider>
            <AccessProvider>
              <AuthenticatedShell activeNav="dashboard">
                <div data-testid="dashboard-content">Dashboard Secreto</div>
              </AuthenticatedShell>
            </AccessProvider>
          </AuthProvider>
        );

        await waitFor(() => {
          expect(screen.queryByTestId("dashboard-content")).toBeNull();
          if (tc.expectedHref) {
            const link = screen.getByRole("link", { name: tc.expectedLabel });
            expect(link.getAttribute("href")).toBe(tc.expectedHref);
          } else {
            expect(screen.getByRole("button", { name: tc.expectedLabel })).not.toBeNull();
          }
        });
      }
    });

    it("FE-086-AC05: resumes onboarding when authenticated without breeding farm, without billing overdue message", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api/auth/session")) {
          return new Response(JSON.stringify({ email: "novo@example.com", emailConfirmed: true, userId: "usr-novo" }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        if (url.includes("api/me/access-context")) {
          return new Response(JSON.stringify({
            ...baseContext,
            breedingFarm: null,
            onboarding: { status: "Pending", nextStep: "CreateBreedingFarm" },
            access: {
              status: "PendingSubscription",
              canAccessApp: false,
              blockedReason: null,
              requiredAction: "None",
              trialEndsAt: null,
              gracePeriodEndsAt: null
            },
            subscription: null
          }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <AuthProvider>
          <AccessProvider>
            <AuthenticatedShell activeNav="dashboard">
              <div data-testid="dashboard-content">Dashboard Secreto</div>
            </AuthenticatedShell>
          </AccessProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId("dashboard-content")).toBeNull();
        // Onboarding action is offered
        expect(screen.getByRole("link", { name: "Criar meu criatório" }).getAttribute("href")).toBe("/onboarding/criatorio");
        // Must NOT show billing overdue / inadimplência messages
        expect(screen.queryByText(/fatura em aberto/i)).toBeNull();
        expect(screen.queryByText(/inadimplente/i)).toBeNull();
      });
    });

    it("FE-086-AC06: allows /assinatura when canAccessApp=false but disables functional navigation links", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api/auth/session")) {
          return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        if (url.includes("api/me/access-context")) {
          return new Response(JSON.stringify({
            ...baseContext,
            access: {
              ...baseContext.access,
              status: "Blocked",
              canAccessApp: false,
              blockedReason: "PaymentOverdue",
              requiredAction: "Regularize"
            }
          }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <AuthProvider>
          <AccessProvider>
            <AuthenticatedShell activeNav="subscription">
              <div data-testid="subscription-regularize-content">Painel de Regularização</div>
            </AuthenticatedShell>
          </AccessProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        // The subscription page itself is permitted so the user can regularize
        expect(screen.getByTestId("subscription-regularize-content")).not.toBeNull();
        // But functional links (such as Painel / Dashboard) are disabled
        const dashboardLink = screen.queryByRole("link", { name: "Painel" });
        expect(dashboardLink).toBeNull();
        expect(screen.getAllByTitle("Acesso bloqueado por pendência de assinatura").length).toBeGreaterThan(0);
      });
    });

    it("FE-086-AC07: fails closed on malformed access payload or error and provides retry", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api/auth/session")) {
          return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        if (url.includes("api/me/access-context")) {
          callCount += 1;
          if (callCount === 1) {
            return new Response(JSON.stringify({ invalid: true }), {
              headers: { "content-type": "application/json" },
              status: 200
            });
          }
          return new Response(JSON.stringify(baseContext), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <AuthProvider>
          <AccessProvider>
            <AuthenticatedShell activeNav="dashboard">
              <div data-testid="dashboard-content">Dashboard</div>
            </AuthenticatedShell>
          </AccessProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId("dashboard-content")).toBeNull();
        expect(screen.getByText("Não foi possível verificar seu acesso")).not.toBeNull();
        expect(screen.getByRole("button", { name: "Tentar novamente" })).not.toBeNull();
      });

      // Click retry
      screen.getByRole("button", { name: "Tentar novamente" }).click();

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-content")).not.toBeNull();
      });
    });

    it("FE-086-AC05: maps nextStep CreateBreedingFarm semantically to /onboarding/criatorio without billing overdue notices", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      const createFarmContext = {
        user: validUser,
        breedingFarm: null,
        onboarding: {
          status: "Pending",
          nextStep: "CreateBreedingFarm"
        },
        access: {
          status: "PendingSubscription",
          canAccessApp: false,
          blockedReason: null,
          requiredAction: "None",
          trialEndsAt: null,
          gracePeriodEndsAt: null
        },
        subscription: null
      };

      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api/auth/session")) {
          return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        if (url.includes("api/me/access-context")) {
          return new Response(JSON.stringify(createFarmContext), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <AuthProvider>
          <AccessProvider>
            <AuthenticatedShell activeNav="dashboard">
              <div data-testid="dashboard-content">Dashboard</div>
            </AuthenticatedShell>
          </AccessProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId("dashboard-content")).toBeNull();
        expect(screen.getByText("Crie seu primeiro criatório")).not.toBeNull();
      });

      const actionLink = screen.getByRole("link", { name: "Criar meu criatório" });
      expect(actionLink.getAttribute("href")).toBe("/onboarding/criatorio");

      // Verify NO billing overdue notices are present
      expect(screen.queryByText(/inadimplente|bloqueado|regularize|assine/i)).toBeNull();
    });

    it("FE-086-AC05: maps nextStep SelectBreedingFarm semantically to /onboarding/criatorio/selecionar without billing overdue notices", async () => {
      const { AuthProvider } = await import("../../lib/auth/auth-context");
      const { AccessProvider } = await import("../../lib/auth/access-provider");

      const selectFarmContext = {
        user: validUser,
        breedingFarm: null,
        onboarding: {
          status: "Pending",
          nextStep: "SelectBreedingFarm"
        },
        access: {
          status: "PendingSubscription",
          canAccessApp: false,
          blockedReason: null,
          requiredAction: "None",
          trialEndsAt: null,
          gracePeriodEndsAt: null
        },
        subscription: null
      };

      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api/auth/session")) {
          return new Response(JSON.stringify({ email: "jhonata@example.com", emailConfirmed: true, userId: "usr-1" }), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        if (url.includes("api/me/access-context")) {
          return new Response(JSON.stringify(selectFarmContext), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        return new Response(null, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <AuthProvider>
          <AccessProvider>
            <AuthenticatedShell activeNav="dashboard">
              <div data-testid="dashboard-content">Dashboard</div>
            </AuthenticatedShell>
          </AccessProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId("dashboard-content")).toBeNull();
        expect(screen.getByText("Selecione um criatório")).not.toBeNull();
      });

      const actionLink = screen.getByRole("link", { name: "Selecionar criatório" });
      expect(actionLink.getAttribute("href")).toBe("/onboarding/criatorio/selecionar");

      // Verify NO billing overdue notices are present
      expect(screen.queryByText(/inadimplente|bloqueado|regularize|assine/i)).toBeNull();
    });
  });
});

