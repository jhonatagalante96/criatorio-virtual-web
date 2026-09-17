"use client";

import React from "react";

export interface CoverTemplate {
  canvas: { aspectRatio: string; height: number; width: number };
  defaults: Record<string, unknown>;
  id: string;
  name: string;
  previewUrl: string;
  safeArea: { description: string; height: number; width: number; x: number; y: number };
  supportedOptions: string[];
  version: number;
}

export type CoverConfiguration = Record<string, string | boolean | null>;
export type CoverTemplateLoadState = "error" | "loading" | "ready";

const optionLabels: Record<string, string> = {
  accentColor: "Cor de destaque",
  badgeText: "Texto do selo",
  logoAssetId: "Identidade visual",
  name: "Nome do criatório",
  showBadge: "Exibir selo",
  showLogo: "Exibir identidade visual",
  tagline: "Frase de apoio"
};

interface CoverTemplatePickerProps {
  configuration: CoverConfiguration;
  error?: string;
  isPreviewing: boolean;
  loadError?: string;
  loadState: CoverTemplateLoadState;
  onChangeOption(key: string, value: string | boolean | null): void;
  onRetry(): void;
  onSelect(template: CoverTemplate): void;
  previewIsCurrent: boolean;
  previewUrl?: string;
  selectedTemplate?: CoverTemplate;
  selectedTemplateId?: string;
  templates: CoverTemplate[];
  toPreviewUrl(url: string): string;
}

function controlForOption(
  key: string,
  value: string | boolean | null | undefined,
  onChange: (nextValue: string | boolean | null) => void,
  disabled: boolean
) {
  if (key === "showLogo" || key === "showBadge") {
    return <input checked={value === true} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />;
  }

  if (key === "logoAssetId") {
    return (
      <select disabled={disabled} onChange={(event) => onChange(event.currentTarget.value || null)} value={typeof value === "string" ? value : ""}>
        <option value="">Não usar</option>
        <option value="current">Usar a identidade visual atual</option>
      </select>
    );
  }

  if (key === "accentColor") {
    return <input aria-label={optionLabels[key]} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} type="color" value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#48643a"} />;
  }

  const maxLength = key === "name" ? 80 : key === "badgeText" ? 32 : 120;
  return (
    <input
      autoComplete="off"
      disabled={disabled}
      maxLength={maxLength}
      onChange={(event) => onChange(event.currentTarget.value)}
      required={key === "name"}
      value={typeof value === "string" ? value : ""}
    />
  );
}

export function CoverTemplatePicker({
  configuration,
  error,
  isPreviewing,
  loadError,
  loadState,
  onChangeOption,
  onRetry,
  onSelect,
  previewIsCurrent,
  previewUrl,
  selectedTemplate,
  selectedTemplateId,
  templates,
  toPreviewUrl
}: Readonly<CoverTemplatePickerProps>) {
  return (
    <div className="farm-cover-template-picker">
      {error && <p className="form-error" role="alert">{error}</p>}
      {loadState === "loading" && <p aria-live="polite" className="farm-identity-feedback">Carregando modelos de capa…</p>}
      {loadState === "error" && (
        <div className="farm-identity-feedback">
          <p role="alert">{loadError}</p>
          <button className="farm-identity-secondary-action" disabled={isPreviewing} onClick={onRetry} type="button">Tentar novamente</button>
        </div>
      )}
      {loadState === "ready" && templates.length === 0 && <p className="farm-identity-feedback">Nenhum modelo de capa está disponível no momento.</p>}
      {loadState === "ready" && templates.length > 0 && (
        <div aria-label="Modelos de capa" className="farm-cover-template-gallery" role="group">
          {templates.map((template) => (
            <button
              aria-pressed={selectedTemplateId === template.id}
              className="farm-cover-template-option"
              disabled={isPreviewing}
              key={`${template.id}-${template.version}`}
              onClick={() => onSelect(template)}
              type="button"
            >
              <img alt={`Prévia ilustrativa do modelo de capa ${template.name}`} src={toPreviewUrl(template.previewUrl)} />
              <span className="farm-cover-template-name">{template.name}</span>
              <span className="farm-cover-template-version">Versão {template.version} · {template.canvas.aspectRatio}</span>
            </button>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <section aria-label={`Personalizar ${selectedTemplate.name}`} className="farm-cover-template-configuration">
          <div>
            <h4>Personalizar {selectedTemplate.name}</h4>
            <p className="farm-identity-help">A prévia será atualizada quando você alterar uma opção. O modelo define quais controles aparecem.</p>
          </div>
          <fieldset className="farm-cover-template-fields">
            <legend>Opções deste modelo</legend>
            {selectedTemplate.supportedOptions.filter((key) => optionLabels[key]).map((key) => (
              <label className={`farm-cover-template-field${key === "showLogo" || key === "showBadge" ? " is-toggle" : ""}`} key={key}>
                <span>{optionLabels[key]}</span>
                {controlForOption(key, configuration[key], (value) => onChangeOption(key, value), isPreviewing)}
              </label>
            ))}
          </fieldset>
          <p className="farm-cover-safe-area-note">A área central destacada permanece visível nas telas de computador e celular.</p>
          {isPreviewing && <p aria-live="polite" className="farm-identity-feedback">Atualizando prévia…</p>}
          {previewUrl && selectedTemplate && (
            <div className="farm-cover-preview-layout">
              <figure className="farm-cover-desktop-preview">
                <figcaption>Prévia para desktop · {selectedTemplate.canvas.width} × {selectedTemplate.canvas.height}</figcaption>
                <div className="farm-cover-preview-frame">
                  <img alt={`Prévia de ${selectedTemplate.name} com as opções escolhidas`} src={previewUrl} />
                  <span
                    aria-hidden="true"
                    className="farm-cover-safe-area"
                    style={{
                      height: `${selectedTemplate.safeArea.height * 100}%`,
                      left: `${selectedTemplate.safeArea.x * 100}%`,
                      top: `${selectedTemplate.safeArea.y * 100}%`,
                      width: `${selectedTemplate.safeArea.width * 100}%`
                    }}
                  />
                </div>
                <small>{selectedTemplate.safeArea.description}</small>
              </figure>
              <figure className="farm-cover-mobile-preview">
                <figcaption>Recorte para celular</figcaption>
                <div><img alt="Recorte central da mesma capa em uma tela de celular" src={previewUrl} /></div>
              </figure>
            </div>
          )}
          {previewIsCurrent && <p className="farm-identity-feedback" role="status">Prévia pronta. A capa ainda não foi aplicada.</p>}
        </section>
      )}
    </div>
  );
}
