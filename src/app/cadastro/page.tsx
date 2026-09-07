"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, ValidationErrors, createApiClient } from "../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../components/brand";

interface AccountRegistrationResponse {
  email: string;
  emailConfirmationRequired: boolean;
  userId: string;
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

function validateForm(email: string, password: string, confirmPassword: string, acceptedTerms: boolean): ValidationErrors {
  const errors: ValidationErrors = {};

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

  if (!confirmPassword) {
    errors.confirmPassword = ["Confirme sua senha."];
  } else if (password !== confirmPassword) {
    errors.confirmPassword = ["As senhas não coincidem."];
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registration, setRegistration] = useState<AccountRegistrationResponse | undefined>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | undefined>();
  const [resendError, setResendError] = useState<string | undefined>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);

  if (!client.current) {
    client.current = createApiClient(() => csrfToken.current);
  }

  useEffect(() => {
    if (registration) confirmationHeading.current?.focus();
  }, [registration]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const validationErrors = validateForm(normalizedEmail, password, confirmPassword, acceptedTerms);
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
          <BrandPanel />
          <section className="auth-form-panel" aria-labelledby="titulo-confirmacao">
            <div className="auth-form-content confirmation-card" id="conteudo-cadastro">
              <a className="auth-mobile-back" href="/" aria-label="Voltar para a página inicial"><BackIcon /></a>
              <div className="auth-mobile-brand"><BrandLockup stacked /></div>
              <div className="confirmation-icon" aria-hidden="true">
                <img src="/assets/icons/ui/envelope-check.svg" alt="" />
              </div>
              <h1 id="titulo-confirmacao" ref={confirmationHeading} tabIndex={-1}>{registration.emailConfirmationRequired ? "Verifique seu e-mail" : "Sua conta está pronta"}</h1>
              <p className="lede">{registration.emailConfirmationRequired
                ? <>Enviamos um link de confirmação para <strong>{registration.email}</strong>.</>
                : <>Sua conta foi criada com o e-mail <strong>{registration.email}</strong>. Use o login para continuar.</>}</p>
              {registration.emailConfirmationRequired && <p className="confirmation-detail">Clique no link do e-mail para ativar sua conta e continuar.</p>}
              {registration.emailConfirmationRequired && (
                <div className="confirmation-notice">
                  <strong>Não recebeu o e-mail?</strong>
                  <span>Verifique sua caixa de spam ou lixo eletrônico.</span>
                </div>
              )}
              {registration.emailConfirmationRequired && (
                <>
                  <a className="primary-action confirmation-open-mail" href={`mailto:${registration.email}`}>Abrir meu e-mail</a>
                  <button className="secondary-action confirmation-resend" disabled={isResending} onClick={handleResend} type="button">
                    {isResending ? "Reenviando…" : "Reenviar e-mail"}
                  </button>
                </>
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

  const emailError = firstError(errors, "email");
  const passwordError = firstError(errors, "password");
  const termsError = firstError(errors, "terms");

  return (
      <main className="auth-page">
      <a className="skip-link" href="#conteudo-cadastro">Pular para o conteúdo</a>
      <div className="auth-shell">
        <BrandPanel />
        <section className="auth-form-panel" aria-labelledby="titulo-cadastro">
          <div className="auth-form-content" id="conteudo-cadastro">
            <a className="auth-mobile-back" href="/" aria-label="Voltar para a página inicial"><BackIcon /></a>
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>
            <h1 id="titulo-cadastro">Crie sua conta</h1>
            <p className="lede">É rápido e o primeiro passo para um criatório mais organizado.</p>

            <form onSubmit={handleSubmit} noValidate>
              {formError && <div className="form-error" role="alert">{formError}</div>}

              <div className="field-group">
                <label htmlFor="email">E-mail</label>
                <div className="field-control">
                  <span className="field-icon"><MailIcon /></span>
                  <input
                    autoComplete="email"
                    id="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Seu e-mail"
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
                    placeholder="Crie uma senha"
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
                    <EyeIcon />
                  </button>
                </div>
                {passwordError && <p className="field-error" id="password-error">{passwordError}</p>}
              </div>

              <div className="field-group">
                <label htmlFor="confirmPassword">Confirmar senha</label>
                <div className="field-control">
                  <span className="field-icon"><LockIcon /></span>
                  <input
                    autoComplete="new-password"
                    id="confirmPassword"
                    name="confirmPassword"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirme sua senha"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    disabled={isSubmitting}
                  />
                  <button
                    aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                    className="field-toggle"
                    disabled={isSubmitting}
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    type="button"
                  >
                    <EyeIcon />
                  </button>
                </div>
                {errors.confirmPassword?.[0] && <p className="field-error" id="confirm-password-error">{errors.confirmPassword[0]}</p>}
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
                <span>Li e aceito os <a href="/termos-de-uso">Termos de Uso</a> e a <a href="/politica-de-privacidade">Política de Privacidade</a>.</span>
              </label>
              {termsError && <p className="field-error terms-error" id="terms-error">{termsError}</p>}

              <button className="primary-action submit-action" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Criando sua conta…" : "Criar conta"}
              </button>
            </form>

            <p className="auth-footer">Já tem uma conta? <a href="/login">Entrar</a></p>
          </div>
        </section>
      </div>
    </main>
  );
}
