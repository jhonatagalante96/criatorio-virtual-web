import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./auth-context";
import { AccessProvider, useAccessContext } from "./access-provider";
import { notifyFunctionalAccessBlocked } from "../http/api-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sampleAccessContext = {
  user: {
    id: "usr-123",
    name: "Criador Teste",
    email: "criador@example.com",
    avatarUrl: null
  },
  breedingFarm: {
    id: "farm-456",
    name: "Criatório Aurora",
    role: "Owner"
  },
  onboarding: {
    status: "Completed",
    nextStep: null
  },
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

function Consumer() {
  const access = useAccessContext();
  if (!access) return <div>Sem contexto</div>;

  return (
    <div>
      <span data-testid="status">{access.status}</span>
      <span data-testid="canAccess">{String(access.accessContext?.access?.canAccessApp)}</span>
      <span data-testid="user">{access.accessContext?.user?.name ?? ""}</span>
      <span data-testid="error">{access.error ?? ""}</span>
      <button onClick={() => void access.refetch()} type="button">Refetch</button>
    </div>
  );
}

describe("AccessProvider", () => {
  it("fetches access context when session is authenticated and transitions to ready", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) {
        return new Response(JSON.stringify({ email: "criador@example.com", emailConfirmed: true, userId: "usr-123" }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }
      if (url.includes("api/me/access-context")) {
        return new Response(JSON.stringify(sampleAccessContext), {
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
          <Consumer />
        </AccessProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
      expect(screen.getByTestId("canAccess").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toBe("Criador Teste");
    });
  });

  it("handles fail-closed error state when access-context returns 500 or malformed payload", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) {
        return new Response(JSON.stringify({ email: "criador@example.com", emailConfirmed: true, userId: "usr-123" }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }
      if (url.includes("api/me/access-context")) {
        return new Response(JSON.stringify({ malformed: true }), {
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
          <Consumer />
        </AccessProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("error");
      expect(screen.getByTestId("canAccess").textContent).toBe("undefined");
      expect(screen.getByTestId("error").textContent).not.toBe("");
    });
  });

  it("re-queries access-context and updates state when notifyFunctionalAccessBlocked is triggered", async () => {
    let accessContextCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api/auth/session")) {
        return new Response(JSON.stringify({ email: "criador@example.com", emailConfirmed: true, userId: "usr-123" }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }
      if (url.includes("api/me/access-context")) {
        accessContextCount += 1;
        if (accessContextCount === 1) {
          return new Response(JSON.stringify(sampleAccessContext), {
            headers: { "content-type": "application/json" },
            status: 200
          });
        }
        // Second call: now blocked by billing
        return new Response(JSON.stringify({
          ...sampleAccessContext,
          access: {
            status: "Blocked",
            canAccessApp: false,
            blockedReason: "PaymentOverdue",
            requiredAction: "Regularize",
            trialEndsAt: null,
            gracePeriodEndsAt: null
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
          <Consumer />
        </AccessProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
      expect(screen.getByTestId("canAccess").textContent).toBe("true");
    });

    // Simulate central 403 functional access blocked event
    notifyFunctionalAccessBlocked();

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
      expect(screen.getByTestId("canAccess").textContent).toBe("false");
    });
  });
});
