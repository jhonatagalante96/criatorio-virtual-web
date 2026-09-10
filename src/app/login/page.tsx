"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "../../lib/auth/auth-context";
import { getApiUrl } from "../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../components/brand";
import { GoogleAuthenticationCallback, googleAuthenticationMessageType, googleAuthenticationWindowName } from "../components/google-authentication-callback";

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

function MailIcon() {
  return <img src="/assets/icons/ui/mail.svg" alt="" aria-hidden="true" />;
}

function LockIcon() {
  return <img src="/assets/icons/ui/lock.svg" alt="" aria-hidden="true" />;
}

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function EyeIcon() {
  return <img src="/assets/icons/ui/eye.svg" alt="" aria-hidden="true" />;
}

function GoogleMark() {
  return <img src="/assets/icons/ui/google.svg" alt="" aria-hidden="true" className="google-mark" />;
}

function validateForm(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  if (!email.trim()) errors.email = "Informe seu e-mail.";
  else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Informe um e-mail válido.";
  if (!password) errors.password = "Informe sua senha.";
  return errors;
}

const googleErrorMessages: Record<string, string> = {
  account_provisioning_failed: "Não foi possível criar sua conta com Google. Tente novamente mais tarde.",
  account_unavailable: "Sua conta está indisponível para entrada com Google no momento.",
  email_conflict: "Esta conta Google já está cadastrada. Entre com e-mail e senha ou recupere seu acesso.",
  email_missing: "O Google não retornou um e-mail válido. Tente novamente com outra conta.",
  email_unverified: "O e-mail da sua conta Google precisa estar verificado para entrar.",
  external_login_unavailable: "A entrada com Google está indisponível no momento. Tente novamente mais tarde.",
  google_account_already_exists: "Esta conta Google já está cadastrada. Entre com e-mail e senha ou recupere seu acesso.",
  google_authentication_failed: "Não foi possível autenticar com Google. Tente novamente.",
  google_authentication_unavailable: "A entrada com Google está indisponível no momento. Tente novamente mais tarde.",
  remote_provider_failure: "Não foi possível concluir a autenticação com Google. Tente novamente."
};
function messageForGoogleFailure(code?: string): string {
  return (code && googleErrorMessages[code]) ?? "Não foi possível concluir a entrada com Google. Tente novamente.";
}

function AuthState({
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
    <div className="auth-state-card" aria-live="polite">
      <BrandLockup stacked />
      <h1 ref={headingRef} tabIndex={-1}>{heading}</h1>
      <p className="lede">{message}</p>
      {onRetry && <button className="auth-secondary-action" onClick={onRetry} type="button">{retryLabel}</button>}
      <a className="text-action" href="/">Voltar para a página inicial</a>
    </div>
  );
}

function SessionPanel({ logoutButtonRef, onRequestLogout }: Readonly<{ logoutButtonRef: React.RefObject<HTMLButtonElement | null>; onRequestLogout: () => void }>) {
  const { error, session, status } = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (!session) return null;

  return (
    <div className="session-card">
      <BrandLockup stacked />
      <p className="eyebrow">Sessão restaurada</p>
      <h1 ref={headingRef} tabIndex={-1}>Olá, você está conectado.</h1>
      <p className="lede">Sua conta está pronta para continuar no Criatório Virtual.</p>
      <div className="session-identity">
        <span className="session-identity-label">Conta conectada</span>
        <strong>{session.email}</strong>
        <span>{session.emailConfirmed ? "E-mail confirmado" : "E-mail ainda não confirmado"}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="auth-primary-action" disabled={status === "signing-out"} onClick={onRequestLogout} ref={logoutButtonRef} type="button">
        {status === "signing-out" ? "Saindo…" : "Sair da conta"}
      </button>
      <a className="auth-primary-action onboarding-action" href="/onboarding/criatorio/selecionar">Continuar onboarding</a>
      <a className="auth-secondary-action settings-action" href="/configuracoes">Configurações da conta</a>
      <a className="text-action" href="/">Voltar para a página inicial</a>
    </div>
  );
}

function LogoutDialog({ onCancel, onConfirm }: Readonly<{ onCancel: () => void; onConfirm: () => void }>) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { status } = useAuth();

  useEffect(() => {
    headingRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      if (!firstFocusableElement || !lastFocusableElement) return;

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="logout-dialog-backdrop">
      <section aria-labelledby="titulo-confirmacao-saida" aria-modal="true" className="logout-dialog" ref={dialogRef} role="dialog">
        <h2 id="titulo-confirmacao-saida" ref={headingRef} tabIndex={-1}>Sair da sua conta?</h2>
        <p>Sua sessão será encerrada neste dispositivo. Você poderá entrar novamente quando quiser.</p>
        <div className="logout-dialog-actions">
          <button className="auth-secondary-action" disabled={status === "signing-out"} onClick={onCancel} type="button">Cancelar</button>
          <button className="auth-primary-action" disabled={status === "signing-out"} onClick={onConfirm} type="button">
            {status === "signing-out" ? "Saindo…" : "Confirmar saída"}
          </button>
        </div>
      </section>
    </div>
  );
}

function LoginForm() {
  const { clearError, error, login, refresh, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [googleError, setGoogleError] = useState<string | undefined>();
  const [isGooglePending, setIsGooglePending] = useState(false);
  const googleWindow = useRef<Window | null>(null);
  const googlePollTimer = useRef<number | undefined>(undefined);
  const googleSessionCheckInFlight = useRef(false);

  function stopGooglePolling() {
    if (googlePollTimer.current === undefined) return;
    window.clearInterval(googlePollTimer.current);
    googlePollTimer.current = undefined;
  }

  function finishGoogleAuthentication() {
    stopGooglePolling();
    googleWindow.current?.close();
    googleWindow.current = null;
    setIsGooglePending(false);
  }

  function handleGoogleAuthenticationFailure(code?: string) {
    setGoogleError(messageForGoogleFailure(code));
    finishGoogleAuthentication();
  }

  useEffect(() => () => {
    stopGooglePolling();
    googleWindow.current?.close();
  }, []);

  useEffect(() => {
    function handleGoogleAuthenticationMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type !== googleAuthenticationMessageType) return;

      if (event.data.status === "success") {
        void verifyGoogleSession();
        return;
      }

      if (event.data.status !== "error") return;

      const code = typeof event.data.code === "string" ? event.data.code : undefined;
      handleGoogleAuthenticationFailure(code);
    }

    window.addEventListener("message", handleGoogleAuthenticationMessage);
    return () => window.removeEventListener("message", handleGoogleAuthenticationMessage);
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("googleError");
    if (!code) return;

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { code, status: "error", type: googleAuthenticationMessageType },
        window.location.origin
      );
      window.close();
    }

    setGoogleError(messageForGoogleFailure(code));
    const url = new URL(window.location.href);
    url.searchParams.delete("googleError");
    url.searchParams.delete("correlationId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function verifyGoogleSession() {
    if (googleSessionCheckInFlight.current) return;

    googleSessionCheckInFlight.current = true;
    setGoogleError(undefined);
    try {
      const result = await refresh({ provider: "google", showLoading: false });
      if (result.ok) {
        finishGoogleAuthentication();
        return;
      }

      if (googleWindow.current?.closed) {
        finishGoogleAuthentication();
        setGoogleError("A janela do Google foi fechada antes da conclusão. Tente novamente.");
        return;
      }

      setGoogleError(messageForGoogleFailure(result.code));
    } finally {
      googleSessionCheckInFlight.current = false;
    }
  }

  function inspectGooglePopup(popup: Window) {
    if (popup.closed) {
      stopGooglePolling();
      // The callback posts the success message and closes the popup in the
      // same turn. Verify the session before treating the close as a failure;
      // otherwise the polling timer can win the race against message delivery.
      void verifyGoogleSession();
      return;
    }

    try {
      const popupUrl = new URL(popup.location.href);
      if (popupUrl.origin !== window.location.origin) return;

      const callbackError = popupUrl.searchParams.get("googleError");
      if (callbackError) {
        handleGoogleAuthenticationFailure(callbackError);
        return;
      }

      stopGooglePolling();
      void verifyGoogleSession();
    } catch {
      // The popup is still on Google's origin, so its location is intentionally unreadable.
    }
  }

  function startGoogleAuthentication() {
    clearError();
    setGoogleError(undefined);
    const popup = window.open(
      getApiUrl("api/auth/google"),
      googleAuthenticationWindowName,
      "popup,width=520,height=680,resizable=yes,scrollbars=yes"
    );

    if (!popup) {
      setGoogleError("Não foi possível abrir a janela do Google. Permita pop-ups e tente novamente.");
      return;
    }

    googleWindow.current = popup;
    setIsGooglePending(true);
    googlePollTimer.current = window.setInterval(() => inspectGooglePopup(popup), 250);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateForm(email, password);
    setErrors(validationErrors);
    clearError();
    if (Object.keys(validationErrors).length > 0) return;
    await login(email, password);
  }

  const isSubmitting = status === "authenticating";

  return (
    <div className="auth-form-content">
      <a className="auth-mobile-back" href="/" aria-label="Voltar para a página inicial"><BackIcon /></a>
      <div className="auth-mobile-brand"><BrandLockup stacked /></div>
      <h1 id="titulo-login">Entre na sua conta</h1>
      <p className="lede">Acompanhe seu criatório com mais clareza, de onde estiver.</p>

      <form noValidate onSubmit={handleSubmit}>
        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="field-group">
          <label htmlFor="email">E-mail</label>
          <div className="field-control">
            <span className="field-icon"><MailIcon /></span>
            <input
              autoComplete="email"
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={Boolean(errors.email)}
              disabled={isSubmitting}
              id="email"
              name="email"
              onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined })); }}
              placeholder="Seu e-mail"
              type="email"
              value={email}
            />
          </div>
          {errors.email && <p className="field-error" id="email-error">{errors.email}</p>}
        </div>

        <div className="field-group">
          <label htmlFor="password">Senha</label>
          <div className="field-control">
            <span className="field-icon"><LockIcon /></span>
            <input
              autoComplete="current-password"
              aria-describedby={errors.password ? "password-error" : undefined}
              aria-invalid={Boolean(errors.password)}
              disabled={isSubmitting}
              id="password"
              name="password"
              onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); }}
              placeholder="Sua senha"
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="field-toggle"
              disabled={isSubmitting}
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              <EyeIcon />
            </button>
          </div>
          {errors.password && <p className="field-error" id="password-error">{errors.password}</p>}
        </div>

        <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="password-recovery-link"><a href="/auth/forgot-password">Esqueci minha senha</a></p>

      <div aria-label="outras opções de entrada" className="auth-divider" role="separator"><span>ou</span></div>
      <button className="google-action" disabled={isSubmitting || isGooglePending} onClick={startGoogleAuthentication} type="button">
        <GoogleMark />
        {isGooglePending ? "Aguardando Google…" : "Continuar com Google"}
      </button>
      {googleError && <div className="form-error google-error" role="alert">{googleError}</div>}
      {isGooglePending && (
        <div className="google-pending" role="status">
          <p>Conclua a entrada na janela do Google. A sessão será verificada automaticamente.</p>
          <button className="auth-secondary-action" onClick={() => void verifyGoogleSession()} type="button">Verificar sessão</button>
        </div>
      )}

      <p className="auth-footer">Ainda não tem uma conta? <a href="/cadastro">Criar conta</a></p>
    </div>
  );
}

function LoginScreen() {
  const { clearError, error, logout, refresh, session, status } = useAuth();
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  async function confirmLogout() {
    await logout();
    setLogoutDialogOpen(false);
    logoutButtonRef.current?.focus();
  }

  const content = status === "loading"
    ? <AuthState heading="Restaurando sua sessão" message="Só um instante enquanto verificamos seu acesso." />
    : status === "error"
      ? <AuthState heading="Não foi possível restaurar sua sessão" message={error ?? "Tente novamente para continuar."} onRetry={() => void refresh()} />
      : status === "forbidden"
        ? <AuthState heading="Acesso bloqueado" message={error ?? "Sua conta não tem permissão para acessar esta área."} onRetry={() => void refresh()} retryLabel="Verificar novamente" />
        : status === "authenticated" || status === "signing-out"
          ? <SessionPanel logoutButtonRef={logoutButtonRef} onRequestLogout={() => setLogoutDialogOpen(true)} />
          : <LoginForm />;

  return (
    <main className="auth-page">
      <a className="skip-link" href="#conteudo-login">Pular para o conteúdo</a>
      <div className="auth-shell">
        <BrandPanel />
        <section aria-label="Autenticação" className="auth-form-panel">
          <div className="auth-form-panel-content" id="conteudo-login">
            {content}
          </div>
        </section>
      </div>
      {logoutDialogOpen && session && (
        <LogoutDialog
          onCancel={() => { clearError(); setLogoutDialogOpen(false); logoutButtonRef.current?.focus(); }}
          onConfirm={() => void confirmLogout()}
        />
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <GoogleAuthenticationCallback />
      <LoginScreen />
    </AuthProvider>
  );
}
