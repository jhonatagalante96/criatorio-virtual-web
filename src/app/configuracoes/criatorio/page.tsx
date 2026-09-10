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

interface BreedingFarmAddressResponse {
  city: string | null;
  complement: string | null;
  neighborhood: string | null;
  number: string | null;
  postalCode: string | null;
  state: string | null;
  street: string | null;
}

interface BreedingFarmSettingsResponse {
  address: BreedingFarmAddressResponse;
  breedingFarmId: string;
  contactEmail: string;
  contactPhone: string | null;
  name: string;
  officialRegistrationNumber: string | null;
  responsibleName: string;
  updatedAtUtc: string;
}

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

function hasAddress(fields: AddressFields): boolean {
  return addressKeys.some((key) => fields[key].trim());
}

function fieldsFromSettings(settings: BreedingFarmSettingsResponse): BreedingFarmFields {
  return {
    city: settings.address.city ?? "",
    complement: settings.address.complement ?? "",
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone ?? "",
    name: settings.name,
    neighborhood: settings.address.neighborhood ?? "",
    number: settings.address.number ?? "",
    officialRegistrationNumber: settings.officialRegistrationNumber ?? "",
    postalCode: settings.address.postalCode ?? "",
    responsibleName: settings.responsibleName,
    state: settings.address.state ?? "",
    street: settings.address.street ?? ""
  };
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

function localizeValidationErrors(errors: ValidationErrors): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).map(([field, messages]) => {
    const normalizedField = field.toLowerCase();
    let message = messages[0] ?? "Confira este campo e tente novamente.";

    if (normalizedField === "name") message = "Confira o nome do criatório.";
    if (normalizedField === "responsiblename") message = "Confira o nome do responsável.";
    if (normalizedField === "contactemail") message = "Informe um e-mail de contato válido.";
    if (normalizedField === "contactphone") message = "Confira o telefone informado.";
    if (normalizedField === "officialregistrationnumber") message = "Confira o registro oficial informado.";
    if (normalizedField === "address.state") message = "Informe a UF com duas letras.";
    if (normalizedField === "address.postalcode") message = "Informe um CEP com oito números.";

    return [field, [message]];
  }));
}

function requestBody(fields: BreedingFarmFields) {
  const address = hasAddress(fields)
    ? Object.fromEntries(addressKeys.map((key) => [key, normalizeOptional(fields[key])]))
    : null;

  return {
    address,
    contactEmail: normalizeOptional(fields.contactEmail),
    contactPhone: normalizeOptional(fields.contactPhone),
    name: fields.name.trim(),
    officialRegistrationNumber: normalizeOptional(fields.officialRegistrationNumber),
    responsibleName: fields.responsibleName.trim()
  };
}

function FarmSettingsField({
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

function FarmSettingsState({
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
    <main className="auth-page onboarding-page farm-edit-page">
      <a className="skip-link" href="#conteudo-edicao-criatorio">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell farm-edit-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-edicao-estado" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-edicao-criatorio">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-edicao-estado" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <a className="text-action" href="/configuracoes">Voltar para configurações</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function EditBreedingFarmForm({ farmId }: Readonly<{ farmId: string }>) {
  const { refresh } = useAuth();
  const [addressOpen, setAddressOpen] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [fields, setFields] = useState<BreedingFarmFields | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [loadState, setLoadState] = useState<"loading" | "not-found" | "ready" | "error">("loading");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    client.current?.setTenant(farmId);
    let cancelled = false;

    setLoadState("loading");
    setLoadError(undefined);
    setFormError(undefined);
    setErrors({});

    async function loadSettings() {
      try {
        const response = await client.current!.request<BreedingFarmSettingsResponse>(`api/breeding-farms/${encodeURIComponent(farmId)}/settings`);
        if (cancelled) return;

        const nextFields = fieldsFromSettings(response);
        setFields(nextFields);
        setAddressOpen(hasAddress(nextFields));
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await refresh();
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState("not-found");
          return;
        }

        setLoadError(error instanceof ApiError && error.status >= 500
          ? "O serviço está indisponível no momento. Tente novamente em instantes."
          : "Não foi possível carregar os dados do criatório. Verifique sua conexão e tente novamente.");
        setLoadState("error");
      }
    }

    void loadSettings();
    return () => { cancelled = true; };
  }, [farmId, refresh, reloadNonce]);

  function updateField(field: keyof BreedingFarmFields, value: string) {
    setFields((current) => current ? { ...current, [field]: value } : current);
    setErrors((current) => clearError(current, field));
    setFormError(undefined);
    setSuccessMessage(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields) return;

    const validationErrors = validateFields(fields);
    setErrors(validationErrors);
    setFormError(undefined);
    setSuccessMessage(undefined);
    if (Object.keys(validationErrors).length > 0) {
      if (Object.keys(validationErrors).some((field) => field.toLowerCase().startsWith("address."))) setAddressOpen(true);
      return;
    }

    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      const response = await client.current!.request<BreedingFarmSettingsResponse>(`api/breeding-farms/${encodeURIComponent(farmId)}/settings`, {
        body: JSON.stringify(requestBody(fields)),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      const nextFields = fieldsFromSettings(response);
      setFields(nextFields);
      setAddressOpen(hasAddress(nextFields));
      setErrors({});
      setFormError(undefined);
      setSuccessMessage("Dados do criatório atualizados com sucesso.");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(localizeValidationErrors(error.fields));

        if (error.status === 401 || error.status === 403) {
          await refresh();
          return;
        }

        if (error.status === 404) {
          setLoadState("not-found");
          return;
        }

        setFormError(error.status === 400
          ? "Confira os dados informados e tente novamente."
          : error.status === 409
            ? "O registro oficial informado já está em uso. Confira o número e tente novamente."
            : error.status >= 500
              ? "O serviço está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível atualizar o criatório agora. Tente novamente.");
      } else {
        setFormError("Não foi possível atualizar o criatório agora. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadState === "loading") return <FarmSettingsState heading="Carregando dados do criatório" message="Só um instante enquanto buscamos as informações para edição." />;
  if (loadState === "not-found") return <FarmSettingsState heading="Criatório não encontrado" message="Não foi possível localizar este criatório ou você não tem permissão para editá-lo." />;
  if (loadState === "error") return <FarmSettingsState heading="Não foi possível carregar o criatório" message={loadError ?? "Tente novamente para continuar."} onRetry={() => setReloadNonce((current) => current + 1)} />;
  if (!fields) return null;

  const fieldError = (field: string) => firstError(errors, field);

  return (
    <main className="auth-page onboarding-page farm-edit-page">
      <a className="skip-link" href="#conteudo-edicao-criatorio">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell farm-edit-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-edicao-criatorio" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content" id="conteudo-edicao-criatorio">
            <a className="auth-mobile-back" href="/configuracoes" aria-label="Voltar para configurações"><BackIcon /></a>
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <p className="eyebrow">Configurações do criatório</p>
            <h1 id="titulo-edicao-criatorio">Editar criatório</h1>
            <p className="lede">Mantenha os dados do criatório e do responsável atualizados para sua rotina.</p>

            <div aria-label="Etapa 1 de 1" className="onboarding-progress">
              <span aria-hidden="true">1</span>
              <span>Dados do criatório</span>
            </div>

            <form className="onboarding-form farm-settings-form" noValidate onSubmit={handleSubmit}>
              {formError && <div className="form-error" role="alert">{formError}</div>}
              {successMessage && <p className="confirmation-feedback" role="status">{successMessage}</p>}

              <fieldset className="onboarding-fieldset">
                <legend>Identificação</legend>
                <div className="onboarding-fields-grid">
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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

              <details className="onboarding-address" onToggle={(event) => setAddressOpen(event.currentTarget.open)} open={addressOpen}>
                <summary>Editar endereço <span>(opcional)</span></summary>
                <p className="onboarding-address-help">Atualize o endereço quando quiser. Os campos podem ficar em branco.</p>
                <div className="onboarding-address-grid">
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                  <FarmSettingsField
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
                {isSubmitting ? "Salvando alterações…" : "Salvar alterações"}
              </button>
            </form>

            <p className="auth-footer">A edição está disponível somente para o responsável autorizado.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function BreedingFarmEditScreen() {
  const { error, refresh, status } = useAuth();
  const [farmId, setFarmId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const queryFarmId = new URLSearchParams(window.location.search).get("breedingFarmId");
    setFarmId(queryFarmId?.trim() || null);
  }, []);

  if (status === "loading") return <FarmSettingsState heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <FarmSettingsState heading="Não foi possível abrir a edição" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <FarmSettingsState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para editar este criatório."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated") return <FarmSettingsState heading="Entre para editar seu criatório" message="Faça login para atualizar os dados do seu criatório com segurança." />;
  if (farmId === undefined) return <FarmSettingsState heading="Identificando o criatório" message="Só um instante enquanto preparamos a edição." />;
  if (!farmId) return <FarmSettingsState heading="Selecione um criatório" message="Esta edição precisa ser aberta a partir de um criatório selecionado." />;

  return <EditBreedingFarmForm farmId={farmId} />;
}

export default function BreedingFarmEditPage() {
  return (
    <AuthProvider>
      <BreedingFarmEditScreen />
    </AuthProvider>
  );
}
