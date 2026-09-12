"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiClient, ApiError, createApiClient } from "../../../lib/http/api-client";
import { validatePassword, validatePasswordConfirmation } from "../../../lib/auth/password-validation";
import { BrandLockup, BrandPanel } from "../../components/brand";
import { PasswordField } from "../../components/password-field";

type ResetStatus = "form" | "invalid" | "loading" | "success";
interface ResetFields {
  confirmPassword?: string;
  newPassword?: string;
}

function BackIcon() {
  return <img src="/assets/icons/ui/arrow-left.svg" alt="" aria-hidden="true" />;
}

function ErrorIcon() {
  return <div aria-hidden="true" className="confirmation-icon confirmation-icon-error"><span className="confirmation-error-mark">!</span></div>;
}

export default function ResetPasswordPage() {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<ResetFields>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<ResetStatus>("loading");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestData = useRef<{ token: string; userId: string } | undefined>(undefined);
  const csrfToken = useRef<string | undefined>(undefined);
  const client = useRef<ApiClient | null>(null);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  useEffect(() => {
    const url = new URL(window.location.href);
    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");

    if (!userId || !token) {
      setStatus("invalid");
      return;
    }

    requestData.current = { token, userId };
    url.searchParams.delete("userId");
    url.searchParams.delete("token");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setStatus("form");
  }, []);

  useEffect(() => {
    if (status !== "loading") headingRef.current?.focus();
  }, [status]);

  function validateForm(): ResetFields {
    const nextErrors: ResetFields = {};
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
    if (Object.keys(validationErrors).length > 0) return;

    const data = requestData.current;
    if (!data) {
      setStatus("invalid");
      return;
    }

    setIsSubmitting(true);

    try {
      if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();

      await client.current!.request<void>("api/auth/reset-password", {
        body: JSON.stringify({ confirmPassword, newPassword, token: data.token, userId: data.userId }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setStatus("success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        if (error.fields.newPassword?.[0]) {
          setErrors({ newPassword: "A senha nova não atende à política de segurança." });
        } else if (error.fields.confirmPassword?.[0]) {
          setErrors({ confirmPassword: "As senhas não coincidem." });
        } else {
          setStatus("invalid");
        }
      } else {
        setFormError("Não foi possível redefinir sua senha agora. Tente novamente em instantes.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <a className="skip-link" href="#conteudo-redefinicao">Pular para o conteúdo</a>
      <div className="auth-shell">
        <BrandPanel />
        <section aria-labelledby="titulo-redefinicao" className="auth-form-panel">
          <div className="auth-form-content password-recovery-card" id="conteudo-redefinicao">
            <Link className="auth-mobile-back" href="/login" aria-label="Voltar para o login"><BackIcon /></Link>
            <div className="auth-mobile-brand"><BrandLockup stacked /></div>

            {status === "loading" && (
              <>
                <div aria-hidden="true" className="confirmation-icon confirmation-icon-loading">
                  <img src="/assets/icons/ui/lock.svg" alt="" />
                </div>
                <h1 id="titulo-redefinicao" ref={headingRef} tabIndex={-1}>Validando seu link</h1>
                <p className="lede" role="status">Só um instante enquanto preparamos a troca da sua senha.</p>
              </>
            )}

            {status === "invalid" && (
              <>
                <ErrorIcon />
                <h1 id="titulo-redefinicao" ref={headingRef} tabIndex={-1}>Link inválido ou expirado</h1>
                <p className="lede">Esse link não é mais válido. Solicite uma nova mensagem para redefinir sua senha.</p>
                <Link className="auth-primary-action confirmation-primary-action" href="/auth/forgot-password">Solicitar novo link</Link>
                <Link className="text-action confirmation-back" href="/login">Voltar para o login</Link>
              </>
            )}

            {status === "success" && (
              <>
                <div aria-hidden="true" className="confirmation-icon">
                  <img src="/assets/icons/ui/lock.svg" alt="" />
                </div>
                <h1 id="titulo-redefinicao" ref={headingRef} tabIndex={-1}>Senha redefinida!</h1>
                <p className="lede">Sua nova senha foi salva. Use-a para entrar no Criatório Virtual.</p>
                <Link className="auth-primary-action confirmation-primary-action" href="/login">Ir para o login</Link>
              </>
            )}

            {status === "form" && (
              <>
                <h1 id="titulo-redefinicao" ref={headingRef} tabIndex={-1}>Crie uma nova senha</h1>
                <p className="lede">Escolha uma senha forte para proteger seu acesso ao criatório.</p>
                <form noValidate onSubmit={handleSubmit}>
                  {formError && <div className="form-error" role="alert">{formError}</div>}
                  <PasswordField
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    error={errors.newPassword}
                    id="new-password"
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
                    id="confirm-password"
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
                    {isSubmitting ? "Redefinindo…" : "Redefinir senha"}
                  </button>
                </form>
                <p className="auth-footer"><Link href="/login">Voltar para o login</Link></p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
