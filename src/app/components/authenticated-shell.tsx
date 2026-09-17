import React, { useEffect } from "react";
import Link from "next/link";
import { getLastKnownShellIdentity, isKnownFarmName, rememberShellIdentity } from "../../lib/auth/shell-identity";
import { BrandLockup } from "./brand";
import { DashboardIcon } from "./dashboard-icons";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import type { DashboardIconName } from "./dashboard-icons";

export type AuthenticatedNav = "dashboard" | "statistics" | "birds" | "reproduction" | "transfers" | "documents" | "farm" | "settings";

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
  { href: "/dashboard", icon: "home", id: "dashboard", label: "Painel" },
  { href: "/estatisticas", icon: "chart", id: "statistics", label: "Estatísticas" },
  { href: "/plantel/aves", icon: "bird", id: "birds", label: "Aves" },
  { href: "/reproducao", icon: "heart", id: "reproduction", label: "Reprodução" },
  { href: "/transferencias", icon: "transfer", id: "transfers", label: "Transferências" },
  { icon: "trophy", id: "competitions", label: "Competições" },
  { href: "/documentos", icon: "document", id: "documents", label: "Documentos" }
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
              <Link aria-current={activeNav === item.id ? "page" : undefined} className={`authenticated-nav-link${activeNav === item.id ? " is-active" : ""}`} href={item.href}>
                {content}
              </Link>
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

function AccountMenu({ compact = false, displayName, email, farmName }: Readonly<{ compact?: boolean; displayName: string; email: string; farmName: string }>) {
  return (
    <details className={`authenticated-account-menu${compact ? " authenticated-account-menu-compact" : ""}`}>
      <summary aria-label={`Abrir menu de ${displayName}`} className="authenticated-account-summary" suppressHydrationWarning>
        <span aria-hidden="true" className="authenticated-account-avatar" suppressHydrationWarning>{initialsFromName(displayName)}</span>
        <span className="authenticated-account-copy">
          <strong suppressHydrationWarning>{displayName}</strong>
          <small suppressHydrationWarning>{farmName}</small>
        </span>
        <span aria-hidden="true" className="authenticated-account-chevron">
          <svg viewBox="0 0 16 16"><path d="m4.5 6.25 3.5 3.5 3.5-3.5" /></svg>
        </span>
      </summary>
      <div className="authenticated-account-menu-panel">
        <div className="authenticated-account-menu-heading">
          <strong suppressHydrationWarning>{displayName}</strong>
          <small suppressHydrationWarning>{email}</small>
          <span suppressHydrationWarning>{farmName}</span>
        </div>
        <nav aria-label="Ações da conta" className="authenticated-account-menu-links">
          <Link href="/configuracoes/criatorio">Meu Criatório</Link>
          <Link href="/configuracoes">Configurações</Link>
          <Link href="/configuracoes?section=session">Gerenciar sessão</Link>
        </nav>
      </div>
    </details>
  );
}

export function AuthenticatedShell({ activeNav, children, email, farmName }: Readonly<AuthenticatedShellProps>) {
  const cachedIdentity = getLastKnownShellIdentity();
  const resolvedEmail = email || cachedIdentity.email || "";
  const resolvedFarmName = isKnownFarmName(farmName) ? farmName : cachedIdentity.farmName || farmName;
  const displayName = displayNameFromEmail(resolvedEmail);

  useEffect(() => {
    rememberShellIdentity({ email, farmName });
  }, [email, farmName]);

  return (
    <main className="authenticated-page">
      <a className="skip-link" href="#conteudo-autenticado">Pular para o conteúdo</a>
      <div className="authenticated-shell">
        <aside aria-label="Navegação principal" className="authenticated-sidebar">
          <Link aria-label="Ir para o painel" className="authenticated-brand" href="/dashboard">
            <BrandLockup />
          </Link>
          <div className="authenticated-sidebar-navigation">
            <nav aria-label="Módulos disponíveis" className="authenticated-desktop-nav">
              <NavigationLinks activeNav={activeNav} />
            </nav>
            <nav aria-label="Conta e configurações" className="authenticated-sidebar-secondary-nav">
              <NavigationLinks activeNav={activeNav} items={secondaryNavigation} />
            </nav>
          </div>
          <div className="authenticated-sidebar-inspiration" aria-label="Mensagem inspiradora">
            <p>“Grandes criatórios começam com boas histórias.”</p>
            <img alt="" aria-hidden="true" src="/assets/brand/png/criatorio-virtual-symbol.png" />
            <small>Criatório Virtual</small>
          </div>
        </aside>

        <div className="authenticated-main">
          <PwaInstallPrompt />
          <header className="authenticated-topbar">
            <div aria-label="Busca no sistema" className="authenticated-search" role="search">
              <span aria-hidden="true">⌕</span>
              <span>Buscar no sistema...</span>
            </div>
            <div className="authenticated-topbar-actions">
              <AccountMenu displayName={displayName} email={resolvedEmail} farmName={resolvedFarmName} />
            </div>
          </header>
          <header className="authenticated-mobile-header">
            <details className="authenticated-mobile-menu">
              <summary aria-label="Abrir menu principal">
                <img alt="" aria-hidden="true" src="/assets/icons/ui/menu.svg" />
                <span className="sr-only">Menu</span>
              </summary>
              <div className="authenticated-mobile-menu-panel">
                <div className="authenticated-farm-context">
                  <span className="authenticated-context-label">Criatório selecionado</span>
                  <strong suppressHydrationWarning title={resolvedFarmName}>{resolvedFarmName}</strong>
                </div>
                <nav aria-label="Módulos disponíveis no celular">
                  <NavigationLinks activeNav={activeNav} />
                </nav>
                <nav aria-label="Conta e configurações no celular" className="authenticated-mobile-menu-links">
                  <NavigationLinks activeNav={activeNav} items={secondaryNavigation} />
                </nav>
                <div className="authenticated-mobile-menu-account">
                  <strong suppressHydrationWarning>{displayName}</strong>
                  <small suppressHydrationWarning>{resolvedEmail}</small>
                  <Link href="/configuracoes?section=session">Gerenciar sessão</Link>
                </div>
              </div>
            </details>
            <Link aria-label="Ir para o painel" className="authenticated-brand" href="/dashboard">
              <BrandLockup />
            </Link>
            <div className="authenticated-mobile-account-control">
              <AccountMenu compact displayName={displayName} email={resolvedEmail} farmName={resolvedFarmName} />
            </div>
          </header>
          <div className="authenticated-content" id="conteudo-autenticado">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
