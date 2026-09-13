export const passwordMinimumLength = 8;
export const passwordPolicyMessage = "Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.";

export function validatePassword(password: string): string | undefined {
  if (!password) return "Informe uma senha nova.";

  if (
    password.length < passwordMinimumLength ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return passwordPolicyMessage;
  }

  return undefined;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | undefined {
  if (!confirmation) return "Confirme sua senha nova.";
  if (password !== confirmation) return "As senhas não coincidem.";
  return undefined;
}
