"use client";

import React, { FormEvent, useRef, useState } from "react";
import { ApiClient, ApiError, ValidationErrors, createApiClient } from "../../lib/http/api-client";

interface AccountRegistrationResponse {
  email: string;
  emailConfirmationRequired: boolean;
  userId: string;
}

function BrandLockup({ light = false }: { light?: boolean }) {
  return (
    <span className={`auth-brand-lockup${light ? " auth-brand-lockup-light" : ""}`}>
      <svg className="auth-brand-symbol" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M9 31c8-2 14-9 16-20 9 5 13 12 10 20-3 8-13 12-26 10 5-2 8-5 10-9Z" fill="currentColor" />
        <path d="M12 37c7-8 13-14 23-21" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
      <span>Criatório Virtual</span>
    </span>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.4 3.1-5.2 7-5.2s6.2 1.8 7 5.2" />
    </svg>
  );
}

function GoogleIcon() {
  return <span className="google-icon" aria-hidden="true">G</span>;
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {!visible && <path d="m4 4 16 16" />}
    </svg>
  );
}

function AuthBrandPanel() {
  return (
    <aside className="auth-brand-panel" aria-label="Sobre o Criatório Virtual">
      <a className="auth-brand-link" href="/" aria-label="Criatório Virtual, página inicial">
        <BrandLockup light />
      </a>
      <div className="auth-brand-copy">
        <h2>Gestão completa para o seu criatório</h2>
        <p>Organize suas aves, acompanhe sua evolução e tenha tudo reunido em um só lugar.</p>
      </div>
      <svg className="auth-bird" viewBox="0 0 300 230" aria-hidden="true">
        <defs>
          <linearGradient id="bird-body" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#dce366" />
            <stop offset=".58" stopColor="#86a72f" />
            <stop offset="1" stopColor="#315f2c" />
          </linearGradient>
          <linearGradient id="bird-wing" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#6e8b28" />
            <stop offset="1" stopColor="#173f32" />
          </linearGradient>
        </defs>
        <path d="M16 194c69-10 163-5 269 16" fill="none" stroke="#7b5a32" strokeLinecap="round" strokeWidth="13" />
        <path d="M75 202c-15-28-13-58 6-81M112 202c-4-30 5-59 28-82M244 209c-8-26-1-49 19-66" fill="none" stroke="#315c35" strokeLinecap="round" strokeWidth="8" />
        <path d="M92 119c-4-42 17-77 61-84 42-7 79 17 83 53 5 39-23 78-67 86-36 7-73-17-77-55Z" fill="url(#bird-body)" />
        <path d="M139 72c25-18 61-11 78 12 13 18 10 45-5 62-28-8-54-29-73-74Z" fill="url(#bird-wing)" />
        <path d="M211 72c15-13 31-11 47-2-8 14-19 22-36 23Z" fill="#e3c74c" />
        <circle cx="201" cy="53" r="5" fill="#112b25" />
        <path d="M120 150c16 19 38 25 60 22" fill="none" stroke="#e8d94f" strokeLinecap="round" strokeWidth="9" />
        <path d="M93 120c-10-22-8-43 2-58 12 13 21 29 25 49Z" fill="#bdd244" opacity=".9" />
      </svg>
      <p className="auth-brand-footnote">Tradição e tecnologia lado a lado.</p>
    </aside>
  );
}

function validateForm(fullName: string, email: string, password: string, acceptedTerms: boolean): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!fullName.trim()) {
    errors.fullName = ["Informe seu nome completo."];
  }

  if (!email.trim()) {
    errors.email = ["Informe seu e-mail."];
  } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    errors.email = ["Informe um e-mail válido."];
  }

  if (!password) {
    errors.password = ["Informe uma senha."];
  } else if (
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    errors.password = ["Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo."];
  }

  if (!acceptedTerms) {
    errors.terms = ["Aceite os Termos de Uso e a Política de Privacidade para continuar."];
  }

  return errors;
}

function firstError(errors: ValidationErrors, field: string): string | undefined {
  return errors[field]?.[0];
}

export default function RegistrationPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registration, setRegistration] = useState<AccountRegistrationResponse | undefined>();
  const [showPassword, setShowPassword] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | undefined>();
  const [resendError, setResendError] = useState<string | undefined>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) {
    client.current = createApiClient(() => csrfToken.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const validationErrors = validateForm(fullName, normalizedEmail, password, acceptedTerms);
    setErrors(validationErrors);
    setFormError(undefined);

    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      const response = await client.current!.request<AccountRegistrationResponse>("api/auth/register", {
        body: JSON.stringify({ email: normalizedEmail, password }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      setRegistration(response);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setFormError(error.status === 409
          ? "Já existe uma conta com este e-mail. Se ela for sua, entre pela área de login."
          : error.status >= 500
            ? "Não foi possível criar sua conta agora. Tente novamente em instantes."
            : error.message);
      } else {
        setFormError("Não foi possível criar sua conta agora. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (!registration || isResending) return;

    setIsResending(true);
    setResendMessage(undefined);
    setResendError(undefined);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/confirm-email/resend", {
        body: JSON.stringify({ email: registration.email }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setResendMessage("E-mail reenviado. Verifique sua caixa de entrada.");
    } catch (error) {
      setResendError(error instanceof ApiError && error.status === 429
        ? "Aguarde alguns instantes antes de solicitar um novo e-mail."
        : "Não foi possível reenviar agora. Tente novamente em instantes.");
    } finally {
      setIsResending(false);
    }
  }

  if (registration) {
    return (
      <main className="auth-page">
        <a className="skip-link" href="#conteudo-cadastro">Pular para o conteúdo</a>
        <div className="auth-shell">
          <AuthBrandPanel />
          <section className="auth-form-panel" aria-labelledby="titulo-confirmacao">
            <div className="auth-form-content confirmation-card" id="conteudo-cadastro">
              <div className="auth-mobile-brand"><BrandLockup /></div>
              <div className="confirmation-icon" aria-hidden="true"><MailIcon /></div>
              <p className="eyebrow">Cadastro concluído</p>
              <h1 id="titulo-confirmacao">{registration.emailConfirmationRequired ? "Verifique seu e-mail" : "Sua conta está pronta"}</h1>
              <p className="lede">{registration.emailConfirmationRequired
                ? <>Enviamos um link de confirmação para <strong>{registration.email}</strong>.</>
                : <>Sua conta foi criada com o e-mail <strong>{registration.email}</strong>. Use o login para continuar.</>}</p>
              {registration.emailConfirmationRequired && <p className="confirmation-detail">Clique no link do e-mail para ativar sua conta e continuar.</p>}
              {registration.emailConfirmationRequired && (
                <div className="confirmation-notice">
                  <strong>Não recebeu o e-mail?</strong>
                  <span>Verifique sua caixa de spam ou lixo eletrônico.</span>
                  <button className="secondary-action" disabled={isResending} onClick={handleResend} type="button">
                    {isResending ? "Reenviando…" : "Reenviar e-mail"}
                  </button>
                </div>
              )}
              {resendMessage && <p className="confirmation-feedback" role="status">{resendMessage}</p>}
              {resendError && <p className="confirmation-feedback confirmation-feedback-error" role="alert">{resendError}</p>}
              <a className="text-action confirmation-back" href="/login">Voltar para o login</a>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const fullNameError = firstError(errors, "fullName");
  const emailError = firstError(errors, "email");
  const passwordError = firstError(errors, "password");
  const termsError = firstError(errors, "terms");

  return (
    <main className="auth-page">
      <a className="skip-link" href="#conteudo-cadastro">Pular para o conteúdo</a>
      <div className="auth-shell">
        <AuthBrandPanel />
        <section className="auth-form-panel" aria-labelledby="titulo-cadastro">
          <div className="auth-form-content" id="conteudo-cadastro">
            <div className="auth-mobile-brand"><BrandLockup /></div>
            <h1 id="titulo-cadastro">Criar sua conta</h1>
            <p className="lede">Preencha os dados para começar</p>

            <form onSubmit={handleSubmit} noValidate>
              {formError && <div className="form-error" role="alert">{formError}</div>}

              <div className="field-group">
                <label htmlFor="fullName">Nome completo</label>
                <div className="field-control">
                  <span className="field-icon"><UserIcon /></span>
                  <input
                    autoComplete="name"
                    id="fullName"
                    name="fullName"
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Seu nome"
                    type="text"
                    value={fullName}
                    aria-describedby={fullNameError ? "full-name-error" : undefined}
                    aria-invalid={Boolean(fullNameError)}
                    disabled={isSubmitting}
                  />
                </div>
                {fullNameError && <p className="field-error" id="full-name-error">{fullNameError}</p>}
              </div>

              <div className="field-group">
                <label htmlFor="email">E-mail</label>
                <div className="field-control">
                  <span className="field-icon"><MailIcon /></span>
                  <input
                    autoComplete="email"
                    id="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="seu@email.com"
                    type="email"
                    value={email}
                    aria-describedby={emailError ? "email-error" : undefined}
                    aria-invalid={Boolean(emailError)}
                    disabled={isSubmitting}
                  />
                </div>
                {emailError && <p className="field-error" id="email-error">{emailError}</p>}
              </div>

              <div className="field-group">
                <label htmlFor="password">Senha</label>
                <div className="field-control">
                  <span className="field-icon"><LockIcon /></span>
                  <input
                    autoComplete="new-password"
                    id="password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Crie uma senha segura"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    aria-describedby={passwordError ? "password-error" : undefined}
                    aria-invalid={Boolean(passwordError)}
                    disabled={isSubmitting}
                  />
                  <button
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="field-toggle"
                    disabled={isSubmitting}
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>
                {passwordError && <p className="field-error" id="password-error">{passwordError}</p>}
              </div>

              <label className={`terms-control${termsError ? " terms-control-error" : ""}`}>
                <input
                  aria-describedby={termsError ? "terms-error" : undefined}
                  aria-invalid={Boolean(termsError)}
                  checked={acceptedTerms}
                  disabled={isSubmitting}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  type="checkbox"
                />
                <span>Li e concordo com os <a href="/termos-de-uso">Termos de Uso</a> e a <a href="/politica-de-privacidade">Política de Privacidade</a>.</span>
              </label>
              {termsError && <p className="field-error terms-error" id="terms-error">{termsError}</p>}

              <button className="primary-action submit-action" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Criando sua conta…" : "Criar conta"}
              </button>
            </form>

            <div className="auth-divider"><span>ou continue com</span></div>
            <a className="google-action" href={new URL("api/auth/google", process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").toString()}>
              <GoogleIcon />
              Criar conta com o Google
            </a>

            <p className="auth-footer">Já tem uma conta? <a href="/login">Entrar</a></p>
          </div>
        </section>
      </div>
    </main>
  );
}

