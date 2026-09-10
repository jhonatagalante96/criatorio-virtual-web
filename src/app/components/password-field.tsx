"use client";

import React, { ChangeEventHandler, useState } from "react";

interface PasswordFieldProps {
  autoComplete: string;
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  name: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  value: string;
}

function LockIcon() {
  return <img src="/assets/icons/ui/lock.svg" alt="" aria-hidden="true" />;
}

function EyeIcon() {
  return <img src="/assets/icons/ui/eye.svg" alt="" aria-hidden="true" />;
}

export function PasswordField({
  autoComplete,
  disabled = false,
  error,
  id,
  label,
  name,
  onChange,
  placeholder,
  value
}: Readonly<PasswordFieldProps>) {
  const [isVisible, setIsVisible] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <div className="field-control">
        <span className="field-icon"><LockIcon /></span>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          disabled={disabled}
          id={id}
          name={name}
          onChange={onChange}
          placeholder={placeholder}
          type={isVisible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={isVisible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          className="field-toggle"
          disabled={disabled}
          onClick={() => setIsVisible((visible) => !visible)}
          type="button"
        >
          <EyeIcon />
        </button>
      </div>
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  );
}
