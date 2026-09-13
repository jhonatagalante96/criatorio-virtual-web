"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { ApiClient, ApiError, createApiClient } from "../../lib/http/api-client";
import { passwordPolicyMessage, validatePassword, validatePasswordConfirmation } from "../../lib/auth/password-validation";
import { AppLoadingState } from "../components/app-loading-state";
import { AuthenticatedShell } from "../components/authenticated-shell";
import { BrandLockup, BrandPanel } from "../components/brand";
import { DashboardIcon } from "../components/dashboard-icons";
import { PasswordField } from "../components/password-field";

interface ChangePasswordFields {
  confirmPassword?: string;
  currentPassword?: string;
  newPassword?: string;
}

type SettingsSection = "overview" | "account" | "security" | "session";

function settingsSectionFromParams(params: { get: (name: string) => string | null }): SettingsSection {
  const section = params.get("section");
  return section === "account" || section === "security" || section === "session" ? section : "overview";
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "Criador";
  return localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Criador";
}

function SettingsState({ heading, message, onRetry, retryLabel = "Tentar novamente" }: Readonly<{ heading: string; message: string; onRetry?: () => void; retryLabel?: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

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
            <Link className="text-action" href="/login">Voltar para o login</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingsBreadcrumb({ current }: Readonly<{ current?: string }>) {
  return (
    <nav aria-label="Navegação estrutural" className="settings-breadcrumb">
      <Link href="/dashboard">Dashboard</Link><span aria-hidden="true">›</span>
      {current ? <><Link href="/configuracoes">Configurações</Link><span aria-hidden="true">›</span><span aria-current="page">{current}</span></> : <span aria-current="page">Configurações</span>}
    </nav>
  );
}

function SettingsHeader({ eyebrow, title, description }: Readonly<{ eyebrow?: string; title: string; description: string }>) {
  return <header className="settings-page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div></header>;
}

function SettingsFrame({ children, current }: Readonly<{ children: React.ReactNode; current?: string }>) {
  return <div className="settings-view"><SettingsBreadcrumb current={current} />{children}</div>;
}

function SettingsOptionCard({ description, icon, href, title, tone }: Readonly<{ description: string; icon: "logout" | "shield" | "user"; href: string; title: string; tone: string }>) {
  return <Link className={`settings-option-card settings-option-${tone}`} href={href}><span aria-hidden="true" className="settings-option-icon"><DashboardIcon name={icon} /></span><span className="settings-option-copy"><strong>{title}</strong><span>{description}</span></span><span aria-hidden="true" className="settings-option-arrow">›</span></Link>;
}

function SettingsOverview() {
  return (
    <SettingsFrame>
      <SettingsHeader title="Configurações" description="Gerencie sua conta e mantenha seus dados sempre seguros." />
      <section aria-labelledby="titulo-opcoes-configuracoes" className="settings-overview-panel">
        <h2 id="titulo-opcoes-configuracoes">Acesso rápido</h2>
        <div className="settings-options-grid">
          <SettingsOptionCard description="Veja e edite os dados da sua conta." href="/configuracoes?section=account" icon="user" title="Minha conta" tone="account" />
          <SettingsOptionCard description="Altere sua senha ou gerencie o login com Google." href="/configuracoes?section=security" icon="shield" title="Segurança" tone="security" />
          <SettingsOptionCard description="Veja os detalhes e encerre sua sessão." href="/configuracoes?section=session" icon="logout" title="Sessão" tone="session" />
        </div>
      </section>
    </SettingsFrame>
  );
}

function AccountView() {
  const { authenticationProvider, session } = useAuth();
  const [resendState, setResendState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [resendMessage, setResendMessage] = useState<string>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);
  if (!session) return null;

  const currentSession = session;
  const displayName = displayNameFromEmail(currentSession.email);
  const providerLabel = authenticationProvider === "google" ? "Conta Google" : "Conta padrão (e-mail e senha)";

  async function resendConfirmation() {
    setResendState("pending");
    setResendMessage(undefined);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await client.current!.request<void>("api/auth/confirm-email/resend", { body: JSON.stringify({ email: currentSession.email }), headers: { "content-type": "application/json" }, method: "POST" });
      setResendState("success"); setResendMessage("Enviamos um novo link de confirmação para seu e-mail.");
    } catch (error) {
      setResendState("error");
      if (error instanceof ApiError && error.status === 429) setResendMessage("Aguarde alguns instantes antes de solicitar outro e-mail.");
      else if (error instanceof ApiError && error.status >= 500) setResendMessage("O serviço de e-mail está indisponível no momento. Tente novamente mais tarde.");
      else setResendMessage("Não foi possível reenviar a confirmação agora. Tente novamente.");
    }
  }

  return (
    <SettingsFrame current="Minha conta">
      <SettingsHeader title="Minha conta" description="Seus dados e informações da conta." />
      <section aria-labelledby="titulo-minha-conta" className="settings-detail-panel">
        <div className="settings-detail-heading">
          <div className="settings-profile-identity"><span aria-hidden="true" className="settings-profile-avatar"><img alt="" src="/assets/brand/png/criatorio-virtual-symbol.png" /></span><div><h2 id="titulo-minha-conta">{displayName}</h2><p>{session.email}</p></div></div>
          <button className="settings-outline-action" disabled title="A edição dos dados da conta será disponibilizada em uma próxima etapa." type="button">Editar dados</button>
        </div>
        <div className="settings-profile-status-row"><span className={session.emailConfirmed ? "settings-status settings-status-success" : "settings-status settings-status-warning"}><span aria-hidden="true" />{session.emailConfirmed ? "E-mail confirmado" : "Aguardando confirmação"}</span>{!session.emailConfirmed && <button className="settings-confirm-action" disabled={resendState === "pending"} onClick={() => void resendConfirmation()} type="button">{resendState === "pending" ? "Enviando…" : "Reenviar confirmação"}</button>}</div>
        {resendMessage && <p className={resendState === "error" ? "form-error" : "confirmation-feedback"} role={resendState === "error" ? "alert" : "status"}>{resendMessage}</p>}
        <dl className="settings-profile-details"><div><dt>Tipo de conta</dt><dd>{providerLabel}</dd></div><div><dt>Membro desde</dt><dd>Não informado</dd></div></dl>
      </section>
    </SettingsFrame>
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
    setErrors(validationErrors); setFormError(undefined); setSuccessMessage(undefined);
    if (Object.keys(validationErrors).length > 0) return;
    setIsSubmitting(true);
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
      await client.current!.request<void>("api/auth/change-password", { body: JSON.stringify({ confirmPassword, currentPassword, newPassword }), headers: { "content-type": "application/json" }, method: "POST" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setErrors({}); setSuccessMessage("Senha alterada com sucesso. Use a nova senha no próximo login.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { await refresh(); setFormError("Sua sessão expirou. Entre novamente para continuar."); }
      else if (error instanceof ApiError && error.status === 400 && error.message.includes("local password")) onLocalPasswordUnavailable();
      else if (error instanceof ApiError && error.status === 400 && error.message.includes("current password")) setFormError("A senha atual está incorreta.");
      else if (error instanceof ApiError && error.fields.newPassword?.[0]) setErrors({ newPassword: "A senha nova não atende à política de segurança." });
      else if (error instanceof ApiError && error.fields.confirmPassword?.[0]) setErrors({ confirmPassword: "As senhas não coincidem." });
      else setFormError("Não foi possível alterar sua senha agora. Tente novamente em instantes.");
    } finally { setIsSubmitting(false); }
  }

  return (
    <form className="settings-password-form" noValidate onSubmit={handleSubmit}>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {successMessage && <p className="confirmation-feedback" role="status">{successMessage}</p>}
      <PasswordField autoComplete="current-password" disabled={isSubmitting} error={errors.currentPassword} id="current-password" label="Senha atual" name="currentPassword" onChange={(event) => { setCurrentPassword(event.target.value); setErrors((current) => ({ ...current, currentPassword: undefined })); }} placeholder="Digite sua senha atual" value={currentPassword} />
      <PasswordField autoComplete="new-password" disabled={isSubmitting} error={errors.newPassword} id="settings-new-password" label="Senha nova" name="newPassword" onChange={(event) => { setNewPassword(event.target.value); setErrors((current) => ({ ...current, newPassword: undefined })); }} placeholder="Crie uma senha forte" value={newPassword} />
      <PasswordField autoComplete="new-password" disabled={isSubmitting} error={errors.confirmPassword} id="settings-confirm-password" label="Confirmar senha nova" name="confirmPassword" onChange={(event) => { setConfirmPassword(event.target.value); setErrors((current) => ({ ...current, confirmPassword: undefined })); }} placeholder="Repita sua senha" value={confirmPassword} />
      <p className="password-hint">{passwordPolicyMessage}</p>
      <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">{isSubmitting ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}

function SecurityView() {
  const { authenticationProvider } = useAuth();
  const [providerDetected, setProviderDetected] = useState(false);
  const isGoogleAccount = authenticationProvider === "google" || providerDetected;

  return (
    <SettingsFrame current="Segurança">
      <SettingsHeader title="Segurança" description="Altere sua senha ou gerencie o login da sua conta." />
      <section aria-labelledby="titulo-seguranca" className="settings-detail-panel settings-security-panel">
        <div className="settings-detail-heading"><div><p className="eyebrow">Proteção da conta</p><h2 id="titulo-seguranca">{isGoogleAccount ? "Login com Google" : "Alterar senha"}</h2></div></div>
        {isGoogleAccount ? <div className="settings-provider-message settings-google-message" role="status"><span aria-hidden="true" className="settings-google-mark">G</span><div><strong>Sua conta utiliza login com Google</strong><p>Este acesso não possui uma senha local para alterar. Continue usando o Google para entrar com segurança.</p></div></div> : <><p className="settings-card-description">Confirme sua senha atual e escolha uma nova senha para proteger sua conta.</p><ChangePasswordForm onLocalPasswordUnavailable={() => setProviderDetected(true)} /></>}
      </section>
    </SettingsFrame>
  );
}

function SessionView() {
  const { error, logout, session, status } = useAuth();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();

  useEffect(() => {
    if (!dialogOpen) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setDialogOpen(false); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  if (!session) return null;

  async function confirmLogout() {
    setLogoutError(undefined);
    const result = await logout();
    if (!result.ok) setLogoutError(result.error ?? "Não foi possível sair agora. Tente novamente.");
    else router.replace("/login");
  }

  return (
    <SettingsFrame current="Sessão">
      <SettingsHeader title="Sessão" description="Veja os detalhes da sua sessão atual ou encerre o acesso quando quiser." />
      <section aria-labelledby="titulo-sessao" className="settings-detail-panel settings-session-panel">
        <div className="settings-detail-heading"><div><p className="eyebrow">Dispositivo atual</p><h2 id="titulo-sessao">Sessão ativa</h2></div><span className="settings-status settings-status-success"><span aria-hidden="true" />Ativa</span></div>
        <div className="settings-session-device"><span aria-hidden="true" className="settings-session-icon"><DashboardIcon name="device" /></span><div><strong>Navegador atual</strong><p>Esta é a sessão que você está usando agora.</p><small>{session.email}</small></div></div>
        {logoutError && <div className="form-error" role="alert">{logoutError}</div>}
        {error && status === "authenticated" && <div className="form-error" role="alert">{error}</div>}
        <button className="settings-danger-action" disabled={status === "signing-out"} onClick={() => setDialogOpen(true)} type="button"><DashboardIcon name="logout" />{status === "signing-out" ? "Saindo…" : "Sair da conta"}</button>
      </section>
      {dialogOpen && <div aria-label="Confirmar saída" className="settings-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section aria-describedby="descricao-confirmacao-saida" aria-labelledby="titulo-confirmacao-saida" aria-modal="true" className="settings-dialog" role="dialog"><span aria-hidden="true" className="settings-dialog-icon"><DashboardIcon name="logout" /></span><h2 id="titulo-confirmacao-saida">Confirmar saída</h2><p id="descricao-confirmacao-saida">Tem certeza que deseja sair da sua conta? Você precisará fazer login novamente para acessar o sistema.</p><div className="settings-dialog-actions"><button autoFocus className="settings-cancel-action" onClick={() => setDialogOpen(false)} type="button">Cancelar</button><button className="settings-danger-action" disabled={status === "signing-out"} onClick={() => void confirmLogout()} type="button">{status === "signing-out" ? "Saindo…" : "Sair"}</button></div></section></div>}
    </SettingsFrame>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const section = settingsSectionFromParams(searchParams);
  if (section === "account") return <AccountView />;
  if (section === "security") return <SecurityView />;
  if (section === "session") return <SessionView />;
  return <SettingsOverview />;
}

function AccountSettings() {
  const { session } = useAuth();
  if (!session) return null;
  return <AuthenticatedShell activeNav="settings" email={session.email} farmName="Criatório Virtual"><SettingsContent /></AuthenticatedShell>;
}

function SettingsScreen() {
  const { error, refresh, session, status } = useAuth();
  if (status === "loading" || status === "authenticating" || status === "signing-out") return <AppLoadingState activeNav="settings" email={session?.email} label="Carregando configurações" message="Um instante enquanto verificamos seu acesso." />;
  if (status === "error") return <SettingsState heading="Não foi possível carregar as configurações" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />;
  if (status === "forbidden") return <SettingsState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />;
  if (status === "unauthenticated" || !session) return <SettingsState heading="Entre para acessar as configurações" message="Faça login para gerenciar a segurança da sua conta." />;
  return <AccountSettings />;
}

export default function SettingsPage() {
  return <AuthProvider><SettingsScreen /></AuthProvider>;
}
