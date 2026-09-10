"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, createApiClient } from "../../lib/http/api-client";
import { validatePassword, validatePasswordConfirmation } from "../../lib/auth/password-validation";
import { BrandLockup, BrandPanel } from "../components/brand";
import { PasswordField } from "../components/password-field";

interface ChangePasswordFields {
  confirmPassword?: string;
  currentPassword?: string;
  newPassword?: string;
}

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function SettingsState({
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
    <main className="auth-page">
      <div className="auth-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-configuracoes" className="auth-form-panel">
          <div className="auth-form-content auth-state-card">
            <BrandLockup stacked />
            <h1 id="titulo-configuracoes" ref={headingRef} tabIndex={-1}>{heading}</h1>
            <p className="lede">{message}</p>
            {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
            <a className="text-action" href="/login">Voltar para o login</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function ChangePasswordForm({ onLocalPasswordUnavailable }: Readonly<{ onLocalPasswordUnavailable: () => void }>) {
  const { refresh } = useAuth();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState<ChangePasswordFields>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  function validateForm(): ChangePasswordFields {
    const nextErrors: ChangePasswordFields = {};
    if (!currentPassword) nextErrors.currentPassword = "Informe sua senha atual.";
    const newPasswordError = validatePassword(newPassword);
    const confirmationError = validatePasswordConfirmation(newPassword, confirmPassword);
    if (newPasswordError) nextErrors.newPassword = newPasswordError;
    if (confirmationError) nextErrors.confirmPassword = confirmationError;
    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateForm();
    setErrors(validationErrors);
    setFormError(undefined);
    setSuccessMessage(undefined);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/change-password", {
        body: JSON.stringify({ confirmPassword, currentPassword, newPassword }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      setSuccessMessage("Senha alterada com sucesso. Use a nova senha no próximo login.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await refresh();
        setFormError("Sua sessão expirou. Entre novamente para continuar.");
      } else if (error instanceof ApiError && error.status === 400 && error.message.includes("local password")) {
        onLocalPasswordUnavailable();
      } else if (error instanceof ApiError && error.status === 400 && error.message.includes("current password")) {
        setFormError("A senha atual está incorreta.");
      } else if (error instanceof ApiError && error.fields.newPassword?.[0]) {
        setErrors({ newPassword: "A senha nova não atende à política de segurança." });
      } else if (error instanceof ApiError && error.fields.confirmPassword?.[0]) {
        setErrors({ confirmPassword: "As senhas não coincidem." });
      } else {
        setFormError("Não foi possível alterar sua senha agora. Tente novamente em instantes.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="settings-password-form" noValidate onSubmit={handleSubmit}>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {successMessage && <p className="confirmation-feedback" role="status">{successMessage}</p>}
      <PasswordField
        autoComplete="current-password"
        disabled={isSubmitting}
        error={errors.currentPassword}
        id="current-password"
        label="Senha atual"
        name="currentPassword"
        onChange={(event) => {
          setCurrentPassword(event.target.value);
          setErrors((current) => ({ ...current, currentPassword: undefined }));
        }}
        placeholder="Digite sua senha atual"
        value={currentPassword}
      />
      <PasswordField
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.newPassword}
        id="settings-new-password"
        label="Senha nova"
        name="newPassword"
        onChange={(event) => {
          setNewPassword(event.target.value);
          setErrors((current) => ({ ...current, newPassword: undefined }));
        }}
        placeholder="Crie uma senha forte"
        value={newPassword}
      />
      <PasswordField
        autoComplete="new-password"
        disabled={isSubmitting}
        error={errors.confirmPassword}
        id="settings-confirm-password"
        label="Confirmar senha nova"
        name="confirmPassword"
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setErrors((current) => ({ ...current, confirmPassword: undefined }));
        }}
        placeholder="Repita sua senha"
        value={confirmPassword}
      />
      <p className="password-hint">Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</p>
      <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}

function AccountSettings() {
  const { authenticationProvider, session } = useAuth();
  const [providerDetected, setProviderDetected] = useState(false);
  const isGoogleAccount = authenticationProvider === "google" || providerDetected;

  if (!session) return null;

  return (
    <main className="settings-page">
      <a className="skip-link" href="#conteudo-configuracoes">Pular para o conteúdo</a>
      <div className="settings-shell">
        <BrandPanel />
        <section className="settings-content" id="conteudo-configuracoes">
          <a className="settings-back" href="/login"><BackIcon /> Voltar</a>
          <header className="settings-header">
            <div>
              <p className="eyebrow">Sua conta</p>
              <h1>Configurações</h1>
              <p>Gerencie seus dados de acesso com segurança.</p>
            </div>
            <BrandLockup />
          </header>

          <div className="settings-grid">
            <aside className="settings-account-card">
              <span className="settings-avatar" aria-hidden="true">{session.email.slice(0, 1).toUpperCase()}</span>
              <p className="eyebrow">Conta conectada</p>
              <h2>{session.email}</h2>
              <p>{session.emailConfirmed ? "E-mail confirmado" : "E-mail ainda não confirmado"}</p>
              <div className="settings-provider">
                <span aria-hidden="true" className="settings-provider-icon">{isGoogleAccount ? "G" : "@"}</span>
                <span>
                  <strong>Método de acesso</strong>
                  <small>{isGoogleAccount ? "Google" : "E-mail e senha"}</small>
                </span>
              </div>
            </aside>

            <section aria-labelledby="titulo-seguranca" className="settings-card">
              <p className="eyebrow">Segurança</p>
              <h2 id="titulo-seguranca">Alterar senha</h2>
              {isGoogleAccount ? (
                <div className="settings-provider-message" role="status">
                  <strong>Sua conta usa o Google</strong>
                  <p>Este acesso não possui uma senha local para alterar. Continue usando o Google para entrar.</p>
                </div>
              ) : (
                <>
                  <p className="settings-card-description">Confirme sua senha atual e escolha uma nova senha para proteger sua conta.</p>
                  <ChangePasswordForm onLocalPasswordUnavailable={() => setProviderDetected(true)} />
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingsScreen() {
  const { error, refresh, status } = useAuth();

  if (status === "loading") return <SettingsState heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <SettingsState heading="Não foi possível carregar as configurações" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <SettingsState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated") return <SettingsState heading="Entre para acessar as configurações" message="Faça login para gerenciar a segurança da sua conta." />;
  return <AccountSettings />;
}

export default function SettingsPage() {
  return (
    <AuthProvider>
      <SettingsScreen />
    </AuthProvider>
  );
}
