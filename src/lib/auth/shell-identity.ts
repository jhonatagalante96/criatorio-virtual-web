export interface ShellIdentity {
  email?: string;
  farmName?: string;
}

const shellIdentityStorageKey = "criatorio-shell-identity";
const placeholderFarmNames = new Set(["Criatório selecionado", "Criatório Virtual"]);
let lastKnownShellIdentity: ShellIdentity = {};
let hasLoadedStoredIdentity = false;

export function isKnownFarmName(value: string | undefined): value is string {
  const farmName = value?.trim();
  return Boolean(farmName && !placeholderFarmNames.has(farmName));
}

export function getLastKnownShellIdentity(): ShellIdentity {
  if (typeof window !== "undefined" && !hasLoadedStoredIdentity) {
    hasLoadedStoredIdentity = true;

    try {
      const storedIdentity = window.sessionStorage.getItem(shellIdentityStorageKey);
      if (storedIdentity) {
        const parsedIdentity: unknown = JSON.parse(storedIdentity);
        if (typeof parsedIdentity === "object" && parsedIdentity !== null) {
          const candidate = parsedIdentity as Record<string, unknown>;
          const email = typeof candidate.email === "string" ? candidate.email.trim() : undefined;
          const farmName = typeof candidate.farmName === "string" ? candidate.farmName.trim() : undefined;
          lastKnownShellIdentity = {
            email: email || undefined,
            farmName: isKnownFarmName(farmName) ? farmName : undefined
          };
        }
      }
    } catch {
      lastKnownShellIdentity = {};
    }
  }

  return lastKnownShellIdentity;
}

export function rememberShellIdentity(identity: ShellIdentity): void {
  if (typeof window === "undefined") return;

  const cachedIdentity = getLastKnownShellIdentity();
  const email = identity.email?.trim();
  const farmName = identity.farmName?.trim();
  lastKnownShellIdentity = {
    email: email || cachedIdentity.email,
    farmName: isKnownFarmName(farmName) ? farmName : cachedIdentity.farmName
  };

  try {
    window.sessionStorage.setItem(shellIdentityStorageKey, JSON.stringify(lastKnownShellIdentity));
  } catch {
    // The in-memory value still protects route transitions when storage is unavailable.
  }
}

export function clearShellIdentity(): void {
  lastKnownShellIdentity = {};
  hasLoadedStoredIdentity = false;

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(shellIdentityStorageKey);
  } catch {
    // There is no persistent value to clear when storage is unavailable.
  }
}
