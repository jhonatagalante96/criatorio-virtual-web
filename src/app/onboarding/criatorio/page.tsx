"use client";

import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, ValidationErrors, createApiClient } from "../../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../../components/brand";

interface AddressFields {
  city: string;
  complement: string;
  neighborhood: string;
  number: string;
  postalCode: string;
  state: string;
  street: string;
}

interface BreedingFarmFields extends AddressFields {
  contactEmail: string;
  contactPhone: string;
  name: string;
  officialRegistrationNumber: string;
  responsibleName: string;
}

interface CreateBreedingFarmResponse {
  breedingFarmId: string;
  ownerUserId: string;
}

const initialFields: BreedingFarmFields = {
  city: "",
  complement: "",
  contactEmail: "",
  contactPhone: "",
  name: "",
  neighborhood: "",
  number: "",
  officialRegistrationNumber: "",
  postalCode: "",
  responsibleName: "",
  state: "",
  street: ""
};

const addressKeys: Array<keyof AddressFields> = ["street", "number", "complement", "neighborhood", "city", "state", "postalCode"];

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function firstError(errors: ValidationErrors, field: string): string | undefined {
  const matchingKey = Object.keys(errors).find((key) => key.toLowerCase() === field.toLowerCase());
  return matchingKey ? errors[matchingKey]?.[0] : undefined;
}

function clearError(errors: ValidationErrors, field: string): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.toLowerCase() !== field.toLowerCase()));
}

function normalizeOptional(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

function validateFields(fields: BreedingFarmFields): ValidationErrors {
  const errors: ValidationErrors = {};
  const name = fields.name.trim();
  const responsibleName = fields.responsibleName.trim();
  const contactEmail = fields.contactEmail.trim();

  if (!name) errors.name = ["Informe o nome do criatório."];
  else if (name.length > 200) errors.name = ["O nome do criatório deve ter no máximo 200 caracteres."];

  if (!responsibleName) errors.responsibleName = ["Informe o nome do responsável."];
  else if (responsibleName.length > 200) errors.responsibleName = ["O nome do responsável deve ter no máximo 200 caracteres."];

  if (contactEmail && (!/^\S+@\S+\.\S+$/.test(contactEmail) || contactEmail.length > 320)) {
    errors.contactEmail = ["Informe um e-mail de contato válido."];
  }

  if (fields.contactPhone.trim().length > 32) errors.contactPhone = ["O telefone deve ter no máximo 32 caracteres."];
  if (fields.officialRegistrationNumber.trim().length > 100) {
    errors.officialRegistrationNumber = ["O registro oficial deve ter no máximo 100 caracteres."];
  }

  for (const [field, maxLength] of [["street", 200], ["number", 32], ["complement", 100], ["neighborhood", 120], ["city", 120], ["state", 100], ["postalCode", 20]] as const) {
    if (fields[field].trim().length > maxLength) {
      errors[`address.${field}`] = [`Este campo deve ter no máximo ${maxLength} caracteres.`];
    }
  }

  const state = fields.state.trim();
  if (state && !/^[A-Za-z]{2}$/.test(state)) errors["address.state"] = ["Informe a UF com duas letras."];

  const postalCode = fields.postalCode.trim();
  if (postalCode && !/^\d{8}$/.test(postalCode.replace(/[ -]/g, ""))) {
    errors["address.postalCode"] = ["Informe um CEP com oito números."];
  }

  return errors;
}

function OnboardingField({
  autoComplete,
  disabled = false,
  error,
  id,
  label,
  maxLength,
  name,
  onChange,
  optional,
  placeholder,
  type = "text",
  value
}: Readonly<{
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  maxLength?: number;
  name: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  optional?: boolean;
  placeholder: string;
  type?: "email" | "text";
  value: string;
}>) {
  const errorId = `${id}-error`;

  return (
    <div className="onboarding-field">
      <label htmlFor={id}>{label}{optional && <span> (opcional)</span>}</label>
      <input
        autoComplete={autoComplete}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        id={id}
        maxLength={maxLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  );
}

function OnboardingState({
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente"
}: Readonly<{ heading: string; message: string; onRetry?: () => void; retryLabel?: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="auth-page onboarding-page">
      <a className="skip-link" href="#conteudo-onboarding">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-onboarding-estado" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-onboarding">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-onboarding-estado" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <a className="text-action" href="/login">Voltar para o login</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function CreationSuccess() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="onboarding-success">
      <div aria-hidden="true" className="onboarding-success-icon">✓</div>
      <p className="eyebrow">Etapa concluída</p>
      <h1 id="titulo-onboarding" ref={headingRef} tabIndex={-1}>Seu criatório foi criado.</h1>
      <p className="lede">O vínculo de responsável foi configurado com segurança. Você já pode continuar para o Criatório Virtual.</p>
      <a className="auth-primary-action" href="/">Ir para o início</a>
      <a className="text-action" href="/login">Voltar para a conta</a>
    </div>
  );
}

function CreateBreedingFarmForm() {
  const { refresh } = useAuth();
  const [fields, setFields] = useState<BreedingFarmFields>(initialFields);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creation, setCreation] = useState<CreateBreedingFarmResponse | undefined>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  function updateField(field: keyof BreedingFarmFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearError(current, field));
    setFormError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateFields(fields);
    setErrors(validationErrors);
    setFormError(undefined);

    if (Object.keys(validationErrors).length > 0) return;

    const hasAddress = addressKeys.some((key) => fields[key].trim());
    const address = hasAddress
      ? Object.fromEntries(addressKeys.map((key) => [key, normalizeOptional(fields[key])]))
      : null;

    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      const response = await client.current!.request<CreateBreedingFarmResponse>("api/breeding-farms", {
        body: JSON.stringify({
          address,
          contactEmail: normalizeOptional(fields.contactEmail),
          contactPhone: normalizeOptional(fields.contactPhone),
          name: fields.name.trim(),
          officialRegistrationNumber: normalizeOptional(fields.officialRegistrationNumber),
          responsibleName: fields.responsibleName.trim()
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      setCreation(response);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);

        if (error.status === 401) {
          await refresh();
          return;
        }

        if (error.status === 403) {
          await refresh();
          return;
        }

        setFormError(error.status === 400
          ? "Confira os dados informados e tente novamente."
          : error.status === 409
            ? "O registro oficial informado já está em uso. Confira o número e tente novamente."
            : error.status >= 500
              ? "O serviço está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível criar o criatório agora. Tente novamente.");
      } else {
        setFormError("Não foi possível criar o criatório agora. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (creation) return <CreationSuccess />;

  const fieldError = (field: string) => firstError(errors, field);

  return (
    <>
      <a className="auth-mobile-back" href="/login" aria-label="Voltar para a conta"><BackIcon /></a>
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <p className="eyebrow">Primeiro passo</p>
      <h1 id="titulo-onboarding">Vamos criar seu criatório</h1>
      <p className="lede">Conte um pouco sobre o seu criatório para começar uma organização feita para a sua rotina.</p>

      <div aria-label="Etapa 1 de 1" className="onboarding-progress">
        <span aria-hidden="true">1</span>
        <span>Dados do criatório</span>
      </div>

      <form className="onboarding-form" noValidate onSubmit={handleSubmit}>
        {formError && <div className="form-error" role="alert">{formError}</div>}

        <fieldset className="onboarding-fieldset">
          <legend>Identificação</legend>
          <div className="onboarding-fields-grid">
            <OnboardingField
              autoComplete="organization"
              disabled={isSubmitting}
              error={fieldError("name")}
              id="name"
              label="Nome do criatório"
              maxLength={200}
              name="name"
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Ex.: Criatório Aurora"
              value={fields.name}
            />
            <OnboardingField
              autoComplete="name"
              disabled={isSubmitting}
              error={fieldError("responsibleName")}
              id="responsibleName"
              label="Nome do responsável"
              maxLength={200}
              name="responsibleName"
              onChange={(event) => updateField("responsibleName", event.target.value)}
              placeholder="Ex.: Ana Souza"
              value={fields.responsibleName}
            />
          </div>
        </fieldset>

        <fieldset className="onboarding-fieldset">
          <legend>Contato e registro</legend>
          <div className="onboarding-fields-grid">
            <OnboardingField
              autoComplete="email"
              disabled={isSubmitting}
              error={fieldError("contactEmail")}
              id="contactEmail"
              label="E-mail de contato"
              maxLength={320}
              name="contactEmail"
              onChange={(event) => updateField("contactEmail", event.target.value)}
              optional
              placeholder="voce@exemplo.com"
              type="email"
              value={fields.contactEmail}
            />
            <OnboardingField
              autoComplete="tel"
              disabled={isSubmitting}
              error={fieldError("contactPhone")}
              id="contactPhone"
              label="Telefone"
              maxLength={32}
              name="contactPhone"
              onChange={(event) => updateField("contactPhone", event.target.value)}
              optional
              placeholder="(11) 99999-0000"
              value={fields.contactPhone}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("officialRegistrationNumber")}
              id="officialRegistrationNumber"
              label="Registro oficial"
              maxLength={100}
              name="officialRegistrationNumber"
              onChange={(event) => updateField("officialRegistrationNumber", event.target.value)}
              optional
              placeholder="Ex.: REG-001"
              value={fields.officialRegistrationNumber}
            />
          </div>
        </fieldset>

        <details className="onboarding-address">
          <summary>Adicionar endereço <span>(opcional)</span></summary>
          <p className="onboarding-address-help">Você pode informar o endereço agora ou deixar esta etapa para depois.</p>
          <div className="onboarding-address-grid">
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.street")}
              id="address-street"
              label="Rua"
              maxLength={200}
              name="address.street"
              onChange={(event) => updateField("street", event.target.value)}
              placeholder="Nome da rua"
              value={fields.street}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.number")}
              id="address-number"
              label="Número"
              maxLength={32}
              name="address.number"
              onChange={(event) => updateField("number", event.target.value)}
              placeholder="Número"
              value={fields.number}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.complement")}
              id="address-complement"
              label="Complemento"
              maxLength={100}
              name="address.complement"
              onChange={(event) => updateField("complement", event.target.value)}
              optional
              placeholder="Sítio, sala…"
              value={fields.complement}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.neighborhood")}
              id="address-neighborhood"
              label="Bairro"
              maxLength={120}
              name="address.neighborhood"
              onChange={(event) => updateField("neighborhood", event.target.value)}
              placeholder="Bairro"
              value={fields.neighborhood}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.city")}
              id="address-city"
              label="Cidade"
              maxLength={120}
              name="address.city"
              onChange={(event) => updateField("city", event.target.value)}
              placeholder="Cidade"
              value={fields.city}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.state")}
              id="address-state"
              label="UF"
              maxLength={2}
              name="address.state"
              onChange={(event) => updateField("state", event.target.value)}
              placeholder="SP"
              value={fields.state}
            />
            <OnboardingField
              disabled={isSubmitting}
              error={fieldError("address.postalCode")}
              id="address-postalCode"
              label="CEP"
              maxLength={20}
              name="address.postalCode"
              onChange={(event) => updateField("postalCode", event.target.value)}
              placeholder="00000-000"
              value={fields.postalCode}
            />
          </div>
        </details>

        <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Criando criatório…" : "Criar criatório"}
        </button>
      </form>

      <p className="auth-footer">Você poderá complementar os dados depois.</p>
    </>
  );
}

function OnboardingScreen() {
  const { error, refresh, status } = useAuth();

  if (status === "loading") return <OnboardingState heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <OnboardingState heading="Não foi possível abrir o onboarding" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <OnboardingState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para criar um criatório."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated") return <OnboardingState heading="Entre para criar seu criatório" message="Faça login para iniciar o cadastro do seu criatório com segurança." />;

  return (
    <main className="auth-page onboarding-page">
      <a className="skip-link" href="#conteudo-onboarding">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell">
        <BrandPanel />
        <section aria-labelledby={"titulo-onboarding"} className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content" id="conteudo-onboarding">
            <CreateBreedingFarmForm />
          </div>
        </section>
      </div>
    </main>
  );
}

export default function BreedingFarmOnboardingPage() {
  return (
    <AuthProvider>
      <OnboardingScreen />
    </AuthProvider>
  );
}
