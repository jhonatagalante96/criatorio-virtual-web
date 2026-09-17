"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../lib/http/api-client";
import { AppLoadingState } from "../../../components/app-loading-state";
import { BrandLockup, BrandPanel } from "../../../components/brand";
import { VisualIdentityManager } from "../../../configuracoes/criatorio/visual-identity-manager";

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

type SelectionView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "empty" }
  | { kind: "list"; selection: BreedingFarmSelectionResponse }
  | { kind: "identity"; farm: BreedingFarmSummary }
  | { kind: "success"; farm: BreedingFarmSummary };

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function SelectionState({
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente"
}: Readonly<{
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
    <main className="auth-page onboarding-page farm-selection-page">
      <a className="skip-link" href="#conteudo-selecao-criatorio">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell farm-selection-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-selecao-estado" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content onboarding-state-card" id="conteudo-selecao-criatorio">
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-selecao-estado" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <Link className="text-action" href="/login">Voltar para o login</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function SelectionPanelState({
  heading,
  message,
  onRetry,
  retryLabel = "Tentar novamente"
}: Readonly<{
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
    <div className="farm-selection-card onboarding-state-card">
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <h1 id="titulo-selecao-criatorio" ref={headingRef} tabIndex={-1}>{heading}</h1>
      <p className="lede">{message}</p>
      {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
      <Link className="text-action" href="/login">Voltar para o login</Link>
    </div>
  );
}

function EmptySelection({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div className="farm-selection-card farm-selection-empty">
      <p className="eyebrow">Próxima etapa</p>
      <h1 id="titulo-selecao-criatorio">Crie seu primeiro criatório</h1>
      <p className="lede">Ainda não existe um criatório vinculado a esta conta. Crie um agora para começar seu onboarding.</p>
      <Link className="auth-primary-action" href="/onboarding/criatorio">Criar meu criatório</Link>
      <button className="auth-secondary-action" onClick={onRetry} type="button">Atualizar</button>
      <Link className="text-action" href="/login">Voltar para a conta</Link>
    </div>
  );
}

function SelectionSuccess({ farm }: Readonly<{ farm: BreedingFarmSummary }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="farm-selection-card farm-selection-success">
      <div aria-hidden="true" className="onboarding-success-icon">✓</div>
      <p className="eyebrow">Etapa retomada</p>
      <h1 id="titulo-selecao-criatorio" ref={headingRef} tabIndex={-1}>Você está em {farm.name}.</h1>
      <p className="lede">A escolha foi salva e será usada para manter seu onboarding no criatório correto.</p>
      <Link className="auth-primary-action" href="/dashboard">Ir para o painel</Link>
      <Link className="text-action" href="/onboarding/criatorio/selecionar">Trocar criatório</Link>
    </div>
  );
}

function VisualIdentityOnboarding({ farm }: Readonly<{ farm: BreedingFarmSummary }>) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionRef = useRef<() => void>(() => {});

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="farm-selection-card farm-selection-success farm-identity-onboarding">
      <p className="eyebrow">Etapa opcional</p>
      <h1 id="titulo-selecao-criatorio" ref={headingRef} tabIndex={-1}>Identidade do criatório</h1>
      <p className="lede">Personalize a imagem de {farm.name} com uma foto sua ou um modelo. A identidade atual será mantida até você confirmar uma nova opção.</p>
      <div className="farm-identity-onboarding-preview">
        <VisualIdentityManager actionRef={actionRef} breedingFarmId={farm.breedingFarmId} farmName={farm.name} onApplied={() => router.replace("/dashboard")} />
      </div>
      <p className="farm-identity-onboarding-note">Use o botão sobre a imagem para enviar uma foto ou escolher um modelo. Você pode configurar isso depois.</p>
      <Link className="auth-primary-action" href="/dashboard">Configurar depois e ir para o painel</Link>
    </div>
  );
}

function FarmSelectionForm({
  selection,
  onSelected,
  onSubmit,
  selectedId,
  isSubmitting,
  formError
}: Readonly<{
  formError?: string;
  isSubmitting: boolean;
  onSelected: (farmId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedId?: string;
  selection: BreedingFarmSelectionResponse;
}>) {
  const hasMultipleFarms = selection.breedingFarms.length > 1;

  return (
    <div className="farm-selection-card">
      <Link className="auth-mobile-back" href="/login" aria-label="Voltar para a conta"><BackIcon /></Link>
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <p className="eyebrow">Onboarding</p>
      <h1 id="titulo-selecao-criatorio">Escolha onde continuar</h1>
      <p className="lede">{hasMultipleFarms
        ? "Selecione o criatório que deseja acessar. Sua escolha ficará salva para os próximos acessos."
        : "Encontramos um criatório vinculado à sua conta. Confirme para retomar seu onboarding."}</p>

      <div aria-label="Etapa 1 de 1" className="onboarding-progress">
        <span aria-hidden="true">1</span>
        <span>{hasMultipleFarms ? "Escolha do criatório" : "Criatório encontrado"}</span>
      </div>

      <form className="farm-selection-form" onSubmit={onSubmit}>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <fieldset className="farm-selection-fieldset">
          <legend>{hasMultipleFarms ? "Seus criatórios" : "Seu criatório"}</legend>
          <div className="farm-selection-options">
            {selection.breedingFarms.map((farm) => (
              <label className={`farm-selection-option${selectedId === farm.breedingFarmId ? " is-selected" : ""}`} key={farm.breedingFarmId}>
                <input
                  checked={selectedId === farm.breedingFarmId}
                  disabled={isSubmitting}
                  name="breedingFarmId"
                  onChange={() => onSelected(farm.breedingFarmId)}
                  type="radio"
                  value={farm.breedingFarmId}
                />
                <span className="farm-selection-option-copy">
                  <strong>{farm.name}</strong>
                  <span>Responsável: {farm.responsibleName}</span>
                </span>
                <span aria-hidden="true" className="farm-selection-option-check">✓</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button className="auth-primary-action submit-action" disabled={!selectedId || isSubmitting} type="submit">
          {isSubmitting ? "Salvando escolha…" : "Continuar com este criatório"}
        </button>
      </form>

      <p className="auth-footer">Você poderá trocar de criatório quando precisar.</p>
    </div>
  );
}

function BreedingFarmSelection() {
  const { refresh } = useAuth();
  const [view, setView] = useState<SelectionView>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string>();
  const [identityFarmId, setIdentityFarmId] = useState<string>();
  const [searchReady, setSearchReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    setIdentityFarmId(new URLSearchParams(window.location.search).get("identityFarmId") ?? undefined);
    setSearchReady(true);
  }, []);

  const loadSelection = useCallback(async (recoverSession = true) => {
    setView({ kind: "loading" });
    setFormError(undefined);

    try {
      const selection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      client.current!.setTenant(selection.selectedBreedingFarmId ?? undefined);
      const persistedFarm = selection.breedingFarms.find((farm) => farm.breedingFarmId === selection.selectedBreedingFarmId);
      const identityFarm = selection.breedingFarms.find((farm) => farm.breedingFarmId === identityFarmId);
      if (identityFarm && selection.selectedBreedingFarmId === identityFarm.breedingFarmId) {
        setSelectedId(identityFarm.breedingFarmId);
        setView({ kind: "identity", farm: identityFarm });
        return;
      }
      setSelectedId(identityFarm?.breedingFarmId ?? persistedFarm?.breedingFarmId ?? (selection.breedingFarms.length === 1 ? selection.breedingFarms[0].breedingFarmId : undefined));
      setView(selection.breedingFarms.length === 0 ? { kind: "empty" } : { kind: "list", selection });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && recoverSession) {
        const refreshResult = await refresh();
        if (refreshResult.ok) await loadSelection(false);
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setView({ kind: "blocked", message: "Sua conta não tem permissão para consultar os criatórios disponíveis." });
        return;
      }

      setView({
        kind: "error",
        message: error instanceof ApiError && error.status >= 500
          ? "O serviço está indisponível no momento. Tente novamente em instantes."
          : "Verifique sua conexão e tente novamente."
      });
    }
  }, [identityFarmId, refresh]);

  useEffect(() => {
    if (searchReady) void loadSelection();
  }, [loadSelection, searchReady]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || view.kind !== "list") return;

    setFormError(undefined);
    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      const nextSelection = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms/selection", {
        body: JSON.stringify({ breedingFarmId: selectedId }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      });
      client.current!.setTenant(nextSelection.selectedBreedingFarmId ?? selectedId);
      const selectedFarm = nextSelection.breedingFarms.find((farm) => farm.breedingFarmId === selectedId) ?? view.selection.breedingFarms.find((farm) => farm.breedingFarmId === selectedId);
      if (selectedFarm) {
        setView(identityFarmId === selectedFarm.breedingFarmId
          ? { kind: "identity", farm: selectedFarm }
          : { kind: "success", farm: selectedFarm });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await refresh();
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setView({ kind: "blocked", message: "Sua conta não tem permissão para selecionar este criatório." });
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setFormError("Este criatório não está mais disponível. Atualize a lista e tente novamente.");
        return;
      }

      if (error instanceof StaleTenantResponseError) {
        setFormError("A seleção mudou em outra janela. Atualize a lista antes de continuar.");
        return;
      }

      setFormError("Não foi possível salvar sua escolha. Tente novamente em instantes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (view.kind === "loading") return <AppLoadingState label="Carregando criatórios" message="Só um instante enquanto recuperamos seu progresso." />;
  if (view.kind === "error") return <SelectionPanelState heading="Não foi possível carregar seus criatórios" message={view.message} onRetry={() => void loadSelection()} />;
  if (view.kind === "blocked") return <SelectionPanelState heading="Acesso bloqueado" message={view.message} onRetry={() => void loadSelection()} retryLabel="Verificar novamente" />;
  if (view.kind === "empty") return <EmptySelection onRetry={() => void loadSelection()} />;
  if (view.kind === "identity") return <VisualIdentityOnboarding farm={view.farm} />;
  if (view.kind === "success") return <SelectionSuccess farm={view.farm} />;

  return (
    <FarmSelectionForm
      formError={formError}
      isSubmitting={isSubmitting}
      onSelected={setSelectedId}
      onSubmit={handleSubmit}
      selectedId={selectedId}
      selection={view.selection}
    />
  );
}

function SelectionScreen() {
  const { error, refresh, status } = useAuth();

  if (status === "loading") return <AppLoadingState label="Carregando onboarding" message="Um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <SelectionState heading="Não foi possível abrir o onboarding" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <SelectionState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para continuar."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated") return <SelectionState heading="Entre para continuar" message="Faça login para retomar seu onboarding com segurança." />;

  return (
    <main className="auth-page onboarding-page farm-selection-page">
      <a className="skip-link" href="#conteudo-selecao-criatorio">Pular para o conteúdo</a>
      <div className="auth-shell onboarding-shell farm-selection-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-selecao-criatorio" className="auth-form-panel onboarding-form-panel">
          <div className="onboarding-form-content" id="conteudo-selecao-criatorio">
            <BreedingFarmSelection />
          </div>
        </section>
      </div>
    </main>
  );
}

export default function BreedingFarmSelectionPage() {
  return (
    <AuthProvider>
      <SelectionScreen />
    </AuthProvider>
  );
}
