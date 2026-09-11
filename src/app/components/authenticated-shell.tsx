import React from "react";
import { BrandLockup } from "./brand";
import { DashboardIcon } from "./dashboard-icons";
import type { DashboardIconName } from "./dashboard-icons";

export type AuthenticatedNav = "dashboard" | "birds";

interface AuthenticatedShellProps {
  activeNav: AuthenticatedNav;
  children: React.ReactNode;
  email: string;
  farmName: string;
}

interface NavigationItem {
  href?: string;
  icon: DashboardIconName;
  id: string;
  label: string;
}

const primaryNavigation: NavigationItem[] = [
  { href: "/dashboard", icon: "home", id: "dashboard", label: "Dashboard" },
  { href: "/plantel/aves", icon: "bird", id: "birds", label: "Aves" },
  { icon: "heart", id: "reproduction", label: "Reprodução" },
  { icon: "transfer", id: "transfers", label: "Transferências" },
  { icon: "trophy", id: "competitions", label: "Competições" },
  { icon: "document", id: "documents", label: "Documentos" }
];

const secondaryNavigation: NavigationItem[] = [
  { href: "/configuracoes/criatorio", icon: "farm", id: "farm", label: "Meu Criatório" },
  { icon: "crown", id: "subscription", label: "Assinatura" },
  { href: "/configuracoes", icon: "settings", id: "settings", label: "Configurações" }
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

function NavigationLinks({ activeNav, items = primaryNavigation }: Readonly<{ activeNav: AuthenticatedNav; items?: NavigationItem[] }>) {
  return (
    <ul className="authenticated-nav-list">
      {items.map((item) => {
        const content = (
          <>
            <span aria-hidden="true" className="authenticated-nav-symbol"><DashboardIcon name={item.icon} /></span>
            <span>{item.label}</span>
          </>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <a aria-current={activeNav === item.id ? "page" : undefined} className={`authenticated-nav-link${activeNav === item.id ? " is-active" : ""}`} href={item.href}>
                {content}
              </a>
            ) : (
              <span aria-disabled="true" className="authenticated-nav-link is-disabled" title="Módulo em desenvolvimento">
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AccountMenu({ displayName, email, farmName }: Readonly<{ displayName: string; email: string; farmName: string }>) {
  return (
    <details className="authenticated-account-menu">
      <summary aria-label={`Abrir menu de ${displayName}`} className="authenticated-account-summary">
        <span aria-hidden="true" className="authenticated-account-avatar">{initialsFromName(displayName)}</span>
        <span className="authenticated-account-copy">
          <strong>{displayName}</strong>
          <small>{farmName}</small>
        </span>
        <span aria-hidden="true" className="authenticated-account-chevron">⌄</span>
      </summary>
      <div className="authenticated-account-menu-panel">
        <div className="authenticated-account-menu-heading">
          <strong>{displayName}</strong>
          <small>{email}</small>
          <span>{farmName}</span>
        </div>
        <nav aria-label="Ações da conta" className="authenticated-account-menu-links">
          <a href="/configuracoes/criatorio">Meu Criatório</a>
          <a href="/configuracoes">Configurações</a>
          <a href="/login">Gerenciar sessão</a>
        </nav>
      </div>
    </details>
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
            <span className="authenticated-brand-tagline">Gestão com paixão</span>
          </a>
          <nav aria-label="Módulos disponíveis" className="authenticated-desktop-nav">
            <NavigationLinks activeNav={activeNav} />
          </nav>
          <nav aria-label="Conta e configurações" className="authenticated-sidebar-secondary-nav">
            <NavigationLinks activeNav={activeNav} items={secondaryNavigation} />
          </nav>
          <div className="authenticated-sidebar-inspiration" aria-label="Mensagem inspiradora">
            <p>“Grandes criatórios começam com boas histórias.”</p>
            <span aria-hidden="true"><DashboardIcon name="leaf" /></span>
            <small>Criatório Virtual</small>
          </div>
        </aside>

        <div className="authenticated-main">
          <header className="authenticated-topbar">
            <div aria-label="Busca no sistema" className="authenticated-search" role="search">
              <span aria-hidden="true">⌕</span>
              <span>Buscar no sistema...</span>
            </div>
            <div className="authenticated-topbar-actions">
              <AccountMenu displayName={displayName} email={email} farmName={farmName} />
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
                <nav aria-label="Conta e configurações no celular" className="authenticated-mobile-menu-links">
                  <NavigationLinks activeNav={activeNav} items={secondaryNavigation} />
                </nav>
                <div className="authenticated-mobile-account">
                  <strong>{displayName}</strong>
                  <small>{email}</small>
                  <a href="/login">Gerenciar sessão</a>
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
