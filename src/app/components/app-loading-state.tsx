import React from "react";
import { AuthenticatedNav, AuthenticatedShell } from "./authenticated-shell";

export interface AppLoadingStateProps {
  activeNav?: AuthenticatedNav;
  email?: string;
  farmName?: string;
  label: string;
  message: string;
}

export function AppLoadingContent({ label, message }: Pick<AppLoadingStateProps, "label" | "message">) {
  return (
    <div aria-busy="true" aria-live="polite" className="app-loading-state" role="status">
      <span aria-hidden="true" className="app-loading-dot" />
      <strong>{label}</strong>
      <span>{message}</span>
    </div>
  );
}

export function AppLoadingState({ activeNav, email, farmName = "Criatório selecionado", label, message }: AppLoadingStateProps) {
  const content = <AppLoadingContent label={label} message={message} />;

  if (activeNav) {
    return <AuthenticatedShell activeNav={activeNav} email={email ?? ""} farmName={farmName}>{content}</AuthenticatedShell>;
  }

  return <main aria-busy="true" className="app-loading-page">{content}</main>;
}
