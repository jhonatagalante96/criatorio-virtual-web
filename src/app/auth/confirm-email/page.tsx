"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClient, ApiError, createApiClient } from "../../../lib/http/api-client";
import { BrandLockup, BrandPanel } from "../../components/brand";

type ConfirmationStatus = "error" | "invalid" | "loading" | "success";

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function MailIcon() {
  return <img src="/assets/icons/ui/mail.svg" alt="" aria-hidden="true" />;
}

function ConfirmationIcon({ variant }: Readonly<{ variant: "error" | "success" }>) {
  return (
    <div aria-hidden="true" className={`confirmation-icon confirmation-icon-${variant}`}>
      {variant === "success" ? <img src="/assets/icons/ui/envelope-check.svg" alt="" /> : <span className="confirmation-error-mark">!</span>}
    </div>
  );
}

function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

function confirmationStatusForError(error: unknown): ConfirmationStatus {
  return error instanceof ApiError && error.status === 400 ? "invalid" : "error";
}

function resendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return "Aguarde alguns instantes antes de solicitar um novo e-mail.";
  }

  return "Não foi possível enviar um novo link agora. Tente novamente em instantes.";
}

function ResendForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [resendError, setResendError] = useState<string | undefined>();
  const [resendMessage, setResendMessage] = useState<string | undefined>();
  const [isResending, setIsResending] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setEmailError(undefined);
    setResendError(undefined);
    setResendMessage(undefined);

    if (!normalizedEmail) {
      setEmailError("Informe seu e-mail.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setEmailError("Informe um e-mail válido.");
      return;
    }

    setIsResending(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/confirm-email/resend", {
        body: JSON.stringify({ email: normalizedEmail }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setResendMessage("Se o e-mail estiver cadastrado, enviaremos um novo link. Verifique sua caixa de entrada.");
    } catch (error) {
      setResendError(resendErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="confirmation-resend-block">
      <h2>Solicite um novo link</h2>
      <p className="confirmation-resend-description">Informe o e-mail usado no cadastro para receber outra mensagem de confirmação.</p>
      <form aria-label="Solicitar novo link de confirmação" className="confirmation-resend-form" noValidate onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="confirmation-email">E-mail cadastrado</label>
          <div className="field-control">
            <span className="field-icon"><MailIcon /></span>
            <input
              autoComplete="email"
              aria-describedby={emailError ? "confirmation-email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              disabled={isResending}
              id="confirmation-email"
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
          {emailError && <p className="field-error" id="confirmation-email-error">{emailError}</p>}
        </div>
        <button className="auth-primary-action confirmation-resend-submit" disabled={isResending} type="submit">
          {isResending ? "Enviando…" : "Enviar novo link"}
        </button>
      </form>
      {resendMessage && <p className="confirmation-feedback" role="status">{resendMessage}</p>}
      {resendError && <p className="confirmation-feedback confirmation-feedback-error" role="alert">{resendError}</p>}
    </div>
  );
}

export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<ConfirmationStatus>("loading");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmationStarted = useRef(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    if (confirmationStarted.current) return;
    confirmationStarted.current = true;

    const url = new URL(window.location.href);
    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");

    if (userId && token) {
      url.searchParams.delete("userId");
      url.searchParams.delete("token");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      void confirmEmail(userId, token);
      return;
    }

    setStatus("invalid");
  }, []);

  useEffect(() => {
    if (status !== "loading") headingRef.current?.focus();
  }, [status]);

  async function confirmEmail(userId: string, token: string) {
    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/confirm-email", {
        body: JSON.stringify({ token, userId }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setStatus("success");
    } catch (error) {
      setStatus(confirmationStatusForError(error));
    }
  }

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isInvalid = status === "invalid";

  return (
    <main className="auth-page">
      <a className="skip-link" href="#conteudo-confirmacao-email">Pular para o conteúdo</a>
      <div className="auth-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-confirmacao-email" className="auth-form-panel">
          <div className="auth-form-content confirmation-card email-confirmation-card" id="conteudo-confirmacao-email">
            <a className="auth-mobile-back" href="/login" aria-label="Voltar para o login"><BackIcon /></a>
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>

            {isLoading && (
              <>
                <div aria-hidden="true" className="confirmation-icon confirmation-icon-loading">
                  <img src="/assets/icons/ui/envelope-check.svg" alt="" />
                </div>
                <h1 id="titulo-confirmacao-email" ref={headingRef} tabIndex={-1}>Confirmando seu e-mail</h1>
                <p className="lede" role="status">Estamos ativando sua conta. Só um instante.</p>
              </>
            )}

            {isSuccess && (
              <>
                <ConfirmationIcon variant="success" />
                <h1 id="titulo-confirmacao-email" ref={headingRef} tabIndex={-1}>E-mail confirmado!</h1>
                <p className="lede">Sua conta foi ativada com sucesso. Agora você já pode entrar no Criatório Virtual.</p>
                <a className="auth-primary-action confirmation-primary-action" href="/login">Ir para o login</a>
              </>
            )}

            {isInvalid && (
              <>
                <ConfirmationIcon variant="error" />
                <h1 id="titulo-confirmacao-email" ref={headingRef} tabIndex={-1}>Link inválido ou expirado</h1>
                <p className="lede">Esse link não é mais válido. Solicite um novo link para confirmar seu e-mail.</p>
                <ResendForm />
                <a className="text-action confirmation-back" href="/login">Voltar para o login</a>
              </>
            )}

            {!isLoading && !isSuccess && !isInvalid && (
              <>
                <ConfirmationIcon variant="error" />
                <h1 id="titulo-confirmacao-email" ref={headingRef} tabIndex={-1}>Não foi possível confirmar seu e-mail</h1>
                <p className="lede">O serviço está indisponível no momento. Você pode solicitar um novo link para tentar novamente.</p>
                <ResendForm />
                <a className="text-action confirmation-back" href="/login">Voltar para o login</a>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
