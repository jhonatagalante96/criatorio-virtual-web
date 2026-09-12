"use client";

import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, ValidationErrors, createApiClient } from "../../../../lib/http/api-client";
import { AppLoadingState } from "../../../components/app-loading-state";
import { AuthenticatedShell } from "../../../components/authenticated-shell";
import { BrandLockup, BrandPanel } from "../../../components/brand";
import { SpeciesSelector, SpeciesSummary } from "../../../components/species-selector";

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

interface ParentOption {
  birdId: string;
  birthDate: string | null;
  name: string;
  ringNumber: string | null;
  sex: "Female" | "Male" | "Unknown";
}

interface ParentOptionsResponse {
  breedingFarmId: string;
  items: ParentOption[];
}

interface CreatedBirdResponse {
  birdId: string;
  identificationPending: boolean;
  name: string;
  ringNumber: string | null;
  status: string;
}

interface BirdFields {
  birthDate: string;
  name: string;
  notes: string;
  ringNumber: string;
  sex: "Female" | "Male" | "Unknown" | "";
}

type ParentSelection =
  | { kind: "external"; name: string }
  | { kind: "linked"; birdId: string; name: string; ringNumber: string | null }
  | undefined;

type ParentSearchState = "empty" | "error" | "idle" | "loading" | "ready";
type FarmState = "blocked" | "error" | "loading" | "ready";

const initialFields: BirdFields = {
  birthDate: "",
  name: "",
  notes: "",
  ringNumber: "",
  sex: ""
};

function firstError(errors: ValidationErrors, key: string): string | undefined {
  const matchingKey = Object.keys(errors).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return matchingKey ? errors[matchingKey]?.[0] : undefined;
}

function clearError(errors: ValidationErrors, key: string): ValidationErrors {
  return Object.fromEntries(Object.entries(errors).filter(([candidate]) => candidate.toLowerCase() !== key.toLowerCase()));
}

function normalizeValidationErrors(errors: ValidationErrors): ValidationErrors {
  const messages: ValidationErrors = {};
  for (const [key, values] of Object.entries(errors)) {
    messages[key] = values.map((value) => {
      if (key.toLowerCase() === "name") return value.includes("required") ? "Informe o nome da ave." : "O nome da ave não pode exceder 100 caracteres.";
      if (key.toLowerCase() === "sex") return "Selecione um sexo válido para a ave.";
      if (key.toLowerCase() === "speciesid") return "Escolha uma espécie ativa do catálogo.";
      if (key.toLowerCase() === "birthdate") return "A data de nascimento não pode ser futura.";
      if (key.toLowerCase() === "ringnumber") return "A anilha deve ter exatamente seis dígitos.";
      if (key.toLowerCase().includes("father") || key.toLowerCase().includes("mother") || key.toLowerCase() === "parent") return "Revise os dados informados para os pais.";
      if (key.toLowerCase() === "notes") return "As observações não podem exceder 2.000 caracteres.";
      return value;
    });
  }
  return messages;
}

function validateFields(fields: BirdFields, species?: SpeciesSummary): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!fields.name.trim()) errors.name = ["Informe o nome da ave."];
  else if (fields.name.trim().length > 100) errors.name = ["O nome da ave não pode exceder 100 caracteres."];
  if (!fields.sex) errors.sex = ["Selecione o sexo da ave."];
  if (!species) errors.speciesId = ["Escolha uma espécie do catálogo."];
  if (fields.birthDate && fields.birthDate > new Date().toISOString().slice(0, 10)) errors.birthDate = ["A data de nascimento não pode ser futura."];
  if (fields.ringNumber && !/^\d{6}$/.test(fields.ringNumber)) errors.ringNumber = ["A anilha deve ter exatamente seis dígitos."];
  if (fields.notes.trim().length > 2000) errors.notes = ["As observações não podem exceder 2.000 caracteres."];
  return errors;
}

function AccessState({
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente",
  actionHref = "/",
  actionLabel = "Voltar para o início"
}: Readonly<{ actionHref?: string; actionLabel?: string; heading: string; message: string; onRetry?: () => void; retryLabel?: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="auth-page onboarding-page bird-registration-page">
      <a className="skip-link" href="#conteudo-cadastro-ave">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-estado-cadastro-ave" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-cadastro-ave">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-estado-cadastro-ave" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <Link className="text-action" href={actionHref}>{actionLabel}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function FormField({
  autoComplete,
  disabled,
  error,
  id,
  inputMode,
  label,
  max,
  maxLength,
  name,
  onChange,
  optional,
  placeholder,
  type = "text",
  value
}: Readonly<{
  autoComplete?: string;
  disabled: boolean;
  error?: string;
  id: string;
  inputMode?: "numeric" | "text";
  label: string;
  max?: string;
  maxLength?: number;
  name: string;
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
        autoComplete={autoComplete}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        max={max}
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

function formatParentOption(option: ParentOption): string {
  return option.ringNumber ? `${option.name} · anilha ${option.ringNumber}` : option.name;
}

function ParentPicker({
  client,
  disabled,
  label,
  onChange,
  onSessionExpired,
  selection,
  sex
}: Readonly<{
  client: ApiClient;
  disabled: boolean;
  label: string;
  onChange: (selection: ParentSelection) => void;
  onSessionExpired: () => void;
  selection: ParentSelection;
  sex: "Female" | "Male";
}>) {
  const [externalName, setExternalName] = useState(selection?.kind === "external" ? selection.name : "");
  const [mode, setMode] = useState<"external" | "search">(selection?.kind === "external" ? "external" : "search");
  const [options, setOptions] = useState<ParentOption[]>([]);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<ParentSearchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (mode !== "search") return;

    const controller = new AbortController();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setOptions([]);
      setErrorMessage(undefined);
      setSearchState("idle");
      return () => controller.abort();
    }

    setSearchState("loading");
    setErrorMessage(undefined);
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await client.request<ParentOptionsResponse>(
          `api/birds/parent-options?search=${encodeURIComponent(normalizedQuery)}&sex=${sex}&limit=5`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setOptions(response.items);
        setSearchState(response.items.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired();
          return;
        }
        setErrorMessage(error instanceof ApiError && error.status >= 500
          ? "A busca de pais está indisponível. Tente novamente em instantes."
          : "Não foi possível buscar os pais agora.");
        setSearchState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [client, mode, onSessionExpired, query, reloadVersion, sex]);

  function switchToSearch() {
    setMode("search");
    setExternalName("");
    onChange(undefined);
  }

  function switchToExternal() {
    setMode("external");
    setQuery("");
    setOptions([]);
    setSearchState("idle");
    onChange(externalName.trim() ? { kind: "external", name: externalName.trim() } : undefined);
  }

  function updateExternalName(value: string) {
    setExternalName(value);
    onChange(value.trim() ? { kind: "external", name: value.trim() } : undefined);
  }

  const pickerId = sex === "Male" ? "father" : "mother";
  const parentName = sex === "Male" ? "pai" : "mãe";
  const parentGender = sex === "Male" ? "cadastrado" : "cadastrada";
  const selectedLinked = selection?.kind === "linked" ? selection : undefined;

  return (
    <div className="bird-parent-picker">
      <div className="bird-parent-heading">
        <div>
          <span className="bird-field-label" id={`${pickerId}-label`}>{label} <span>(opcional)</span></span>
          <p>Busque por nome ou anilha entre as aves ativas do criatório.</p>
        </div>
        {mode === "search"
          ? <button className="text-action" disabled={disabled} onClick={switchToExternal} type="button">Informar nome do {parentName} sem cadastro</button>
          : <button className="text-action" disabled={disabled} onClick={switchToSearch} type="button">Buscar {parentName} {parentGender}</button>}
      </div>

      {mode === "external" ? (
        <FormField
          disabled={disabled}
          id={`${pickerId}-external-name`}
          label={`Nome do ${sex === "Male" ? "pai" : "mãe"}`}
          maxLength={200}
          name={`${pickerId}-external-name`}
          onChange={(event) => updateExternalName(event.target.value)}
          placeholder={`Ex.: ${sex === "Male" ? "Pai Azul" : "Mãe Rubi"}`}
          value={externalName}
        />
      ) : selectedLinked ? (
        <div className="bird-parent-selected" role="status">
          <span className="bird-parent-selected-copy">
            <strong>{selectedLinked.name}</strong>
            <span>{selectedLinked.ringNumber ? `Anilha ${selectedLinked.ringNumber}` : "Sem anilha informada"}</span>
          </span>
          <button className="text-action" disabled={disabled} onClick={switchToSearch} type="button">Alterar {parentName}</button>
        </div>
      ) : (
        <>
          <div className="bird-parent-search-control">
            <input
              aria-controls={`${pickerId}-options`}
              aria-describedby={`${pickerId}-help`}
              aria-labelledby={`${pickerId}-label`}
              autoComplete="off"
              disabled={disabled}
              id={`${pickerId}-search`}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
              placeholder={`Ex.: ${sex === "Male" ? "Pai Azul ou 930001" : "Mãe Rubi ou 930002"}`}
              type="search"
              value={query}
            />
            {query && <button aria-label={`Limpar busca de ${label.toLowerCase()}`} className="bird-parent-search-clear" disabled={disabled} onClick={() => setQuery("")} type="button">×</button>}
          </div>
          <p className="bird-parent-help" id={`${pickerId}-help`}>Digite pelo menos dois caracteres para consultar.</p>
          <div aria-live="polite" className="bird-parent-results" id={`${pickerId}-options`}>
            {searchState === "loading" && <p role="status">Buscando opções…</p>}
            {searchState === "idle" && <p role="status">Nenhuma ave selecionada.</p>}
            {searchState === "empty" && <p role="status">Nenhuma ave ativa encontrada.</p>}
            {searchState === "error" && (
              <div className="bird-parent-error">
                <p role="alert">{errorMessage}</p>
                <button className="auth-secondary-action" disabled={disabled} onClick={() => setReloadVersion((value) => value + 1)} type="button">Tentar novamente</button>
              </div>
            )}
            {searchState === "ready" && (
              <ul aria-label={`Opções para ${label.toLowerCase()}`} className="bird-parent-options" role="listbox">
                {options.map((option) => (
                  <li key={option.birdId}>
                    <button
                      aria-selected={false}
                      disabled={disabled}
                      onClick={() => {
                        onChange({ kind: "linked", birdId: option.birdId, name: option.name, ringNumber: option.ringNumber });
                        setQuery("");
                        setOptions([]);
                        setSearchState("idle");
                      }}
                      role="option"
                      type="button"
                    >
                      <strong>{option.name}</strong>
                      <span>{formatParentOption(option)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BirdRegistrationState({
  email,
  farmName,
  farmState,
  onRetry,
  message
}: Readonly<{ email: string; farmName: string; farmState: Exclude<FarmState, "ready">; message?: string; onRetry?: () => void }>) {
  const heading = farmState === "loading"
    ? "Verificando o criatório"
    : farmState === "blocked"
      ? "Selecione um criatório"
      : "Não foi possível abrir o cadastro";
  const stateMessage = message ?? (farmState === "loading"
    ? "Só um instante enquanto verificamos o criatório selecionado."
    : farmState === "blocked"
      ? "Escolha um criatório antes de cadastrar uma ave."
      : "Tente novamente para continuar.");

  if (farmState === "loading") {
    return <AppLoadingState activeNav="birds" email={email} farmName={farmName} label="Carregando cadastro" message="Buscando o criatório selecionado." />;
  }

  return (
    <AuthenticatedShell activeNav="birds" email={email} farmName={farmName}>
      <div className="bird-form-view">
        <div className="bird-form-state" id="conteudo-cadastro-ave">
          <h1>{heading}</h1>
          <p>{stateMessage}</p>
          <div className="bird-form-state-actions">
            {farmState === "blocked" && <Link className="auth-primary-action" href="/onboarding/criatorio/selecionar">Selecionar criatório</Link>}
            {farmState === "error" && onRetry && <button className="auth-primary-action" onClick={onRetry} type="button">Tentar novamente</button>}
            <Link className="auth-secondary-action" href="/plantel/aves">Voltar para o plantel</Link>
          </div>
        </div>
      </div>
    </AuthenticatedShell>
  );
}

function RegistrationSuccess({ bird, onRegisterAnother }: Readonly<{ bird: CreatedBirdResponse; onRegisterAnother: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="bird-registration-success">
      <div aria-hidden="true" className="onboarding-success-icon">✓</div>
      <p className="eyebrow">Cadastro concluído</p>
      <h1 id="titulo-cadastro-ave" ref={headingRef} tabIndex={-1}>{bird.name} foi cadastrada.</h1>
      <p className="lede">A ave foi registrada com status ativo no criatório selecionado.</p>
      {bird.identificationPending && (
        <div className="bird-pending-feedback" role="status">
          <strong>Identificação pendente</strong>
          <span>Informe uma anilha de seis dígitos quando essa identificação estiver disponível.</span>
        </div>
      )}
      <button className="auth-primary-action" onClick={onRegisterAnother} type="button">Cadastrar outra ave</button>
      <Link className="text-action" href="/">Voltar para o início</Link>
    </div>
  );
}

function BirdRegistrationLayout({ children, email, farmName }: Readonly<{ children: React.ReactNode; email: string; farmName: string }>) {
  return (
    <AuthenticatedShell activeNav="birds" email={email} farmName={farmName}>
      <div className="bird-form-view" id="conteudo-cadastro-ave">{children}</div>
    </AuthenticatedShell>
  );
}

function BirdRegistrationGuidance() {
  return (
    <aside aria-label="Orientações do cadastro" className="bird-form-aside">
      <section className="bird-form-aside-card">
        <p className="eyebrow">ORIENTAÇÕES</p>
        <h2>Dados principais</h2>
        <p>Nome, sexo e espécie são obrigatórios. A anilha, nascimento, genealogia e observações podem ser preenchidos depois.</p>
      </section>
      <section className="bird-form-aside-card bird-form-aside-card-soft">
        <p className="eyebrow">IDENTIFICAÇÃO</p>
        <h2>Anilha opcional</h2>
        <p>Sem anilha, o cadastro continua válido e a ave fica marcada com identificação pendente.</p>
      </section>
    </aside>
  );
}

function BirdRegistrationForm() {
  const { refresh, session } = useAuth();
  const [farmName, setFarmName] = useState<string>();
  const [farmState, setFarmState] = useState<FarmState>("loading");
  const [farmError, setFarmError] = useState<string>();
  const [fields, setFields] = useState<BirdFields>(initialFields);
  const [species, setSpecies] = useState<SpeciesSummary>();
  const [father, setFather] = useState<ParentSelection>();
  const [mother, setMother] = useState<ParentSelection>();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBird, setCreatedBird] = useState<CreatedBirdResponse>();
  const [formVersion, setFormVersion] = useState(0);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const farmRequestVersion = useRef(0);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const handleSessionExpired = useCallback(() => { void refresh(); }, [refresh]);

  const loadFarm = useCallback(async (recoverSession = true) => {
    const requestVersion = farmRequestVersion.current + 1;
    farmRequestVersion.current = requestVersion;
    setFarmState("loading");
    setFarmError(undefined);
    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (requestVersion !== farmRequestVersion.current) return;
      if (!selection.selectedBreedingFarmId) {
        setFarmState("blocked");
        setFarmError(selection.breedingFarms.length > 0
          ? "Selecione um criatório para continuar o cadastro."
          : "Crie seu primeiro criatório antes de cadastrar uma ave.");
        return;
      }

      client.current!.setTenant(selection.selectedBreedingFarmId);
      setFarmName(selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId)?.name);
      setFarmState("ready");
    } catch (error) {
      if (requestVersion !== farmRequestVersion.current) return;
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const result = await refresh();
        if (result.ok) await loadFarm(false);
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setFarmState("blocked");
        setFarmError("Sua conta não tem permissão para acessar este criatório.");
        return;
      }
      setFarmState("error");
      setFarmError(error instanceof ApiError && error.status >= 500
        ? "O serviço está indisponível no momento. Tente novamente em instantes."
        : "Verifique sua conexão e tente novamente.");
    }
  }, [refresh]);

  useEffect(() => {
    void loadFarm();
  }, [loadFarm]);

  function updateField(field: keyof BirdFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearError(current, field));
    setFormError(undefined);
  }

  function resetForm() {
    setFields(initialFields);
    setSpecies(undefined);
    setFather(undefined);
    setMother(undefined);
    setErrors({});
    setFormError(undefined);
    setCreatedBird(undefined);
    setFormVersion((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateFields(fields, species);
    setErrors(validationErrors);
    setFormError(undefined);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      const response = await client.current!.request<CreatedBirdResponse>("api/birds", {
        body: JSON.stringify({
          birthDate: fields.birthDate || null,
          externalFatherName: father?.kind === "external" ? father.name : null,
          externalFatherSex: father?.kind === "external" ? "Male" : null,
          externalMotherName: mother?.kind === "external" ? mother.name : null,
          externalMotherSex: mother?.kind === "external" ? "Female" : null,
          fatherBirdId: father?.kind === "linked" ? father.birdId : null,
          motherBirdId: mother?.kind === "linked" ? mother.birdId : null,
          name: fields.name.trim(),
          notes: fields.notes.trim() || null,
          ringNumber: fields.ringNumber.trim() || null,
          sex: fields.sex,
          speciesId: species!.speciesId
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setCreatedBird(response);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(normalizeValidationErrors(error.fields));
        if (error.status === 401 || error.status === 403) {
          await refresh();
          return;
        }
        if (error.status === 409 && error.message.toLowerCase().includes("ring")) {
          setErrors((current) => ({ ...current, ringNumber: ["Esta anilha já está cadastrada neste criatório."] }));
          setFormError("Já existe uma ave com esta anilha. Confira o número e tente novamente.");
        } else if (error.status === 409) {
          setFarmState("blocked");
          setFarmError("Selecione um criatório antes de cadastrar uma ave.");
        } else {
          setFormError(error.status === 400
            ? "Confira os dados informados e tente novamente."
            : error.status >= 500
              ? "O serviço está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível cadastrar a ave agora. Tente novamente.");
        }
      } else {
        setFormError("Não foi possível cadastrar a ave agora. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (farmState !== "ready") {
    return <BirdRegistrationState email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"} farmState={farmState} message={farmState === "loading" ? "Só um instante enquanto verificamos o criatório selecionado." : farmError} onRetry={farmState === "error" ? () => void loadFarm() : undefined} />;
  }

  if (createdBird) {
    return <BirdRegistrationLayout email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"}><RegistrationSuccess bird={createdBird} onRegisterAnother={resetForm} /></BirdRegistrationLayout>;
  }

  const fieldError = (field: string) => firstError(errors, field);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <BirdRegistrationLayout email={session?.email ?? ""} farmName={farmName ?? "Criatório selecionado"}>
      <nav aria-label="Navegação estrutural" className="bird-detail-breadcrumb"><Link href="/dashboard">Dashboard</Link><span aria-hidden="true">/</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">/</span><span aria-current="page">Cadastrar ave</span></nav>
      <div className="bird-form-page-header">
        <p className="eyebrow">Plantel{farmName ? ` · ${farmName}` : ""}</p>
        <h1 id="titulo-cadastro-ave">Cadastrar ave</h1>
        <p className="lede">Registre uma ave e mantenha sua genealogia organizada desde o primeiro dado.</p>
      </div>

      <div className="bird-form-layout">
        <BirdRegistrationGuidance />
        <div className="bird-form-main">
          <form aria-label="Cadastro de ave" className="onboarding-form bird-registration-form bird-form-card" noValidate onSubmit={handleSubmit}>
        {formError && <div className="form-error" role="alert">{formError}</div>}

        <fieldset className="onboarding-fieldset">
          <legend>Identificação</legend>
          <div className="onboarding-fields-grid">
            <FormField
              autoComplete="off"
              disabled={isSubmitting}
              error={fieldError("name")}
              id="bird-name"
              label="Nome da ave"
              maxLength={100}
              name="name"
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Ex.: Aurora"
              value={fields.name}
            />
            <FormField
              disabled={isSubmitting}
              error={fieldError("birthDate")}
              id="birth-date"
              label="Data de nascimento"
              max={today}
              name="birthDate"
              onChange={(event) => updateField("birthDate", event.target.value)}
              optional
              type="date"
              value={fields.birthDate}
            />
          </div>

          <div className="bird-sex-field">
            <span className="bird-field-label" id="bird-sex-label">Sexo</span>
            <div aria-describedby={fieldError("sex") ? "bird-sex-error" : undefined} aria-labelledby="bird-sex-label" className="bird-sex-options" role="radiogroup">
              {(["Female", "Male", "Unknown"] as const).map((sex) => (
                <label className={`bird-sex-option${fields.sex === sex ? " is-selected" : ""}`} key={sex}>
                  <input
                    checked={fields.sex === sex}
                    disabled={isSubmitting}
                    name="sex"
                    onChange={() => updateField("sex", sex)}
                    type="radio"
                    value={sex}
                  />
                  <span>{sex === "Female" ? "Fêmea" : sex === "Male" ? "Macho" : "Desconhecido"}</span>
                </label>
              ))}
            </div>
            {fieldError("sex") && <p className="field-error" id="bird-sex-error">{fieldError("sex")}</p>}
          </div>

          <FormField
            disabled={isSubmitting}
            error={fieldError("ringNumber")}
            id="ring-number"
            inputMode="numeric"
            label="Anilha"
            maxLength={6}
            name="ringNumber"
            onChange={(event) => updateField("ringNumber", event.target.value.replace(/\D/g, "").slice(0, 6))}
            optional
            placeholder="Ex.: 123456"
            value={fields.ringNumber}
          />
          <p className="bird-field-help">Use seis dígitos quando a ave já estiver identificada.</p>
        </fieldset>

        <fieldset className="onboarding-fieldset bird-species-fieldset">
          <legend>Espécie</legend>
          <SpeciesSelector key={`species-${formVersion}`} onSelected={(value) => { setSpecies(value); setErrors((current) => clearError(current, "speciesId")); }} onSessionExpired={handleSessionExpired} />
          {fieldError("speciesId") && <p className="field-error" role="alert">{fieldError("speciesId")}</p>}
        </fieldset>

        <fieldset className="onboarding-fieldset bird-genealogy-fieldset">
          <legend>Genealogia <span>(opcional)</span></legend>
          <p className="bird-section-help">Vincule aves já cadastradas ou informe o nome de um pai sem cadastro.</p>
          <ParentPicker client={client.current!} disabled={isSubmitting} key={`father-${formVersion}`} label="Pai" onChange={setFather} onSessionExpired={handleSessionExpired} selection={father} sex="Male" />
          <ParentPicker client={client.current!} disabled={isSubmitting} key={`mother-${formVersion}`} label="Mãe" onChange={setMother} onSessionExpired={handleSessionExpired} selection={mother} sex="Female" />
          {fieldError("parent") && <p className="field-error" role="alert">{fieldError("parent")}</p>}
        </fieldset>

        <fieldset className="onboarding-fieldset">
          <legend>Observações <span>(opcional)</span></legend>
          <div className="onboarding-field">
            <label htmlFor="bird-notes">Observações sobre a ave</label>
            <textarea
              aria-describedby="bird-notes-help"
              aria-invalid={Boolean(fieldError("notes"))}
              disabled={isSubmitting}
              id="bird-notes"
              maxLength={2000}
              name="notes"
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Ex.: Ave matriz do plantel."
              value={fields.notes}
            />
            <p className="bird-field-help" id="bird-notes-help">Até 2.000 caracteres.</p>
            {fieldError("notes") && <p className="field-error">{fieldError("notes")}</p>}
          </div>
        </fieldset>

        <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Cadastrando ave…" : "Cadastrar ave"}
        </button>
          </form>
        </div>
      </div>

      <p className="auth-footer">Os dados ficam vinculados somente ao criatório selecionado.</p>
    </BirdRegistrationLayout>
  );
}

function BirdRegistrationScreen() {
  const { error, refresh, status } = useAuth();

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="birds" label="Carregando cadastro" message="Um instante enquanto verificamos seu acesso." />;
  }
  if (status === "error") {
    return <AccessState heading="Não foi possível abrir o cadastro" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  }
  if (status === "forbidden") {
    return <AccessState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para cadastrar aves."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  }
  if (status === "unauthenticated") {
    return <AccessState heading="Entre para cadastrar uma ave" message="Faça login para registrar aves no seu criatório." />;
  }

  return <BirdRegistrationForm />;
}

export default function BirdRegistrationPage() {
  return (
    <AuthProvider>
      <BirdRegistrationScreen />
    </AuthProvider>
  );
}
