"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, ValidationErrors, createApiClient } from "../../../../../lib/http/api-client";
import { AuthenticatedShell } from "../../../../components/authenticated-shell";
import { AppLoadingState } from "../../../../components/app-loading-state";
import { BrandLockup, BrandPanel } from "../../../../components/brand";
import { SpeciesSelector, SpeciesSummary } from "../../../../components/species-selector";

type BirdSex = "Female" | "Male" | "Unknown";
type BirdStatus = "Active" | "Archived" | "Transferred" | "Deceased" | "Escaped";
type FarmState = "blocked" | "error" | "loading" | "ready";
type LoadState = "error" | "loading" | "not-found" | "ready";

interface BreedingFarmSummary {
  breedingFarmId: string;
  isSelected: boolean;
  name: string;
  responsibleName: string;
}

interface BreedingFarmSelectionResponse {
  breedingFarms: BreedingFarmSummary[];
  selectedBreedingFarmId: string | null;
}

interface BirdDetailsResponse {
  birthDate: string | null;
  birdId: string;
  breedingFarmId: string;
  deathDate: string | null;
  identificationPending: boolean;
  name: string;
  notes: string | null;
  ringNumber: string | null;
  sex: BirdSex;
  speciesId: string;
  speciesPopularName: string;
  speciesScientificName: string;
  status: BirdStatus;
  updatedAtUtc: string;
}

interface BirdFields {
  birthDate: string;
  name: string;
  notes: string;
  ringNumber: string;
  sex: BirdSex | "";
}

const statusLabels: Record<BirdStatus, string> = {
  Active: "ativa",
  Archived: "arquivada",
  Deceased: "falecida",
  Escaped: "escapada",
  Transferred: "transferida"
};

function firstError(errors: ValidationErrors, field: string): string | undefined {
  const matchingKey = Object.keys(errors).find((key) => key.toLowerCase() === field.toLowerCase());
  return matchingKey ? errors[matchingKey]?.[0] : undefined;
}

function clearError(errors: ValidationErrors, field: string): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.toLowerCase() !== field.toLowerCase()));
}

function localizeValidationErrors(errors: ValidationErrors): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).map(([field, messages]) => {
    const normalizedField = field.toLowerCase();
    const originalMessage = messages[0] ?? "Confira este campo e tente novamente.";
    let message = originalMessage;

    if (normalizedField === "name") message = originalMessage.toLowerCase().includes("required")
      ? "Informe o nome da ave."
      : "O nome da ave não pode exceder 100 caracteres.";
    if (normalizedField === "sex") message = "Selecione um sexo válido para a ave.";
    if (normalizedField === "speciesid") message = "Escolha uma espécie ativa do catálogo.";
    if (normalizedField === "birthdate") message = "A data de nascimento não pode ser futura.";
    if (normalizedField === "ringnumber") message = "A anilha deve ter exatamente seis dígitos.";
    if (normalizedField === "notes") message = "As observações não podem exceder 2.000 caracteres.";

    return [field, [message]];
  }));
}

function fieldsFromBird(bird: BirdDetailsResponse): BirdFields {
  return {
    birthDate: bird.birthDate ?? "",
    name: bird.name,
    notes: bird.notes ?? "",
    ringNumber: bird.ringNumber ?? "",
    sex: bird.sex
  };
}

function speciesFromBird(bird: BirdDetailsResponse): SpeciesSummary {
  return {
    popularName: bird.speciesPopularName,
    scientificName: bird.speciesScientificName,
    speciesId: bird.speciesId
  };
}

function validateFields(fields: BirdFields, species?: SpeciesSummary): ValidationErrors {
  const errors: ValidationErrors = {};
  const name = fields.name.trim();

  if (!name) errors.name = ["Informe o nome da ave."];
  else if (name.length > 100) errors.name = ["O nome da ave não pode exceder 100 caracteres."];
  if (!fields.sex) errors.sex = ["Selecione o sexo da ave."];
  if (!species) errors.speciesId = ["Escolha uma espécie do catálogo."];
  if (fields.birthDate && fields.birthDate > new Date().toISOString().slice(0, 10)) {
    errors.birthDate = ["A data de nascimento não pode ser futura."];
  }
  if (fields.ringNumber && !/^\d{6}$/.test(fields.ringNumber)) {
    errors.ringNumber = ["A anilha deve ter exatamente seis dígitos."];
  }
  if (fields.notes.trim().length > 2000) errors.notes = ["As observações não podem exceder 2.000 caracteres."];

  return errors;
}

function requestBody(fields: BirdFields, species: SpeciesSummary) {
  return {
    birthDate: fields.birthDate || null,
    name: fields.name.trim(),
    notes: fields.notes.trim() || null,
    ringNumber: fields.ringNumber.trim() || null,
    sex: fields.sex,
    speciesId: species.speciesId
  };
}

function readBirdIdFromPathname(): string {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  const editIndex = segments.lastIndexOf("editar");
  return decodeURIComponent(segments[editIndex - 1] ?? "");
}

function EditState({
  actionHref,
  actionLabel = "Voltar para a ficha",
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente"
}: Readonly<{
  actionHref: string;
  actionLabel?: string;
  heading: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="auth-page onboarding-page bird-registration-page">
      <a className="skip-link" href="#conteudo-edicao-ave">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell bird-registration-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-estado-edicao-ave" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-edicao-ave">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-estado-edicao-ave" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <Link className="text-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthenticatedEditState({
  email,
  farmName,
  actionHref,
  actionLabel = "Voltar para a ficha",
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente"
}: Readonly<{
  actionHref: string;
  actionLabel?: string;
  email: string;
  farmName: string;
  heading: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <AuthenticatedShell activeNav="birds" email={email} farmName={farmName}>
      <div className="bird-form-view">
        <div className="bird-form-state" id="conteudo-edicao-ave">
          <h1 ref={headingRef} tabIndex={-1}>{heading}</h1>
          <p>{message}</p>
          <div className="bird-form-state-actions">
            {onRetry && <button className="auth-primary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <Link className="auth-secondary-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </div>
      </div>
    </AuthenticatedShell>
  );
}

function Field({
  disabled,
  error,
  id,
  label,
  max,
  maxLength,
  onChange,
  optional,
  placeholder,
  type = "text",
  value
}: Readonly<{
  disabled: boolean;
  error?: string;
  id: string;
  label: string;
  max?: string;
  maxLength?: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  optional?: boolean;
  placeholder?: string;
  type?: "date" | "text";
  value: string;
}>) {
  const errorId = `${id}-error`;

  return (
    <div className="onboarding-field">
      <label htmlFor={id}>{label}{optional && <span> (opcional)</span>}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        id={id}
        inputMode={id === "ring-number" ? "numeric" : undefined}
        max={max}
        maxLength={maxLength}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  );
}

function BirdEditForm({ birdId }: Readonly<{ birdId: string }>) {
  const { refresh, session } = useAuth();
  const [bird, setBird] = useState<BirdDetailsResponse>();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [fields, setFields] = useState<BirdFields>();
  const [farmError, setFarmError] = useState<string>();
  const [farmName, setFarmName] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [formError, setFormError] = useState<string>();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesSummary>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const requestVersion = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const loadData = useCallback(async (recoverSession = true) => {
    const nextRequestVersion = requestVersion.current + 1;
    requestVersion.current = nextRequestVersion;
    client.current?.clearCache();
    setFarmState("loading");
    setLoadState("loading");
    setFarmError(undefined);
    setFormError(undefined);
    setErrors({});

    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (nextRequestVersion !== requestVersion.current) return;

      if (!selection.selectedBreedingFarmId) {
        setFarmState("blocked");
        setFarmError(selection.breedingFarms.length > 0
          ? "Selecione um criatório para editar os dados da ave."
          : "Crie seu primeiro criatório antes de editar uma ave.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name);
      setFarmState("ready");

      const details = await client.current!.request<BirdDetailsResponse>(`api/birds/${encodeURIComponent(birdId)}`);
      if (nextRequestVersion !== requestVersion.current) return;

      setBird(details);
      setFields(fieldsFromBird(details));
      setSelectedSpecies(speciesFromBird(details));
      setLoadState("ready");
    } catch (error) {
      if (nextRequestVersion !== requestVersion.current || error instanceof StaleTenantResponseError) return;

      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) await loadData(false);
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setFarmState("ready");
        setLoadState("not-found");
        return;
      }
      if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
        setFarmState("blocked");
        setFarmError(error.status === 403
          ? "Sua conta não tem permissão para editar esta ficha."
          : "Selecione novamente um criatório para editar os dados da ave.");
        return;
      }

      setFarmState("error");
      setFarmError(error instanceof ApiError && error.status >= 500
        ? "O serviço está indisponível no momento. Tente novamente em instantes."
        : "Não foi possível carregar os dados da ave. Verifique sua conexão e tente novamente.");
    }
  }, [birdId, refresh]);

  useEffect(() => { void loadData(); }, [loadData, reloadVersion]);

  function updateField(field: keyof BirdFields, value: string) {
    setFields((current) => current ? { ...current, [field]: value } : current);
    setErrors((current) => clearError(current, field));
    setFormError(undefined);
    setSuccessMessage(undefined);
  }

  function updateSpecies(species: SpeciesSummary | undefined) {
    setSelectedSpecies(species);
    setErrors((current) => clearError(current, "speciesId"));
    setFormError(undefined);
    setSuccessMessage(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields || !selectedSpecies || bird?.status === "Transferred") return;

    const validationErrors = validateFields(fields, selectedSpecies);
    setErrors(validationErrors);
    setFormError(undefined);
    setSuccessMessage(undefined);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      const response = await client.current!.request<BirdDetailsResponse>(`api/birds/${encodeURIComponent(birdId)}`, {
        body: JSON.stringify(requestBody(fields, selectedSpecies)),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      setBird(response);
      setFields(fieldsFromBird(response));
      setSelectedSpecies(speciesFromBird(response));
      setErrors({});
      setFormError(undefined);
      setSuccessMessage("Dados da ave atualizados com sucesso.");
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
        if (error.status === 409 && error.message.toLowerCase().includes("ring")) {
          setErrors((current) => ({ ...current, ringNumber: ["Esta anilha já está cadastrada neste criatório."] }));
          setFormError("Já existe uma ave com esta anilha. Confira o número e tente novamente.");
        } else if (error.status === 409) {
          setFarmState("blocked");
          setFarmError("Selecione novamente um criatório para editar os dados da ave.");
        } else {
          setFormError(error.status === 400
            ? "Confira os dados informados e tente novamente."
            : error.status >= 500
              ? "O serviço está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível atualizar a ave agora. Tente novamente.");
        }
      } else {
        setFormError("Não foi possível atualizar a ave agora. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (farmState === "loading" || (farmState === "ready" && loadState === "loading")) {
    return <AppLoadingState activeNav="birds" email={session?.email} farmName={farmName ?? "Criatório selecionado"} label="Carregando edição" message="Buscando as informações da ave para edição." />;
  }
  if (farmState === "blocked") {
    return <AuthenticatedEditState actionHref={`/plantel/aves/${encodeURIComponent(birdId)}`} email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"} heading="Edição indisponível" message={farmError ?? "Não foi possível editar esta ave."} actionLabel="Voltar para a ficha" />;
  }
  if (farmState === "error") {
    return <AuthenticatedEditState actionHref={`/plantel/aves/${encodeURIComponent(birdId)}`} email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"} heading="Não foi possível carregar a ave" message={farmError ?? "Tente novamente para continuar."} onRetry={() => setReloadVersion((value) => value + 1)} />;
  }
  if (loadState === "not-found" || !bird || !fields || !selectedSpecies) {
    return <AuthenticatedEditState actionHref="/plantel/aves" email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"} actionLabel="Voltar para o plantel" heading="Ave não encontrada" message="Não foi possível localizar esta ave no criatório selecionado." />;
  }
  if (bird.status === "Transferred") {
    return <AuthenticatedEditState actionHref={`/plantel/aves/${encodeURIComponent(birdId)}`} email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"} heading="Edição bloqueada" message="Esta ave está transferida. Atualizações cadastrais ficam bloqueadas durante o fluxo de transferência." />;
  }

  const fieldError = (field: string) => firstError(errors, field);
  const today = new Date().toISOString().slice(0, 10);
  const isTerminalStatus = bird.status !== "Active";

  return (
    <AuthenticatedShell activeNav="birds" email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"}>
      <div className="bird-form-view" id="conteudo-edicao-ave">
        <nav aria-label="Navegação estrutural" className="bird-detail-breadcrumb"><Link href="/dashboard">Dashboard</Link><span aria-hidden="true">/</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">/</span><Link href={`/plantel/aves/${encodeURIComponent(birdId)}`}>{bird.name}</Link><span aria-hidden="true">/</span><span aria-current="page">Editar</span></nav>
        <div className="bird-form-page-header">
          <p className="eyebrow">Ficha privada{farmName ? ` · ${farmName}` : ""}</p>
          <h1 id="titulo-edicao-ave">Editar dados da ave</h1>
          <p className="lede">Atualize os dados cadastrais de {bird.name} sem alterar a genealogia ou a situação registrada.</p>
        </div>

        <div className="bird-form-layout">
          <div className="bird-form-main">
            <div className="bird-form-card bird-form-card-edit">

            {isTerminalStatus && (
              <div className="bird-pending-feedback" role="status">
                <strong>Ave {statusLabels[bird.status]}.</strong>
                <span>A situação é alterada em um fluxo separado; este formulário atualiza somente os dados cadastrais.</span>
              </div>
            )}

            <form aria-label="Edição de dados da ave" className="onboarding-form bird-registration-form bird-edit-form" noValidate onSubmit={handleSubmit}>
              {formError && <div className="form-error" role="alert">{formError}</div>}
              {successMessage && <p className="confirmation-feedback" role="status">{successMessage}</p>}

              <fieldset className="onboarding-fieldset">
                <legend>Identificação</legend>
                <div className="onboarding-fields-grid">
                  <Field disabled={isSubmitting} error={fieldError("name")} id="bird-name" label="Nome da ave" maxLength={100} onChange={(event) => updateField("name", event.target.value)} placeholder="Ex.: Aurora" value={fields.name} />
                  <Field disabled={isSubmitting} error={fieldError("birthDate")} id="birth-date" label="Data de nascimento" max={today} onChange={(event) => updateField("birthDate", event.target.value)} optional type="date" value={fields.birthDate} />
                </div>

                <div className="bird-sex-field">
                  <span className="bird-field-label" id="bird-sex-label">Sexo</span>
                  <div aria-describedby={fieldError("sex") ? "bird-sex-error" : undefined} aria-labelledby="bird-sex-label" className="bird-sex-options" role="radiogroup">
                    {(["Female", "Male", "Unknown"] as const).map((sex) => (
                      <label className={`bird-sex-option${fields.sex === sex ? " is-selected" : ""}`} key={sex}>
                        <input checked={fields.sex === sex} disabled={isSubmitting} name="sex" onChange={() => updateField("sex", sex)} type="radio" value={sex} />
                        <span>{sex === "Female" ? "Fêmea" : sex === "Male" ? "Macho" : "Desconhecido"}</span>
                      </label>
                    ))}
                  </div>
                  {fieldError("sex") && <p className="field-error" id="bird-sex-error">{fieldError("sex")}</p>}
                </div>

                <Field disabled={isSubmitting} error={fieldError("ringNumber")} id="ring-number" label="Anilha" maxLength={6} onChange={(event) => updateField("ringNumber", event.target.value.replace(/\D/g, "").slice(0, 6))} optional placeholder="Ex.: 123456" value={fields.ringNumber} />
                <p className="bird-field-help">Use seis dígitos quando a ave já estiver identificada.</p>
              </fieldset>

              <fieldset aria-describedby={fieldError("speciesId") ? "bird-species-error" : undefined} className="onboarding-fieldset bird-species-fieldset">
                <legend>Espécie</legend>
                <SpeciesSelector disabled={isSubmitting} initialSpecies={selectedSpecies} onSelected={updateSpecies} onSessionExpired={() => void refresh()} />
                {fieldError("speciesId") && <p className="field-error" id="bird-species-error" role="alert">{fieldError("speciesId")}</p>}
              </fieldset>

              <fieldset className="onboarding-fieldset">
                <legend>Observações <span>(opcional)</span></legend>
                <div className="onboarding-field">
                  <label htmlFor="bird-notes">Observações sobre a ave</label>
                  <textarea aria-describedby={`bird-notes-help${fieldError("notes") ? " bird-notes-error" : ""}`} aria-invalid={Boolean(fieldError("notes"))} disabled={isSubmitting} id="bird-notes" maxLength={2000} onChange={(event) => updateField("notes", event.target.value)} placeholder="Ex.: Ave matriz do plantel." value={fields.notes} />
                  <p className="bird-field-help" id="bird-notes-help">Até 2.000 caracteres.</p>
                  {fieldError("notes") && <p className="field-error" id="bird-notes-error">{fieldError("notes")}</p>}
                </div>
              </fieldset>

            <div className="bird-edit-actions">
                <Link className="auth-secondary-action" href={`/plantel/aves/${encodeURIComponent(birdId)}`}>Cancelar</Link>
                <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">{isSubmitting ? "Salvando alterações…" : "Salvar alterações"}</button>
            </div>
            </form>
            </div>
          </div>

          <aside aria-label="Resumo da ficha" className="bird-form-aside">
            <section className="bird-form-aside-card">
              <p className="eyebrow">FICHA ATUAL</p>
              <h2>{bird.name}</h2>
              <dl className="bird-form-summary-list">
                <div><dt>Espécie/Raça</dt><dd>{bird.speciesPopularName}</dd></div>
                <div><dt>Situação</dt><dd>{statusLabels[bird.status]}</dd></div>
                <div><dt>Anilha</dt><dd>{bird.ringNumber ?? "Não informada"}</dd></div>
              </dl>
            </section>
            <section className="bird-form-aside-card bird-form-aside-card-soft">
              <p className="eyebrow">ATENÇÃO</p>
              <h2>Dados cadastrais</h2>
              <p>A edição mantém o criatório e a genealogia. A situação da ave é alterada em um fluxo separado.</p>
            </section>
          </aside>
        </div>

        <p className="auth-footer">Os dados ficam vinculados somente ao criatório selecionado.</p>
      </div>
    </AuthenticatedShell>
  );
}

function BirdEditScreen() {
  const { error, refresh, session, status } = useAuth();
  const [birdId, setBirdId] = useState("");

  useEffect(() => { setBirdId(readBirdIdFromPathname()); }, []);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="birds" email={session?.email} label="Carregando edição" message="Um instante enquanto verificamos seu acesso." />;
  }
  if (status === "error") {
    return <EditState actionHref="/plantel/aves" heading="Não foi possível abrir a edição" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  }
  if (status === "forbidden") {
    return <EditState actionHref="/plantel/aves" heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para editar esta ficha."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  }
  if (status === "unauthenticated") {
    return <EditState actionHref="/login" actionLabel="Ir para o login" heading="Entre para editar a ave" message="Faça login para atualizar os dados privados da ave." />;
  }
  if (!birdId) {
    return <EditState actionHref="/plantel/aves" actionLabel="Voltar para o plantel" heading="Ave não identificada" message="Abra a edição a partir da ficha de uma ave." />;
  }

  return <BirdEditForm birdId={birdId} />;
}

export default function BirdEditPage() {
  return (
    <AuthProvider>
      <BirdEditScreen />
    </AuthProvider>
  );
}
