import { describe, expect, it } from "vitest";
import { InvalidAccessContextError, parseAccessContext } from "./access-context";

describe("parseAccessContext", () => {
  const validBasePayload = {
    user: {
      id: "usr-123",
      name: "Criador Exemplo",
      email: "criador@example.com",
      avatarUrl: "https://example.com/avatar.png"
    },
    breedingFarm: {
      id: "farm-123",
      name: "Criatório Exemplo",
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

  it("parses a valid active access context successfully", () => {
    const result = parseAccessContext(validBasePayload);
    expect(result.user.name).toBe("Criador Exemplo");
    expect(result.breedingFarm?.name).toBe("Criatório Exemplo");
    expect(result.access.status).toBe("Active");
    expect(result.access.canAccessApp).toBe(true);
    expect(result.access.requiredAction).toBe("None");
  });

  it("parses valid Trial and GracePeriod states with canAccessApp=true", () => {
    const trialPayload = {
      ...validBasePayload,
      access: {
        ...validBasePayload.access,
        status: "Trial",
        canAccessApp: true,
        trialEndsAt: "2026-09-25T12:00:00Z"
      }
    };
    const trialResult = parseAccessContext(trialPayload);
    expect(trialResult.access.status).toBe("Trial");
    expect(trialResult.access.canAccessApp).toBe(true);
    expect(trialResult.access.trialEndsAt).toBe("2026-09-25T12:00:00Z");

    const gracePayload = {
      ...validBasePayload,
      access: {
        ...validBasePayload.access,
        status: "GracePeriod",
        canAccessApp: true,
        requiredAction: "Regularize",
        gracePeriodEndsAt: "2026-09-20T12:00:00Z"
      }
    };
    const graceResult = parseAccessContext(gracePayload);
    expect(graceResult.access.status).toBe("GracePeriod");
    expect(graceResult.access.canAccessApp).toBe(true);
    expect(graceResult.access.requiredAction).toBe("Regularize");
  });

  it("parses valid Blocked, Cancelled and PendingSubscription with canAccessApp=false", () => {
    const blockedPayload = {
      ...validBasePayload,
      access: {
        ...validBasePayload.access,
        status: "Blocked",
        canAccessApp: false,
        blockedReason: "PaymentOverdue",
        requiredAction: "Regularize"
      }
    };
    const blockedResult = parseAccessContext(blockedPayload);
    expect(blockedResult.access.canAccessApp).toBe(false);
    expect(blockedResult.access.requiredAction).toBe("Regularize");
    expect(blockedResult.access.blockedReason).toBe("PaymentOverdue");

    const cancelledPayload = {
      ...validBasePayload,
      access: {
        ...validBasePayload.access,
        status: "Cancelled",
        canAccessApp: false,
        blockedReason: "SubscriptionCancelled",
        requiredAction: "Resubscribe"
      }
    };
    const cancelledResult = parseAccessContext(cancelledPayload);
    expect(cancelledResult.access.canAccessApp).toBe(false);
    expect(cancelledResult.access.requiredAction).toBe("Resubscribe");

    const pendingPayload = {
      ...validBasePayload,
      access: {
        ...validBasePayload.access,
        status: "PendingSubscription",
        canAccessApp: false,
        blockedReason: "SubscriptionRequired",
        requiredAction: "Subscribe"
      }
    };
    const pendingResult = parseAccessContext(pendingPayload);
    expect(pendingResult.access.canAccessApp).toBe(false);
    expect(pendingResult.access.requiredAction).toBe("Subscribe");
  });

  it("parses unselected breeding farm with canAccessApp=false", () => {
    const unselectedPayload = {
      ...validBasePayload,
      breedingFarm: null,
      onboarding: {
        status: "Pending",
        nextStep: "/onboarding/criatorio"
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
    const result = parseAccessContext(unselectedPayload);
    expect(result.breedingFarm).toBeNull();
    expect(result.onboarding.status).toBe("Pending");
    expect(result.access.canAccessApp).toBe(false);
  });

  it("fails closed on unknown enums", () => {
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "UnknownStatus" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, requiredAction: "InvalidAction" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      onboarding: { ...validBasePayload.onboarding, status: "InFlight" }
    })).toThrow(InvalidAccessContextError);
  });

  it("fails closed on inconsistent combinations", () => {
    // canAccessApp is true but status is Blocked
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", canAccessApp: true }
    })).toThrow(InvalidAccessContextError);

    // canAccessApp is true but status is Cancelled
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Cancelled", canAccessApp: true }
    })).toThrow(InvalidAccessContextError);

    // canAccessApp is false but status is Active
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Active", canAccessApp: false }
    })).toThrow(InvalidAccessContextError);

    // canAccessApp is true without breeding farm
    expect(() => parseAccessContext({
      ...validBasePayload,
      breedingFarm: null,
      access: { ...validBasePayload.access, canAccessApp: true }
    })).toThrow(InvalidAccessContextError);
  });

  it("fails closed on malformed or incomplete payloads", () => {
    expect(() => parseAccessContext(null)).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({})).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({ user: { id: "1" } })).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({ ...validBasePayload, user: null })).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({ ...validBasePayload, access: { ...validBasePayload.access, canAccessApp: "yes" } })).toThrow(InvalidAccessContextError);
  });
});
