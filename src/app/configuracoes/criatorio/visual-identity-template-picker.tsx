"use client";

import React from "react";

export interface IdentityTemplateOption {
  key: string;
  type: string;
  required: boolean;
  default: string;
  values: string[];
}

export interface IdentityTemplate {
  id: string;
  name: string;
  version: string;
  previewUrl: string;
  aspectRatio: string;
  options: IdentityTemplateOption[];
}

export type IdentityTemplateLoadState = "error" | "loading" | "ready";

export function optionLabel(key: string): string {
  if (key === "subtitle") return "Subtítulo";
  if (key === "tagline") return "Frase de apoio";
  return key;
}

interface VisualIdentityTemplatePickerProps {
  error?: string;
  isMutating: boolean;
  isPreviewing: boolean;
  getPreviewUrl(url: string): string;
  loadError?: string;
  loadState: IdentityTemplateLoadState;
  onApply(): void;
  onChangeOption(option: IdentityTemplateOption, value: string): void;
  onGeneratePreview(): void;
  onRetry(): void;
  onSelect(template: IdentityTemplate): void;
  previewIsCurrent: boolean;
  previewUrl?: string;
  selectedTemplate?: IdentityTemplate;
  selectedTemplateId?: string;
  templateConfiguration: Record<string, string>;
  templates: IdentityTemplate[];
}

export function VisualIdentityTemplatePicker({
  error,
  isMutating,
  isPreviewing,
  getPreviewUrl,
  loadError,
  loadState,
  onApply,
  onChangeOption,
  onGeneratePreview,
  onRetry,
  onSelect,
  previewIsCurrent,
  previewUrl,
  selectedTemplate,
  selectedTemplateId,
  templateConfiguration,
  templates
}: Readonly<VisualIdentityTemplatePickerProps>) {
  return (
    <div className="farm-identity-template-picker-content">
      {error && <p className="form-error" role="alert">{error}</p>}
      {loadState === "loading" && <p aria-live="polite" className="farm-identity-feedback">Carregando modelos…</p>}
      {loadState === "error" && (
        <div className="farm-identity-feedback">
          <p role="alert">{loadError}</p>
          <button className="farm-identity-secondary-action" disabled={isMutating || isPreviewing} onClick={onRetry} type="button">Tentar novamente</button>
        </div>
      )}
      {loadState === "ready" && templates.length === 0 && <p className="farm-identity-feedback">Nenhum modelo está disponível no momento.</p>}
      {loadState === "ready" && templates.length > 0 && (
        <div aria-label="Modelos de identidade visual" className="farm-identity-template-gallery" role="group">
          {templates.map((template) => (
            <button
              aria-pressed={selectedTemplateId === template.id}
              className="farm-identity-template-option"
              disabled={isMutating || isPreviewing}
              key={`${template.id}-${template.version}`}
              onClick={() => onSelect(template)}
              type="button"
            >
              <img alt={`Prévia ilustrativa do modelo ${template.name}, com texto demonstrativo`} src={getPreviewUrl(template.previewUrl)} />
              <span className="farm-identity-template-name">{template.name}</span>
              <span className="farm-identity-template-version">Versão {template.version} · {template.aspectRatio}</span>
            </button>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <div className="farm-identity-template-configuration">
          <h4>Personalizar {selectedTemplate.name}</h4>
          <p className="farm-identity-help">Os controles abaixo correspondem às opções declaradas por este modelo. O padrão do modelo aparece preenchido.</p>
          {selectedTemplate.options.length > 0 && (
            <fieldset className="farm-identity-template-fields">
              <legend>Opções deste modelo</legend>
              {selectedTemplate.options.map((option) => (
                <div className="farm-identity-template-field" key={option.key}>
                  {option.type === "enum" ? (
                    <label htmlFor={`farm-identity-option-${option.key}`}>
                      {optionLabel(option.key)}
                      <select
                        id={`farm-identity-option-${option.key}`}
                        disabled={isMutating || isPreviewing}
                        onChange={(event) => onChangeOption(option, event.currentTarget.value)}
                        required={option.required}
                        value={templateConfiguration[option.key] ?? option.default}
                      >
                        {option.values.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  ) : option.type === "text" ? (
                    <label htmlFor={`farm-identity-option-${option.key}`}>
                      {optionLabel(option.key)}
                      <input
                        autoComplete="off"
                        id={`farm-identity-option-${option.key}`}
                        maxLength={120}
                        disabled={isMutating || isPreviewing}
                        onChange={(event) => onChangeOption(option, event.currentTarget.value)}
                        required={option.required}
                        value={templateConfiguration[option.key] ?? option.default}
                      />
                    </label>
                  ) : (
                    <p className="farm-identity-help">{optionLabel(option.key)} é definida pelo modelo.</p>
                  )}
                </div>
              ))}
            </fieldset>
          )}
          <div className="farm-identity-template-actions">
            <button className="farm-identity-secondary-action" disabled={isPreviewing || isMutating} onClick={onGeneratePreview} type="button">
              {isPreviewing ? "Gerando prévia…" : previewIsCurrent ? "Atualizar prévia" : "Gerar prévia"}
            </button>
            {previewUrl && previewIsCurrent && (
              <>
                <img alt={`Prévia de ${selectedTemplate.name} com as opções escolhidas`} className="farm-identity-template-render" src={previewUrl} />
                <button className="farm-identity-primary-action" disabled={isMutating || isPreviewing} onClick={onApply} type="button">Aplicar modelo</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
