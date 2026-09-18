export type SubscriptionStatus =
  | "Active"
  | "Blocked"
  | "Cancelled"
  | "GracePeriod"
  | "PendingSubscription"
  | "Trial";

export type AccessRequiredAction =
  | "None"
  | "Regularize"
  | "Resubscribe"
  | "Subscribe";

export type AccessBlockedReason =
  | "PaymentOverdue"
  | "SubscriptionCancelled"
  | "SubscriptionRequired";

export type OnboardingStatus = "Completed" | "Pending";

export interface UserProfileSummary {
  avatarUrl: string | null;
  email: string;
  id: string;
  name: string;
}

export interface BreedingFarmAccessSummary {
  id: string;
  name: string;
  role: string;
}
export type OnboardingNextStep = "CreateBreedingFarm" | "SelectBreedingFarm" | null;

export interface OnboardingSummary {
  nextStep: OnboardingNextStep;
  status: OnboardingStatus;
}

export interface AccessDetails {
  blockedReason: AccessBlockedReason | null;
  canAccessApp: boolean;
  gracePeriodEndsAt: string | null;
  requiredAction: AccessRequiredAction;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
}

export interface SubscriptionSummary {
  cycle: string;
  plan: string;
  status: string;
}

export interface AccessContextResult {
  access: AccessDetails;
  breedingFarm: BreedingFarmAccessSummary | null;
  onboarding: OnboardingSummary;
  subscription: SubscriptionSummary | null;
  user: UserProfileSummary;
}

export class InvalidAccessContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAccessContextError";
  }
}

const validSubscriptionStatuses = new Set<SubscriptionStatus>([
  "Active",
  "Blocked",
  "Cancelled",
  "GracePeriod",
  "PendingSubscription",
  "Trial"
]);

const validRequiredActions = new Set<AccessRequiredAction>([
  "None",
  "Regularize",
  "Resubscribe",
  "Subscribe"
]);

const validBlockedReasons = new Set<AccessBlockedReason>([
  "PaymentOverdue",
  "SubscriptionCancelled",
  "SubscriptionRequired"
]);

const validOnboardingStatuses = new Set<OnboardingStatus>([
  "Completed",
  "Pending"
]);

const validOnboardingNextSteps = new Set<string>([
  "CreateBreedingFarm",
  "SelectBreedingFarm"
]);

export function resolveOnboardingRoute(nextStep: OnboardingNextStep, hasBreedingFarm: boolean): string {
  if (nextStep === "SelectBreedingFarm") return "/onboarding/criatorio/selecionar";
  if (nextStep === "CreateBreedingFarm") return "/onboarding/criatorio";
  return hasBreedingFarm ? "/onboarding/criatorio/selecionar" : "/onboarding/criatorio";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidAccessContextError(`Campo obrigatório ausente ou inválido: ${fieldName}`);
  }
  return value.trim();
}

function parseNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  return null;
}

export function parseAccessContext(payload: unknown): AccessContextResult {
  if (!isRecord(payload)) {
    throw new InvalidAccessContextError("O contexto de acesso recebido não é um objeto válido.");
  }

  // 1. User
  if (!isRecord(payload.user)) {
    throw new InvalidAccessContextError("O perfil do usuário é obrigatório no contexto de acesso.");
  }
  const user: UserProfileSummary = {
    avatarUrl: parseNullableString(payload.user.avatarUrl),
    email: parseString(payload.user.email, "user.email"),
    id: parseString(payload.user.id, "user.id"),
    name: parseString(payload.user.name, "user.name")
  };

  // 2. Breeding Farm
  let breedingFarm: BreedingFarmAccessSummary | null = null;
  if (payload.breedingFarm !== null && payload.breedingFarm !== undefined) {
    if (!isRecord(payload.breedingFarm)) {
      throw new InvalidAccessContextError("Os dados do criatório são inválidos no contexto de acesso.");
    }
    breedingFarm = {
      id: parseString(payload.breedingFarm.id, "breedingFarm.id"),
      name: parseString(payload.breedingFarm.name, "breedingFarm.name"),
      role: parseString(payload.breedingFarm.role, "breedingFarm.role")
    };
  }

  // 3. Onboarding
  if (!isRecord(payload.onboarding)) {
    throw new InvalidAccessContextError("Os dados de onboarding são obrigatórios no contexto de acesso.");
  }
  const onboardingStatus = payload.onboarding.status as OnboardingStatus;
  if (!validOnboardingStatuses.has(onboardingStatus)) {
    throw new InvalidAccessContextError(`Status de onboarding desconhecido: ${String(payload.onboarding.status)}`);
  }

  let nextStep: OnboardingNextStep = null;
  if (payload.onboarding.nextStep !== null && payload.onboarding.nextStep !== undefined) {
    const rawStep = String(payload.onboarding.nextStep).trim();
    if (!validOnboardingNextSteps.has(rawStep)) {
      throw new InvalidAccessContextError(`Passo de onboarding desconhecido ou rota arbitrária não permitida: ${rawStep}`);
    }
    nextStep = rawStep as "CreateBreedingFarm" | "SelectBreedingFarm";
  }

  if (onboardingStatus === "Completed" && nextStep !== null) {
    throw new InvalidAccessContextError("Combinação inconsistente: onboarding Completed deve possuir nextStep nulo.");
  }
  if (onboardingStatus === "Pending" && nextStep === null) {
    throw new InvalidAccessContextError("Combinação inconsistente: onboarding Pending deve possuir nextStep definido.");
  }

  const onboarding: OnboardingSummary = {
    nextStep,
    status: onboardingStatus
  };

  // 4. Access
  if (!isRecord(payload.access)) {
    throw new InvalidAccessContextError("Os detalhes de acesso são obrigatórios no contexto de acesso.");
  }
  const accessStatus = payload.access.status as SubscriptionStatus;
  if (!validSubscriptionStatuses.has(accessStatus)) {
    throw new InvalidAccessContextError(`Status de assinatura desconhecido: ${String(payload.access.status)}`);
  }
  if (typeof payload.access.canAccessApp !== "boolean") {
    throw new InvalidAccessContextError("O campo canAccessApp deve ser booleano.");
  }
  const canAccessApp = payload.access.canAccessApp;

  const requiredAction = payload.access.requiredAction as AccessRequiredAction;
  if (!validRequiredActions.has(requiredAction)) {
    throw new InvalidAccessContextError(`Ação requerida desconhecida: ${String(payload.access.requiredAction)}`);
  }

  let blockedReason: AccessBlockedReason | null = null;
  if (payload.access.blockedReason !== null && payload.access.blockedReason !== undefined) {
    const candidateReason = payload.access.blockedReason as AccessBlockedReason;
    if (!validBlockedReasons.has(candidateReason)) {
      throw new InvalidAccessContextError(`Motivo de bloqueio desconhecido: ${String(payload.access.blockedReason)}`);
    }
    blockedReason = candidateReason;
  }

  // Complete Backend Consistency Enforcement (Fail-Closed)
  switch (accessStatus) {
    case "Trial":
      if (!canAccessApp || blockedReason !== null || requiredAction !== "None" || breedingFarm === null) {
        throw new InvalidAccessContextError("Combinação inconsistente para status Trial.");
      }
      break;
    case "Active":
      if (!canAccessApp || blockedReason !== null || requiredAction !== "None" || breedingFarm === null) {
        throw new InvalidAccessContextError("Combinação inconsistente para status Active.");
      }
      break;
    case "GracePeriod":
      if (!canAccessApp || blockedReason !== null || requiredAction !== "Regularize" || breedingFarm === null) {
        throw new InvalidAccessContextError("Combinação inconsistente para status GracePeriod.");
      }
      break;
    case "Blocked":
      if (canAccessApp || blockedReason !== "PaymentOverdue" || requiredAction !== "Regularize" || breedingFarm === null) {
        throw new InvalidAccessContextError("Combinação inconsistente para status Blocked.");
      }
      break;
    case "Cancelled":
      if (canAccessApp || blockedReason !== "SubscriptionCancelled" || requiredAction !== "Resubscribe" || breedingFarm === null) {
        throw new InvalidAccessContextError("Combinação inconsistente para status Cancelled.");
      }
      break;
    case "PendingSubscription":
      if (canAccessApp) {
        throw new InvalidAccessContextError("Combinação inconsistente: PendingSubscription não pode ter canAccessApp=true.");
      }
      if (breedingFarm !== null) {
        if (blockedReason !== "SubscriptionRequired" || requiredAction !== "Subscribe") {
          throw new InvalidAccessContextError("Combinação inconsistente para PendingSubscription com criatório selecionado.");
        }
      } else {
        if (blockedReason !== null || requiredAction !== "None") {
          throw new InvalidAccessContextError("Combinação inconsistente para PendingSubscription sem criatório selecionado.");
        }
      }
      break;
    default:
      throw new InvalidAccessContextError(`Status de assinatura não suportado: ${accessStatus}`);
  }

  const access: AccessDetails = {
    blockedReason,
    canAccessApp,
    gracePeriodEndsAt: parseNullableString(payload.access.gracePeriodEndsAt),
    requiredAction,
    status: accessStatus,
    trialEndsAt: parseNullableString(payload.access.trialEndsAt)
  };

  // 5. Subscription Summary (optional)
  let subscription: SubscriptionSummary | null = null;
  if (payload.subscription !== null && payload.subscription !== undefined) {
    if (!isRecord(payload.subscription)) {
      throw new InvalidAccessContextError("O resumo da assinatura é inválido no contexto de acesso.");
    }
    subscription = {
      cycle: parseString(payload.subscription.cycle, "subscription.cycle"),
      plan: parseString(payload.subscription.plan, "subscription.plan"),
      status: parseString(payload.subscription.status, "subscription.status")
    };
  }

  return {
    access,
    breedingFarm,
    onboarding,
    subscription,
    user
  };
}
