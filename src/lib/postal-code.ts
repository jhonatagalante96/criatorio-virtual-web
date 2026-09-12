export interface PostalCodeAddress {
  city: string;
  complement: string;
  neighborhood: string;
  state: string;
  street: string;
}

interface ViaCepResponse {
  bairro?: string;
  complemento?: string;
  localidade?: string;
  logradouro?: string;
  erro?: boolean;
  uf?: string;
}

export class PostalCodeFormatError extends Error {
  constructor() {
    super("O CEP precisa ter oito números.");
    this.name = "PostalCodeFormatError";
  }
}

export class PostalCodeNotFoundError extends Error {
  constructor() {
    super("CEP não encontrado.");
    this.name = "PostalCodeNotFoundError";
  }
}

export class PostalCodeServiceError extends Error {
  constructor() {
    super("Não foi possível consultar o CEP.");
    this.name = "PostalCodeServiceError";
  }
}

export function normalizePostalCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function formatPostalCode(value: string): string {
  const digits = normalizePostalCode(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export async function lookupPostalCode(value: string, signal?: AbortSignal): Promise<PostalCodeAddress> {
  const postalCode = normalizePostalCode(value);
  if (postalCode.length !== 8) throw new PostalCodeFormatError();

  let response: Response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PostalCodeServiceError();
  }

  if (!response.ok) throw new PostalCodeServiceError();

  let data: ViaCepResponse;
  try {
    data = await response.json() as ViaCepResponse;
  } catch {
    throw new PostalCodeServiceError();
  }

  if (data.erro) throw new PostalCodeNotFoundError();

  return {
    city: data.localidade ?? "",
    complement: data.complemento ?? "",
    neighborhood: data.bairro ?? "",
    state: data.uf ?? "",
    street: data.logradouro ?? ""
  };
}
