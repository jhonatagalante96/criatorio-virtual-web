"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../../lib/auth/auth-context";
import { BrandLockup } from "../../components/brand";
import { SpeciesSelector, SpeciesSummary } from "../../components/species-selector";

function SpeciesAccessState({
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
    <main className="auth-page species-selection-page">
      <a className="skip-link" href="#conteudo-selecao-especie">Pular para o conteúdo</a>
      <div className="auth-shell species-selection-shell">
        <section aria-labelledby="titulo-selecao-especie-estado" className="auth-form-panel species-selection-panel">
          <div className="auth-form-content auth-state-card" id="conteudo-selecao-especie">
            <BrandLockup stacked />
            <h1 id="titulo-selecao-especie-estado" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <a className="text-action" href="/login">Voltar para o login</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function SpeciesSelectionSuccess({ species, onChange }: Readonly<{ species: SpeciesSummary; onChange: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="species-selection-success">
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <div aria-hidden="true" className="onboarding-success-icon">✓</div>
      <p className="eyebrow">Seleção concluída</p>
      <h1 id="titulo-selecao-especie" ref={headingRef} tabIndex={-1}>Espécie pronta para o próximo passo.</h1>
      <p className="lede"><strong>{species.popularName}</strong> · <em>{species.scientificName}</em></p>
      <button className="auth-primary-action" onClick={onChange} type="button">Escolher outra espécie</button>
    </div>
  );
}

function SpeciesSelectionScreen() {
  const { error, refresh, status } = useAuth();
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesSummary>();
  const [confirmedSpecies, setConfirmedSpecies] = useState<SpeciesSummary>();
  const handleSessionExpired = useCallback(() => { void refresh(); }, [refresh]);

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <SpeciesAccessState heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
  }

  if (status === "error") {
    return <SpeciesAccessState heading="Não foi possível abrir o catálogo" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  }

  if (status === "forbidden") {
    return <SpeciesAccessState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para consultar o catálogo."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  }

  if (status === "unauthenticated") {
    return <SpeciesAccessState heading="Entre para continuar" message="Faça login para selecionar uma espécie do catálogo." />;
  }

  if (confirmedSpecies) {
    return (
      <main className="auth-page species-selection-page">
        <a className="skip-link" href="#conteudo-selecao-especie">Pular para o conteúdo</a>
        <div className="auth-shell species-selection-shell">
          <section aria-labelledby="titulo-selecao-especie" className="auth-form-panel species-selection-panel">
            <div className="auth-form-content" id="conteudo-selecao-especie">
              <SpeciesSelectionSuccess onChange={() => { setConfirmedSpecies(undefined); setSelectedSpecies(undefined); }} species={confirmedSpecies} />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page species-selection-page">
      <a className="skip-link" href="#conteudo-selecao-especie">Pular para o conteúdo</a>
      <div className="auth-shell species-selection-shell">
        <section aria-labelledby="titulo-seletor-especie" className="auth-form-panel species-selection-panel">
          <div className="auth-form-content" id="conteudo-selecao-especie">
            <a className="auth-mobile-back" href="/" aria-label="Voltar para o início">←</a>
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <SpeciesSelector onSelected={setSelectedSpecies} onSessionExpired={handleSessionExpired} />
            <button
              className="auth-primary-action species-confirm-action"
              disabled={!selectedSpecies}
              onClick={() => { if (selectedSpecies) setConfirmedSpecies(selectedSpecies); }}
              type="button"
            >
              Confirmar espécie
            </button>
            <p className="auth-footer">Escolha uma espécie ativa para continuar o cadastro da ave.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function SpeciesSelectionPage() {
  return (
    <AuthProvider>
      <SpeciesSelectionScreen />
    </AuthProvider>
  );
}
