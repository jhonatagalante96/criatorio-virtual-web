"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, createApiClient } from "../../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../../components/brand";

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function MailIcon() {
  return <img src="/assets/icons/ui/mail.svg" alt="" aria-hidden="true" />;
}

function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    if (isSubmitted) headingRef.current?.focus();
  }, [isSubmitted]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setEmailError(undefined);
    setFormError(undefined);

    if (!normalizedEmail) {
      setEmailError("Informe seu e-mail.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setEmailError("Informe um e-mail válido.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/forgot-password", {
        body: JSON.stringify({ email: normalizedEmail }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setIsSubmitted(true);
    } catch (error) {
      if (error instanceof ApiError && error.fields.email?.[0]) {
        setEmailError("Informe um e-mail válido.");
      } else {
        setFormError("Não foi possível solicitar a recuperação agora. Tente novamente em instantes.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <a className="skip-link" href="#conteudo-recuperacao">Pular para o conteúdo</a>
      <div className="auth-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-recuperacao" className="auth-form-panel">
          <div className="auth-form-content password-recovery-card" id="conteudo-recuperacao">
            <a className="auth-mobile-back" href="/login" aria-label="Voltar para o login"><BackIcon /></a>
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>

            {!isSubmitted ? (
              <>
                <h1 id="titulo-recuperacao">Recupere sua senha</h1>
                <p className="lede">Informe seu e-mail e enviaremos as instruções para criar uma nova senha.</p>

                <form noValidate onSubmit={handleSubmit}>
                  {formError && <div className="form-error" role="alert">{formError}</div>}
                  <div className="field-group">
                    <label htmlFor="recovery-email">E-mail</label>
                    <div className="field-control">
                      <span className="field-icon"><MailIcon /></span>
                      <input
                        aria-describedby={emailError ? "recovery-email-error" : undefined}
                        aria-invalid={Boolean(emailError)}
                        autoComplete="email"
                        disabled={isSubmitting}
                        id="recovery-email"
                        name="email"
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setEmailError(undefined);
                        }}
                        placeholder="Seu e-mail"
                        type="email"
                        value={email}
                      />
                    </div>
                    {emailError && <p className="field-error" id="recovery-email-error">{emailError}</p>}
                  </div>
                  <button className="auth-primary-action submit-action" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Enviando…" : "Enviar instruções"}
                  </button>
                </form>

                <p className="auth-footer"><a href="/login">Voltar para o login</a></p>
              </>
            ) : (
              <>
                <div aria-hidden="true" className="confirmation-icon">
                  <img src="/assets/icons/ui/envelope-check.svg" alt="" />
                </div>
                <h1 id="titulo-recuperacao" ref={headingRef} tabIndex={-1}>Verifique seu e-mail</h1>
                <p className="lede">Se o e-mail estiver cadastrado, enviaremos um link para você criar uma nova senha.</p>
                <div className="confirmation-notice">
                  <strong>Não recebeu a mensagem?</strong>
                  <span>Verifique sua caixa de spam ou lixo eletrônico.</span>
                </div>
                <a className="auth-primary-action confirmation-primary-action" href="/login">Voltar para o login</a>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
