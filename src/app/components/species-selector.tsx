"use client";

import React, { useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, createApiClient } from "../../lib/http/api-client";

export interface SpeciesSummary {
  popularName: string;
  scientificName: string;
  speciesId: string;
}

type SearchState = "empty" | "error" | "idle" | "loading" | "ready";

const MIN_SEARCH_LENGTH = 2;
const VISIBLE_RESULTS_LIMIT = 8;

interface SpeciesSelectorProps {
  onSessionExpired?: () => void;
  onSelected?: (species: SpeciesSummary | undefined) => void;
}

function messageForSearchFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Sua conta não tem permissão para consultar o catálogo de espécies.";
  }

  if (error instanceof ApiError && error.status >= 500) {
    return "O catálogo está indisponível no momento. Tente novamente em instantes.";
  }

  return "Verifique sua conexão e tente novamente.";
}

export function SpeciesSelector({ onSessionExpired, onSelected }: Readonly<SpeciesSelectorProps>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpeciesSummary[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesSummary>();
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestVersion = useRef(0);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient();

  useEffect(() => {
    const controller = new AbortController();
    const currentVersion = requestVersion.current + 1;
    requestVersion.current = currentVersion;
    const normalizedQuery = query.trim();
    const delay = 250;

    if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setErrorMessage(undefined);
      setSearchState("idle");
      return () => controller.abort();
    }

    setSearchState("loading");
    setErrorMessage(undefined);
    const timeoutId = window.setTimeout(async () => {
      try {
        const path = `api/species?search=${encodeURIComponent(normalizedQuery)}`;
        const species = await client.current!.request<SpeciesSummary[]>(path, { signal: controller.signal });

        if (controller.signal.aborted || currentVersion !== requestVersion.current) return;

        setResults(species);
        setSearchState(species.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted || currentVersion !== requestVersion.current) return;

        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired?.();
          return;
        }

        setSearchState("error");
        setErrorMessage(messageForSearchFailure(error));
      }
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [onSessionExpired, query, reloadVersion]);

  function selectSpecies(species: SpeciesSummary) {
    setSelectedSpecies(species);
    onSelected?.(species);
  }

  function clearSelection() {
    setSelectedSpecies(undefined);
    onSelected?.(undefined);
  }

  return (
    <div className="species-selector">
      <div className="species-search-header">
        <p className="eyebrow">Catálogo ativo</p>
        <h2 id="titulo-seletor-especie">Selecione a espécie</h2>
        <p className="lede">Pesquise pelo nome popular ou científico e escolha uma espécie existente no catálogo.</p>
      </div>

      <form className="species-search-form" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="species-search">Pesquisar espécie</label>
        <div className="species-search-control">
          <input
            aria-controls="species-results"
            aria-describedby="species-search-help"
            autoComplete="off"
            id="species-search"
            maxLength={100}
            minLength={MIN_SEARCH_LENGTH}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Sabiá ou Turdus"
            type="search"
            value={query}
          />
          {query && <button aria-label="Limpar busca" className="species-search-clear" onClick={() => setQuery("")} type="button">×</button>}
        </div>
        <p className="species-search-help" id="species-search-help">A seleção precisa ser feita a partir de um item do catálogo.</p>
      </form>

      <div aria-live="polite" className="species-results-region" id="species-results">
        {searchState === "loading" && (
          <div className="species-results-state" role="status">
            <span className="species-loading-dot" aria-hidden="true" />
            <span>{query ? "Buscando espécies…" : "Carregando espécies…"}</span>
          </div>
        )}

        {searchState === "idle" && (
          <div className="species-results-state" role="status">
            <strong>{query ? "Refine sua busca" : "Comece sua busca"}</strong>
            <span>{query ? "Digite pelo menos dois caracteres para consultar o catálogo." : "Digite o nome popular ou científico para encontrar uma espécie."}</span>
          </div>
        )}

        {searchState === "error" && (
          <div className="species-results-state species-results-error">
            <p role="alert">{errorMessage}</p>
            <button className="auth-secondary-action" onClick={() => setReloadVersion((version) => version + 1)} type="button">Tentar novamente</button>
          </div>
        )}

        {searchState === "empty" && (
          <div className="species-results-state" role="status">
            <strong>Nenhuma espécie encontrada.</strong>
            <span>{query ? "Tente buscar por outro nome popular ou científico." : "Não há espécies ativas disponíveis no momento."}</span>
          </div>
        )}

        {searchState === "ready" && (
          <>
            <ul aria-label="Resultados de espécies" className="species-results">
              {results.slice(0, VISIBLE_RESULTS_LIMIT).map((species) => (
                <li key={species.speciesId}>
                  <label
                    className={`species-option${selectedSpecies?.speciesId === species.speciesId ? " is-selected" : ""}`}
                  >
                    <input
                      checked={selectedSpecies?.speciesId === species.speciesId}
                      name="speciesId"
                      onChange={() => selectSpecies(species)}
                      type="radio"
                      value={species.speciesId}
                    />
                    <span className="species-option-copy">
                      <strong>{species.popularName}</strong>
                      <em>{species.scientificName}</em>
                    </span>
                    <span aria-hidden="true" className="species-option-check">✓</span>
                  </label>
                </li>
              ))}
            </ul>
            {results.length > VISIBLE_RESULTS_LIMIT && (
              <p className="species-results-limit" role="status">
                Mostrando os {VISIBLE_RESULTS_LIMIT} primeiros resultados. Refine a busca para encontrar outros.
              </p>
            )}
          </>
        )}
      </div>

      {selectedSpecies && (
        <div className="species-selected" role="status">
          <div>
            <span>Espécie selecionada</span>
            <strong>{selectedSpecies.popularName}</strong>
            <em>{selectedSpecies.scientificName}</em>
          </div>
          <button className="text-action" onClick={clearSelection} type="button">Remover seleção</button>
        </div>
      )}
    </div>
  );
}
