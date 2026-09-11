import React from "react";
import { BrandLockup } from "./brand";

export type AuthenticatedNav = "dashboard" | "birds";

interface AuthenticatedShellProps {
  activeNav: AuthenticatedNav;
  children: React.ReactNode;
  email: string;
  farmName: string;
}

const primaryNavigation: Array<{ href: string; id: AuthenticatedNav; label: string; symbol: string }> = [
  { href: "/dashboard", id: "dashboard", label: "Dashboard", symbol: "⌂" },
  { href: "/plantel/aves", id: "birds", label: "Plantel de aves", symbol: "♧" }
];

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "Criador";
  return localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Criador";
}

function initialsFromName(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "CV";
}

function NavigationLinks({ activeNav }: Readonly<{ activeNav: AuthenticatedNav }>) {
  return (
    <ul className="authenticated-nav-list">
      {primaryNavigation.map((item) => (
        <li key={item.id}>
          <a
            aria-current={activeNav === item.id ? "page" : undefined}
            className={`authenticated-nav-link${activeNav === item.id ? " is-active" : ""}`}
            href={item.href}
          >
            <span aria-hidden="true" className="authenticated-nav-symbol">{item.symbol}</span>
            <span>{item.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function AuthenticatedShell({ activeNav, children, email, farmName }: Readonly<AuthenticatedShellProps>) {
  const displayName = displayNameFromEmail(email);

  return (
    <main className="authenticated-page">
      <a className="skip-link" href="#conteudo-autenticado">Pular para o conteúdo</a>
      <div className="authenticated-shell">
        <aside aria-label="Navegação principal" className="authenticated-sidebar">
          <a aria-label="Ir para o dashboard" className="authenticated-brand" href="/dashboard">
            <BrandLockup />
          </a>
          <div className="authenticated-farm-context">
            <span className="authenticated-context-label">Criatório selecionado</span>
            <strong title={farmName}>{farmName}</strong>
          </div>
          <nav aria-label="Módulos disponíveis" className="authenticated-desktop-nav">
            <NavigationLinks activeNav={activeNav} />
          </nav>
          <div className="authenticated-sidebar-links">
            <a href="/onboarding/criatorio/selecionar">Trocar criatório</a>
            <a href="/configuracoes">Configurações</a>
          </div>
          <div className="authenticated-sidebar-inspiration" aria-label="Mensagem inspiradora">
            <p>“Grandes criatórios começam com boas histórias.”</p>
            <span aria-hidden="true">✦</span>
            <small>Criatório Virtual</small>
          </div>
          <div className="authenticated-sidebar-account">
            <span>{email}</span>
            <a href="/login">Gerenciar sessão</a>
          </div>
        </aside>

        <div className="authenticated-main">
          <header className="authenticated-topbar">
            <div aria-label="Busca no sistema" className="authenticated-search" role="search">
              <span aria-hidden="true">⌕</span>
              <span>Buscar no sistema...</span>
            </div>
            <div className="authenticated-topbar-actions">
              <span aria-label="Notificações" className="authenticated-notifications" role="img">♧<i aria-hidden="true" /></span>
              <div className="authenticated-account-summary">
                <span aria-hidden="true" className="authenticated-account-avatar">{initialsFromName(displayName)}</span>
                <span className="authenticated-account-copy">
                  <strong>{displayName}</strong>
                  <small>{farmName}</small>
                </span>
                <span aria-hidden="true" className="authenticated-account-chevron">⌄</span>
              </div>
            </div>
          </header>
          <header className="authenticated-mobile-header">
            <a aria-label="Ir para o dashboard" className="authenticated-brand" href="/dashboard">
              <BrandLockup />
            </a>
            <details className="authenticated-mobile-menu">
              <summary>
                <img alt="" aria-hidden="true" src="/assets/icons/ui/menu.svg" />
                <span>Menu</span>
              </summary>
              <div className="authenticated-mobile-menu-panel">
                <div className="authenticated-farm-context">
                  <span className="authenticated-context-label">Criatório selecionado</span>
                  <strong title={farmName}>{farmName}</strong>
                </div>
                <nav aria-label="Módulos disponíveis no celular">
                  <NavigationLinks activeNav={activeNav} />
                </nav>
                <div className="authenticated-mobile-menu-links">
                  <a href="/onboarding/criatorio/selecionar">Trocar criatório</a>
                  <a href="/configuracoes">Configurações</a>
                </div>
              </div>
            </details>
          </header>
          <div className="authenticated-content" id="conteudo-autenticado">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
