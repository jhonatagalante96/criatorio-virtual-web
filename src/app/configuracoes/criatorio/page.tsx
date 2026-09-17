"use client";

import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, ValidationErrors, createApiClient } from "../../../lib/http/api-client";
import { formatPostalCode, normalizePostalCode } from "../../../lib/postal-code";
import { AppLoadingState } from "../../components/app-loading-state";
import { AuthenticatedShell } from "../../components/authenticated-shell";
import { DashboardIcon } from "../../components/dashboard-icons";
import { postalCodeLookupMessage, usePostalCodeLookup } from "../../components/use-postal-code-lookup";
import { BreedingFarmCoverManager } from "./breeding-farm-cover-manager";
import { VisualIdentityManager } from "./visual-identity-manager";

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

interface BreedingFarmSelectionResponse {
  breedingFarms: Array<{ breedingFarmId: string; isSelected: boolean; name: string; responsibleName: string }>;
  selectedBreedingFarmId: string | null;
}

type FarmLoadState = "blocked" | "error" | "loading" | "ready";

const addressKeys: Array<keyof AddressFields> = ["street", "number", "complement", "neighborhood", "city", "state", "postalCode"];

function firstError(errors: ValidationErrors, field: string): string | undefined {
  const matchingKey = Object.keys(errors).find((key) => key.toLowerCase() === field.toLowerCase());
  return matchingKey ? errors[matchingKey]?.[0] : undefined;
}

function clearError(errors: ValidationErrors, field: string): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.toLowerCase() !== field.toLowerCase()));
}

function clearAddressErrors(errors: ValidationErrors): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !key.toLowerCase().startsWith("address.")));
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
    postalCode: formatPostalCode(settings.address.postalCode ?? ""),
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
  if (contactEmail && (!/^\S+@\S+\.\S+$/.test(contactEmail) || contactEmail.length > 320)) errors.contactEmail = ["Informe um e-mail de contato válido."];
  if (fields.contactPhone.trim().length > 32) errors.contactPhone = ["O telefone deve ter no máximo 32 caracteres."];
  if (fields.officialRegistrationNumber.trim().length > 100) errors.officialRegistrationNumber = ["O registro oficial deve ter no máximo 100 caracteres."];

  for (const [field, maxLength] of [["street", 200], ["number", 32], ["complement", 100], ["neighborhood", 120], ["city", 120], ["state", 100], ["postalCode", 20]] as const) {
    if (fields[field].trim().length > maxLength) errors[`address.${field}`] = [`Este campo deve ter no máximo ${maxLength} caracteres.`];
  }
  if (fields.state.trim() && !/^[A-Za-z]{2}$/.test(fields.state.trim())) errors["address.state"] = ["Informe a UF com duas letras."];
  if (fields.postalCode.trim() && !/^\d{8}$/.test(fields.postalCode.trim().replace(/[ -]/g, ""))) errors["address.postalCode"] = ["Informe um CEP com oito números."];
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
  const address = hasAddress(fields) ? Object.fromEntries(addressKeys.map((key) => [key, normalizeOptional(fields[key])])) : null;
  return {
    address,
    contactEmail: normalizeOptional(fields.contactEmail),
    contactPhone: normalizeOptional(fields.contactPhone),
    name: fields.name.trim(),
    officialRegistrationNumber: normalizeOptional(fields.officialRegistrationNumber),
    responsibleName: fields.responsibleName.trim()
  };
}

function formatValue(value: string | null | undefined): string {
  return value?.trim() || "Não informado";
}

function formatAddress(settings: BreedingFarmSettingsResponse): string {
  const { address } = settings;
  const street = [address.street, address.number].filter(Boolean).join(", ");
  const locality = [address.neighborhood, address.city, address.state].filter(Boolean).join(" · ");
  return [street, locality, address.postalCode].filter(Boolean).join(" | ") || "Endereço ainda não informado";
}

function FarmSettingsField({ autoComplete, disabled = false, error, id, label, maxLength, name, onChange, optional, placeholder, type = "text", value }: Readonly<{
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
    <div className="farm-edit-field">
      <label htmlFor={id}>{label}{optional && <span> (opcional)</span>}</label>
      <input autoComplete={autoComplete} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} disabled={disabled} id={id} maxLength={maxLength} name={name} onChange={onChange} placeholder={placeholder} type={type} value={value} />
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  );
}

function FarmState({ email, farmName = "Criatório selecionado", heading, message, onRetry }: Readonly<{ email?: string; farmName?: string; heading: string; message: string; onRetry?: () => void }>) {
  if (!email) {
    return <main className="auth-page farm-state-page"><div className="farm-state-card"><h1>{heading}</h1><p>{message}</p>{onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}<Link className="text-action" href="/login">Ir para o login</Link></div></main>;
  }

  return <AuthenticatedShell activeNav="farm" email={email} farmName={farmName}><div className="farm-state-card farm-state-card-authenticated"><p className="eyebrow">Meu Criatório</p><h1>{heading}</h1><p>{message}</p>{onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">Tentar novamente</button>}</div></AuthenticatedShell>;
}

function FarmBreadcrumb({ current, farmName }: Readonly<{ current: string; farmName?: string }>) {
  return <nav aria-label="Navegação estrutural" className="farm-breadcrumb"><Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span>{farmName && <><Link href="/configuracoes/criatorio">Meu Criatório</Link><span aria-hidden="true">›</span></>}<span aria-current="page">{current}</span></nav>;
}

function DetailList({ items }: Readonly<{ items: Array<[string, string]> }>) {
  return <dl className="farm-detail-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function FarmOverview({ email, settings }: Readonly<{ email: string; settings: BreedingFarmSettingsResponse }>) {
  const openIdentityActionRef = useRef<() => void>(() => {});

  return (
    <AuthenticatedShell activeNav="farm" email={email} farmName={settings.name}>
      <div className="farm-view">
        <FarmBreadcrumb current="Meu Criatório" />
        <header className="farm-page-header"><div><h1>Meu Criatório</h1><p>Visualize e gerencie as informações do seu criatório.</p></div></header>

        <section aria-labelledby="titulo-perfil-criatorio" className="farm-profile">
          <BreedingFarmCoverManager breedingFarmId={settings.breedingFarmId} farmName={settings.name} />
          <div className="farm-profile-body">
            <div className="farm-profile-identity"><VisualIdentityManager actionRef={openIdentityActionRef} breedingFarmId={settings.breedingFarmId} farmName={settings.name} /><div><div className="farm-profile-name-row"><h2 id="titulo-perfil-criatorio">{settings.name}</h2></div><p>Criatório Virtual</p><span className="farm-active-badge"><span aria-hidden="true" /> Ativo</span></div></div>
            <div className="farm-profile-actions"><Link className="farm-outline-action" href={`/configuracoes/criatorio?breedingFarmId=${encodeURIComponent(settings.breedingFarmId)}`}><DashboardIcon name="edit" /> Editar criatório</Link><details className="farm-more-actions"><summary aria-label="Mais ações" className="farm-more-action">⋮</summary><div className="farm-profile-action-menu"><button onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); openIdentityActionRef.current(); }} type="button">Alterar identidade visual</button></div></details></div>
          </div>
          <nav aria-label="Seções do criatório" className="farm-tabs"><a aria-current="page" href="#informacoes">Informações</a><Link href="/configuracoes/criatorio/galeria">Galeria</Link></nav>
        </section>

        <div className="farm-overview-grid" id="informacoes">
          <section aria-labelledby="titulo-dados-basicos" className="farm-info-card"><div className="farm-card-heading"><h2 id="titulo-dados-basicos">Dados básicos</h2></div><DetailList items={[["Nome", settings.name], ["Responsável", settings.responsibleName], ["Tipo de criatório", "Comercial"], ["Registro oficial", formatValue(settings.officialRegistrationNumber)]]} /></section>
          <section aria-labelledby="titulo-endereco" className="farm-info-card"><div className="farm-card-heading"><h2 id="titulo-endereco">Endereço</h2></div><DetailList items={[["Endereço", formatAddress(settings)], ["CEP", formatValue(settings.address.postalCode)], ["Cidade", formatValue(settings.address.city)], ["Estado", formatValue(settings.address.state)]]} /></section>
          <section aria-labelledby="titulo-contato" className="farm-info-card"><div className="farm-card-heading"><h2 id="titulo-contato">Contato</h2></div><DetailList items={[["Nome do responsável", settings.responsibleName], ["Telefone", formatValue(settings.contactPhone)], ["E-mail", formatValue(settings.contactEmail)], ["Site e redes sociais", "Não informados"]]} /></section>
        </div>
        <p className="farm-page-footer">As informações exibidas pertencem somente ao criatório selecionado.</p>
      </div>
    </AuthenticatedShell>
  );
}

function EditBreedingFarmForm({ email, farmId }: Readonly<{ email: string; farmId: string }>) {
  const { refresh } = useAuth();
  const router = useRouter();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [fields, setFields] = useState<BreedingFarmFields>();
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "not-found" | "ready" | "error">("loading");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [postalCodeLookupKnownValue, setPostalCodeLookupKnownValue] = useState<string>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const postalCodeLookup = usePostalCodeLookup(fields?.postalCode ?? "", Boolean(fields), postalCodeLookupKnownValue);
  const normalizedPostalCode = normalizePostalCode(fields?.postalCode ?? "");
  const normalizedKnownPostalCode = normalizePostalCode(postalCodeLookupKnownValue ?? "");
  const postalCodeLookupReady = postalCodeLookup.state === "ready" || (normalizedPostalCode.length === 8 && normalizedPostalCode === normalizedKnownPostalCode);
  const addressFieldsEnabled = postalCodeLookupReady;

  useEffect(() => {
    if (!postalCodeLookup.address) return;
    setFields((current) => current ? { ...current, ...postalCodeLookup.address } : current);
    setErrors((current) => clearAddressErrors(current));
  }, [postalCodeLookup.address]);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    client.current?.setTenant(farmId);
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    setLoadState("loading"); setLoadError(undefined); setFormError(undefined); setErrors({});
    setPostalCodeLookupKnownValue(undefined);

    async function loadSettings() {
      try {
        const response = await client.current!.request<BreedingFarmSettingsResponse>(`api/breeding-farms/${encodeURIComponent(farmId)}/settings`, { signal: controller.signal });
        if (cancelled) return;
        const nextFields = fieldsFromSettings(response);
        setPostalCodeLookupKnownValue(nextFields.postalCode);
        setFields(nextFields); setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { await refresh(); return; }
        if (error instanceof ApiError && error.status === 404) { setLoadState("not-found"); return; }
        setLoadError(error instanceof ApiError && error.status >= 500 ? "O serviço está indisponível no momento. Tente novamente em instantes." : "Não foi possível carregar os dados do criatório. Verifique sua conexão e tente novamente.");
        setLoadState("error");
      }
    }
    void loadSettings();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeoutId); };
  }, [farmId, refresh, reloadNonce]);

  function updateField(field: keyof BreedingFarmFields, value: string) {
    setFields((current) => current ? { ...current, [field]: value } : current);
    setErrors((current) => clearError(current, field)); setFormError(undefined); setSuccessMessage(undefined);
  }

  function updatePostalCode(value: string) {
    setPostalCodeLookupKnownValue(undefined);
    setFields((current) => current ? {
      ...current,
      city: "",
      complement: "",
      neighborhood: "",
      number: "",
      postalCode: formatPostalCode(value),
      state: "",
      street: ""
    } : current);
    setErrors((current) => clearAddressErrors(current)); setFormError(undefined); setSuccessMessage(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields) return;
    const validationErrors = validateFields(fields);
    const normalizedPostalCode = normalizePostalCode(fields.postalCode);
    if (normalizedPostalCode.length === 8 && !postalCodeLookupReady) {
      validationErrors["address.postalCode"] = [postalCodeLookup.state === "loading"
        ? "Aguarde a consulta do CEP terminar."
        : "Consulte um CEP válido para preencher o endereço."];
    }
    setErrors(validationErrors); setFormError(undefined); setSuccessMessage(undefined);
    if (Object.keys(validationErrors).length > 0) return;
    setIsSubmitting(true);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<BreedingFarmSettingsResponse>(`api/breeding-farms/${encodeURIComponent(farmId)}/settings`, { body: JSON.stringify(requestBody(fields)), headers: { "content-type": "application/json" }, method: "PUT" });
      const nextFields = fieldsFromSettings(response);
      setPostalCodeLookupKnownValue(nextFields.postalCode);
      setFields(nextFields); setErrors({}); setFormError(undefined); setSuccessMessage("Dados do criatório atualizados com sucesso.");
      router.replace("/configuracoes/criatorio");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(localizeValidationErrors(error.fields));
        if (error.status === 401 || error.status === 403) { await refresh(); return; }
        if (error.status === 404) { setLoadState("not-found"); return; }
        setFormError(error.status === 400 ? "Confira os dados informados e tente novamente." : error.status === 409 ? "O registro oficial informado já está em uso. Confira o número e tente novamente." : error.status >= 500 ? "O serviço está indisponível no momento. Tente novamente em instantes." : "Não foi possível atualizar o criatório agora. Tente novamente.");
      } else setFormError("Não foi possível atualizar o criatório agora. Verifique sua conexão e tente novamente.");
    } finally { setIsSubmitting(false); }
  }

  if (loadState === "loading") return <AppLoadingState activeNav="farm" email={email} label="Carregando edição" message="Só um instante enquanto buscamos as informações do criatório." />;
  if (loadState === "not-found") return <FarmState email={email} heading="Criatório não encontrado" message="Não foi possível localizar este criatório ou você não tem permissão para editá-lo." />;
  if (loadState === "error") return <FarmState email={email} heading="Não foi possível carregar o criatório" message={loadError ?? "Tente novamente para continuar."} onRetry={() => setReloadNonce((current) => current + 1)} />;
  if (!fields) return null;
  const fieldError = (field: string) => firstError(errors, field);

  return (
    <AuthenticatedShell activeNav="farm" email={email} farmName={fields.name}>
      <div className="farm-view farm-edit-view">
        <FarmBreadcrumb current="Editar criatório" farmName={fields.name} />
        <header className="farm-page-header"><div><p className="eyebrow">Meu Criatório · {fields.name}</p><h1>Editar criatório</h1><p>Atualize as informações do seu criatório.</p></div></header>
        <form className="farm-edit-form" noValidate onSubmit={handleSubmit}>
          {formError && <div className="form-error" role="alert">{formError}</div>}{successMessage && <p className="confirmation-feedback" role="status">{successMessage}</p>}
          <div className="farm-edit-grid">
            <fieldset className="farm-edit-card"><legend>Dados básicos</legend><FarmSettingsField autoComplete="organization" disabled={isSubmitting} error={fieldError("name")} id="name" label="Nome do criatório" maxLength={200} name="name" onChange={(event) => updateField("name", event.target.value)} placeholder="Nome do criatório" value={fields.name} /><FarmSettingsField disabled={isSubmitting} error={fieldError("officialRegistrationNumber")} id="officialRegistrationNumber" label="Registro oficial" maxLength={100} name="officialRegistrationNumber" onChange={(event) => updateField("officialRegistrationNumber", event.target.value)} optional placeholder="Número do registro" value={fields.officialRegistrationNumber} /><p className="farm-edit-help">O registro oficial é opcional e pode ser informado quando estiver disponível.</p></fieldset>
            <fieldset className="farm-edit-card"><legend>Endereço</legend><FarmSettingsField disabled={isSubmitting} error={fieldError("address.postalCode")} id="address-postalCode" label="CEP" maxLength={9} name="address.postalCode" onChange={(event) => updatePostalCode(event.target.value)} placeholder="00000-000" value={fields.postalCode} /><p className={`postal-code-feedback postal-code-feedback-${postalCodeLookup.state}`} role={postalCodeLookup.state === "error" || postalCodeLookup.state === "not-found" ? "alert" : "status"}>{postalCodeLookupMessage(postalCodeLookup.state)}</p><div aria-disabled={!addressFieldsEnabled} className="postal-code-gated-fields"><FarmSettingsField disabled={isSubmitting || !addressFieldsEnabled} error={fieldError("address.state")} id="address-state" label="UF" maxLength={2} name="address.state" onChange={(event) => updateField("state", event.target.value)} placeholder="SP" value={fields.state} /><FarmSettingsField disabled={isSubmitting || !addressFieldsEnabled} error={fieldError("address.street")} id="address-street" label="Endereço" maxLength={200} name="address.street" onChange={(event) => updateField("street", event.target.value)} placeholder="Rua ou avenida" value={fields.street} /><div className="farm-edit-fields-two"><FarmSettingsField disabled={isSubmitting || !addressFieldsEnabled} error={fieldError("address.number")} id="address-number" label="Número" maxLength={32} name="address.number" onChange={(event) => updateField("number", event.target.value)} placeholder="Número" value={fields.number} /><FarmSettingsField disabled={isSubmitting || !addressFieldsEnabled} error={fieldError("address.complement")} id="address-complement" label="Complemento" maxLength={100} name="address.complement" onChange={(event) => updateField("complement", event.target.value)} optional placeholder="Opcional" value={fields.complement} /></div><div className="farm-edit-fields-two"><FarmSettingsField disabled={isSubmitting || !addressFieldsEnabled} error={fieldError("address.neighborhood")} id="address-neighborhood" label="Bairro" maxLength={120} name="address.neighborhood" onChange={(event) => updateField("neighborhood", event.target.value)} placeholder="Bairro" value={fields.neighborhood} /><FarmSettingsField disabled={isSubmitting || !addressFieldsEnabled} error={fieldError("address.city")} id="address-city" label="Cidade" maxLength={120} name="address.city" onChange={(event) => updateField("city", event.target.value)} placeholder="Cidade" value={fields.city} /></div></div></fieldset>
            <fieldset className="farm-edit-card"><legend>Contato</legend><FarmSettingsField autoComplete="name" disabled={isSubmitting} error={fieldError("responsibleName")} id="responsibleName" label="Nome do responsável" maxLength={200} name="responsibleName" onChange={(event) => updateField("responsibleName", event.target.value)} placeholder="Nome do responsável" value={fields.responsibleName} /><FarmSettingsField autoComplete="tel" disabled={isSubmitting} error={fieldError("contactPhone")} id="contactPhone" label="Telefone/WhatsApp" maxLength={32} name="contactPhone" onChange={(event) => updateField("contactPhone", event.target.value)} optional placeholder="(11) 99999-0000" value={fields.contactPhone} /><FarmSettingsField autoComplete="email" disabled={isSubmitting} error={fieldError("contactEmail")} id="contactEmail" label="E-mail" maxLength={320} name="contactEmail" onChange={(event) => updateField("contactEmail", event.target.value)} optional placeholder="voce@exemplo.com" type="email" value={fields.contactEmail} /><p className="farm-edit-help">Os dados de contato ajudam a manter o criatório atualizado para sua rotina.</p></fieldset>
          </div>
          <div className="farm-edit-actions"><Link className="farm-cancel-action" href="/configuracoes/criatorio">Cancelar</Link><button className="auth-primary-action" disabled={isSubmitting} type="submit">{isSubmitting ? "Salvando alterações…" : "Salvar alterações"}</button></div>
        </form>
      </div>
    </AuthenticatedShell>
  );
}

function BreedingFarmOverviewScreen({ email }: Readonly<{ email: string }>) {
  const { refresh } = useAuth();
  const [loadState, setLoadState] = useState<FarmLoadState>("loading");
  const [settings, setSettings] = useState<BreedingFarmSettingsResponse>();
  const [message, setMessage] = useState<string>();
  const [reloadNonce, setReloadNonce] = useState(0);
  const client = useRef<ApiClient | null>(null);
  const requestVersion = useRef(0);
  if (!client.current) client.current = createApiClient(() => undefined);

  useEffect(() => {
    const currentRequest = requestVersion.current + 1;
    requestVersion.current = currentRequest;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    setLoadState("loading"); setMessage(undefined);
    async function loadOverview() {
      try {
        const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms", { signal: controller.signal });
        if (!selection.selectedBreedingFarmId) { setLoadState("blocked"); setMessage(selection.breedingFarms.length > 0 ? "Selecione um criatório para consultar suas informações." : "Crie seu primeiro criatório antes de consultar suas informações."); return; }
        client.current!.setTenant(selection.selectedBreedingFarmId);
        const response = await client.current!.request<BreedingFarmSettingsResponse>(`api/breeding-farms/${encodeURIComponent(selection.selectedBreedingFarmId)}/settings`, { signal: controller.signal });
        if (cancelled || currentRequest !== requestVersion.current) return;
        setSettings(response); setLoadState("ready");
      } catch (error) {
        if (cancelled || currentRequest !== requestVersion.current || error instanceof StaleTenantResponseError) return;
        if (error instanceof ApiError && error.status === 401) { const result = await refresh(); if (result.ok) setReloadNonce((current) => current + 1); return; }
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) { setLoadState("blocked"); setMessage("Sua conta não tem permissão para acessar o criatório selecionado."); return; }
        setLoadState("error"); setMessage(error instanceof ApiError && error.status >= 500 ? "O serviço está indisponível no momento. Tente novamente em instantes." : "Verifique sua conexão e tente novamente.");
      }
    }
    void loadOverview();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeoutId); };
  }, [refresh, reloadNonce]);

  if (loadState === "loading") return <AppLoadingState activeNav="farm" email={email} label="Carregando seu criatório" message="Só um instante enquanto buscamos as informações do seu criatório." />;
  if (loadState === "blocked") return <FarmState email={email} heading="Selecione um criatório" message={message ?? "Escolha um criatório para continuar."} />;
  if (loadState === "error") return <FarmState email={email} heading="Não foi possível abrir seu criatório" message={message ?? "Tente novamente para continuar."} onRetry={() => setReloadNonce((current) => current + 1)} />;
  return settings ? <FarmOverview email={email} settings={settings} /> : null;
}

function BreedingFarmScreen() {
  const { error, refresh, session, status } = useAuth();
  const searchParams = useSearchParams();
  const queryFarmId = searchParams.get("breedingFarmId");
  const farmId = queryFarmId?.trim() || null;
  const isEditRoute = Boolean(farmId);

  if (status === "loading" || status === "authenticating" || status === "signing-out") return <AppLoadingState activeNav="farm" email={session?.email} label="Carregando criatório" message="Um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <FarmState heading="Não foi possível abrir o criatório" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <FarmState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar este criatório."} onRetry={() => void refresh()} />;
  if (status === "unauthenticated" || !session) return <FarmState heading={isEditRoute ? "Entre para editar seu criatório" : "Entre para acessar seu criatório"} message={isEditRoute ? "Faça login para atualizar os dados do seu criatório com segurança." : "Faça login para visualizar e atualizar as informações do seu criatório."} />;
  return farmId ? <EditBreedingFarmForm email={session.email} farmId={farmId} /> : <BreedingFarmOverviewScreen email={session.email} />;
}

export default function BreedingFarmPage() {
  return <AuthProvider><BreedingFarmScreen /></AuthProvider>;
}
