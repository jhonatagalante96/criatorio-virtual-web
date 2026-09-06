"use client";

import React, { FormEvent, useRef, useState } from "react";
import { ApiClient, ApiError, ValidationErrors, createApiClient } from "../../lib/http/api-client";

interface AccountRegistrationResponse {
  email: string;
  emailConfirmationRequired: boolean;
  userId: string;
}

function validateForm(email: string, password: string, passwordConfirmation: string): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!email.trim()) {
    errors.email = ["Informe seu e-mail."];
  } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    errors.email = ["Informe um e-mail válido."];
  }

  if (!password) {
    errors.password = ["Informe uma senha."];
  } else if (password.length < 12) {
    errors.password = ["A senha deve ter pelo menos 12 caracteres."];
  }

  if (!passwordConfirmation) {
    errors.passwordConfirmation = ["Confirme sua senha."];
  } else if (password !== passwordConfirmation) {
    errors.passwordConfirmation = ["As senhas precisam ser iguais."];
  }

  return errors;
}

function firstError(errors: ValidationErrors, field: string): string | undefined {
  return errors[field]?.[0];
}

export default function RegistrationPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | undefined>();
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) {
    client.current = createApiClient(() => csrfToken.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const validationErrors = validateForm(normalizedEmail, password, passwordConfirmation);
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

      if (response.emailConfirmationRequired) setRegisteredEmail(response.email);
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

  if (registeredEmail) {
    return (
      <main className="auth-page">
        <a className="skip-link" href="#conteudo-cadastro">Pular para o conteúdo</a>
        <div className="auth-shell">
          <a className="brand" href="/" aria-label="Criatório Virtual, página inicial">
            <span aria-hidden="true" className="brand-mark">CV</span>
            <span>Criatório Virtual</span>
          </a>
          <section className="registration-card confirmation-card" id="conteudo-cadastro" aria-labelledby="titulo-confirmacao">
            <p className="eyebrow">Quase lá</p>
            <h1 id="titulo-confirmacao">Confirme seu e-mail</h1>
            <p className="lede">Sua conta foi criada com o e-mail <strong>{registeredEmail}</strong>. Confirme seu endereço antes de usar o login para liberar o acesso à plataforma.</p>
            <div className="confirmation-actions">
              <a className="primary-action" href="/login">Ir para o login</a>
              <a className="text-action" href="/">Voltar para a página inicial</a>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const emailError = firstError(errors, "email");
  const passwordError = firstError(errors, "password");
  const passwordConfirmationError = firstError(errors, "passwordConfirmation");

  return (
    <main className="auth-page">
      <a className="skip-link" href="#conteudo-cadastro">Pular para o conteúdo</a>
      <div className="auth-shell">
        <a className="brand" href="/" aria-label="Criatório Virtual, página inicial">
          <span aria-hidden="true" className="brand-mark">CV</span>
          <span>Criatório Virtual</span>
        </a>
        <section className="registration-card" id="conteudo-cadastro" aria-labelledby="titulo-cadastro">
          <p className="eyebrow">Comece pelo básico</p>
          <h1 id="titulo-cadastro">Crie sua conta</h1>
          <p className="lede">Tenha um espaço simples e seguro para acompanhar o seu criatório.</p>

          <form onSubmit={handleSubmit} noValidate>
            {formError && <div className="form-error" role="alert">{formError}</div>}

            <div className="field-group">
              <label htmlFor="email">E-mail</label>
              <input
                autoComplete="email"
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
                aria-describedby={emailError ? "email-error" : undefined}
                aria-invalid={Boolean(emailError)}
                disabled={isSubmitting}
              />
              {emailError && <p className="field-error" id="email-error">{emailError}</p>}
            </div>

            <div className="field-group">
              <label htmlFor="password">Senha</label>
              <input
                autoComplete="new-password"
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
                aria-describedby={passwordError ? "password-error" : "password-help"}
                aria-invalid={Boolean(passwordError)}
                disabled={isSubmitting}
              />
              <p className="field-help" id="password-help">Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</p>
              {passwordError && <p className="field-error" id="password-error">{passwordError}</p>}
            </div>

            <div className="field-group">
              <label htmlFor="passwordConfirmation">Confirme sua senha</label>
              <input
                autoComplete="new-password"
                id="passwordConfirmation"
                name="passwordConfirmation"
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                type="password"
                value={passwordConfirmation}
                aria-describedby={passwordConfirmationError ? "password-confirmation-error" : undefined}
                aria-invalid={Boolean(passwordConfirmationError)}
                disabled={isSubmitting}
              />
              {passwordConfirmationError && <p className="field-error" id="password-confirmation-error">{passwordConfirmationError}</p>}
            </div>

            <button className="primary-action submit-action" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Criando sua conta…" : "Criar minha conta"}
            </button>
          </form>

          <p className="auth-footer">Já tem uma conta? <a href="/login">Entrar</a></p>
        </section>
      </div>
    </main>
  );
}

