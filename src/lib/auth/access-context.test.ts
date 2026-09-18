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

  it("parses unselected breeding farm with canAccessApp=false and semantic nextStep", () => {
    const unselectedCreatePayload = {
      ...validBasePayload,
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
    const createResult = parseAccessContext(unselectedCreatePayload);
    expect(createResult.breedingFarm).toBeNull();
    expect(createResult.onboarding.status).toBe("Pending");
    expect(createResult.onboarding.nextStep).toBe("CreateBreedingFarm");
    expect(createResult.access.canAccessApp).toBe(false);
    expect(createResult.access.requiredAction).toBe("None");
    expect(createResult.access.blockedReason).toBeNull();

    const unselectedSelectPayload = {
      ...unselectedCreatePayload,
      onboarding: {
        status: "Pending",
        nextStep: "SelectBreedingFarm"
      }
    };
    const selectResult = parseAccessContext(unselectedSelectPayload);
    expect(selectResult.onboarding.nextStep).toBe("SelectBreedingFarm");
  });

  it("resolves onboarding routes semantically", async () => {
    const { resolveOnboardingRoute } = await import("./access-context");
    expect(resolveOnboardingRoute("CreateBreedingFarm", false)).toBe("/onboarding/criatorio");
    expect(resolveOnboardingRoute("CreateBreedingFarm", true)).toBe("/onboarding/criatorio");
    expect(resolveOnboardingRoute("SelectBreedingFarm", false)).toBe("/onboarding/criatorio/selecionar");
    expect(resolveOnboardingRoute("SelectBreedingFarm", true)).toBe("/onboarding/criatorio/selecionar");
    expect(resolveOnboardingRoute(null, false)).toBe("/onboarding/criatorio");
    expect(resolveOnboardingRoute(null, true)).toBe("/onboarding/criatorio/selecionar");
  });

  it("fails closed on unknown enums and arbitrary nextStep URLs", () => {
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

    // Arbitrary URLs or unrecognized nextStep strings MUST fail-closed
    expect(() => parseAccessContext({
      ...validBasePayload,
      breedingFarm: null,
      onboarding: { status: "Pending", nextStep: "/onboarding/criatorio" },
      access: { status: "PendingSubscription", canAccessApp: false, blockedReason: null, requiredAction: "None", trialEndsAt: null, gracePeriodEndsAt: null },
      subscription: null
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      breedingFarm: null,
      onboarding: { status: "Pending", nextStep: "ArbitraryStep" },
      access: { status: "PendingSubscription", canAccessApp: false, blockedReason: null, requiredAction: "None", trialEndsAt: null, gracePeriodEndsAt: null },
      subscription: null
    })).toThrow(InvalidAccessContextError);
  });

  it("fails closed on onboarding status and nextStep inconsistencies", () => {
    // Completed onboarding cannot have a nextStep
    expect(() => parseAccessContext({
      ...validBasePayload,
      onboarding: { status: "Completed", nextStep: "CreateBreedingFarm" }
    })).toThrow(InvalidAccessContextError);

    // Pending onboarding must have a valid nextStep
    expect(() => parseAccessContext({
      ...validBasePayload,
      breedingFarm: null,
      onboarding: { status: "Pending", nextStep: null },
      access: { status: "PendingSubscription", canAccessApp: false, blockedReason: null, requiredAction: "None", trialEndsAt: null, gracePeriodEndsAt: null },
      subscription: null
    })).toThrow(InvalidAccessContextError);
  });

  it("fails closed on all inconsistent access combinations aligned with backend policy", () => {
    // 1. Trial combinations
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Trial", canAccessApp: false }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Trial", requiredAction: "Subscribe" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Trial", blockedReason: "SubscriptionRequired" }
    })).toThrow(InvalidAccessContextError);

    // 2. Active combinations
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Active", canAccessApp: false }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Active", requiredAction: "Regularize" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Active", blockedReason: "PaymentOverdue" }
    })).toThrow(InvalidAccessContextError);

    // 3. GracePeriod combinations
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "GracePeriod", canAccessApp: false }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "GracePeriod", requiredAction: "None" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "GracePeriod", blockedReason: "PaymentOverdue" }
    })).toThrow(InvalidAccessContextError);

    // 4. Blocked combinations
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", canAccessApp: true }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", requiredAction: "Subscribe" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", blockedReason: "SubscriptionRequired" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", blockedReason: null, requiredAction: "None" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", blockedReason: null }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Blocked", requiredAction: "None" }
    })).toThrow(InvalidAccessContextError);

    // 5. Cancelled combinations
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Cancelled", canAccessApp: true }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Cancelled", requiredAction: "None" }
    })).toThrow(InvalidAccessContextError);

    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "Cancelled", blockedReason: null }
    })).toThrow(InvalidAccessContextError);

    // 6. PendingSubscription combinations
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "PendingSubscription", canAccessApp: true }
    })).toThrow(InvalidAccessContextError);

    // PendingSubscription with farm but requiredAction None
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "PendingSubscription", canAccessApp: false, blockedReason: "SubscriptionRequired", requiredAction: "None" }
    })).toThrow(InvalidAccessContextError);

    // PendingSubscription with farm but blockedReason null
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "PendingSubscription", canAccessApp: false, blockedReason: null, requiredAction: "Subscribe" }
    })).toThrow(InvalidAccessContextError);

    // PendingSubscription with farm but both null and None
    expect(() => parseAccessContext({
      ...validBasePayload,
      access: { ...validBasePayload.access, status: "PendingSubscription", canAccessApp: false, blockedReason: null, requiredAction: "None" }
    })).toThrow(InvalidAccessContextError);

    // PendingSubscription without farm but requiredAction Subscribe
    expect(() => parseAccessContext({
      ...validBasePayload,
      breedingFarm: null,
      onboarding: { status: "Pending", nextStep: "CreateBreedingFarm" },
      access: { status: "PendingSubscription", canAccessApp: false, blockedReason: null, requiredAction: "Subscribe", trialEndsAt: null, gracePeriodEndsAt: null },
      subscription: null
    })).toThrow(InvalidAccessContextError);

    // 7. Functional statuses without breeding farm
    for (const status of ["Trial", "Active", "GracePeriod", "Blocked", "Cancelled"] as const) {
      expect(() => parseAccessContext({
        ...validBasePayload,
        breedingFarm: null,
        onboarding: { status: "Pending", nextStep: "CreateBreedingFarm" },
        access: {
          ...validBasePayload.access,
          status,
          canAccessApp: status === "Trial" || status === "Active" || status === "GracePeriod",
          requiredAction: status === "GracePeriod" || status === "Blocked" ? "Regularize" : status === "Cancelled" ? "Resubscribe" : "None",
          blockedReason: status === "Blocked" ? "PaymentOverdue" : status === "Cancelled" ? "SubscriptionCancelled" : null
        }
      })).toThrow(InvalidAccessContextError);
    }
  });

  it("fails closed on malformed or incomplete payloads", () => {
    expect(() => parseAccessContext(null)).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({})).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({ user: { id: "1" } })).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({ ...validBasePayload, user: null })).toThrow(InvalidAccessContextError);
    expect(() => parseAccessContext({ ...validBasePayload, access: { ...validBasePayload.access, canAccessApp: "yes" } })).toThrow(InvalidAccessContextError);
  });
});
