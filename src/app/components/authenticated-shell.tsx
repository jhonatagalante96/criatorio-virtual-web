import React, { useEffect } from "react";
import Link from "next/link";
import { getLastKnownShellIdentity, isKnownFarmName, rememberShellIdentity } from "../../lib/auth/shell-identity";
import { useAccessContext } from "../../lib/auth/access-provider";
import { resolveOnboardingRoute } from "../../lib/auth/access-context";
import { AppLoadingContent } from "./app-loading-state";
import { BrandLockup, BrandPanel } from "./brand";
import { DashboardIcon } from "./dashboard-icons";
import { PwaInstallPrompt } from "./pwa-install-prompt";
import { SessionRecovery } from "./session-recovery";
import type { DashboardIconName } from "./dashboard-icons";

export type AuthenticatedNav = "dashboard" | "statistics" | "birds" | "reproduction" | "transfers" | "competitions" | "documents" | "farm" | "subscription" | "settings";

interface AuthenticatedShellProps {
  activeNav: AuthenticatedNav;
  children: React.ReactNode;
  email?: string;
  farmName?: string;
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
  { href: "/competicoes", icon: "trophy", id: "competitions", label: "Competições" },
  { href: "/documentos", icon: "document", id: "documents", label: "Documentos" }
];

const secondaryNavigation: NavigationItem[] = [
  { href: "/configuracoes/criatorio", icon: "farm", id: "farm", label: "Meu Criatório" },
  { href: "/assinatura", icon: "crown", id: "subscription", label: "Assinatura" },
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

function NavigationLinks({
  activeNav,
  canAccessApp = true,
  items = primaryNavigation
}: Readonly<{
  activeNav: AuthenticatedNav;
  canAccessApp?: boolean;
  items?: NavigationItem[];
}>) {
  return (
    <ul className="authenticated-nav-list">
      {items.map((item) => {
        const isFunctional = primaryNavigation.some((primary) => primary.id === item.id) || item.id === "farm";
        const isBlocked = !canAccessApp && isFunctional;

        const content = (
          <>
            <span aria-hidden="true" className="authenticated-nav-symbol"><DashboardIcon name={item.icon} /></span>
            <span>{item.label}</span>
          </>
        );

        if (isBlocked) {
          return (
            <li key={item.id}>
              <span aria-disabled="true" className="authenticated-nav-link is-disabled" title="Acesso bloqueado por pendência de assinatura">
                {content}
              </span>
            </li>
          );
        }

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

function AuthenticatedShellLayout({
  activeNav,
  canAccessApp = true,
  children,
  displayName,
  email,
  farmName
}: Readonly<{
  activeNav: AuthenticatedNav;
  canAccessApp?: boolean;
  children: React.ReactNode;
  displayName: string;
  email: string;
  farmName: string;
}>) {
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
              <NavigationLinks activeNav={activeNav} canAccessApp={canAccessApp} />
            </nav>
            <nav aria-label="Conta e configurações" className="authenticated-sidebar-secondary-nav">
              <NavigationLinks activeNav={activeNav} canAccessApp={canAccessApp} items={secondaryNavigation} />
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
              <AccountMenu displayName={displayName} email={email} farmName={farmName} />
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
                  <strong suppressHydrationWarning title={farmName}>{farmName}</strong>
                </div>
                <nav aria-label="Módulos disponíveis no celular">
                  <NavigationLinks activeNav={activeNav} canAccessApp={canAccessApp} />
                </nav>
                <nav aria-label="Conta e configurações no celular" className="authenticated-mobile-menu-links">
                  <NavigationLinks activeNav={activeNav} canAccessApp={canAccessApp} items={secondaryNavigation} />
                </nav>
                <div className="authenticated-mobile-menu-account">
                  <strong suppressHydrationWarning>{displayName}</strong>
                  <small suppressHydrationWarning>{email}</small>
                  <Link href="/configuracoes?section=session">Gerenciar sessão</Link>
                </div>
              </div>
            </details>
            <Link aria-label="Ir para o painel" className="authenticated-brand" href="/dashboard">
              <BrandLockup />
            </Link>
            <div className="authenticated-mobile-account-control">
              <AccountMenu compact displayName={displayName} email={email} farmName={farmName} />
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

export function AuthenticatedShell({ activeNav, children, email = "", farmName = "" }: Readonly<AuthenticatedShellProps>) {
  const access = useAccessContext();
  const cachedIdentity = getLastKnownShellIdentity();

  const contextEmail = access?.accessContext?.user?.email;
  const contextFarmName = access?.accessContext?.breedingFarm?.name;

  const resolvedEmail = email || contextEmail || cachedIdentity.email || "";
  const resolvedFarmName = isKnownFarmName(farmName)
    ? farmName
    : contextFarmName || cachedIdentity.farmName || farmName || "Criatório Virtual";
  const displayName = displayNameFromEmail(resolvedEmail);

  useEffect(() => {
    if (resolvedEmail || resolvedFarmName) {
      rememberShellIdentity({ email: resolvedEmail, farmName: resolvedFarmName });
    }
  }, [resolvedEmail, resolvedFarmName]);

  // Se estiver dentro de AccessProvider, aplicar a guarda de acesso
  if (access) {
    if (access.status === "loading") {
      return (
        <AuthenticatedShellLayout
          activeNav={activeNav}
          canAccessApp={false}
          displayName={displayName}
          email={resolvedEmail}
          farmName={resolvedFarmName}
        >
          <AppLoadingContent
            label="Carregando"
            message="Um instante enquanto verificamos seu acesso."
          />
        </AuthenticatedShellLayout>
      );
    }

    if (access.status === "unauthenticated") {
      return <SessionRecovery />;
    }

    if (access.status === "error") {
      return (
        <main className="auth-page dashboard-access-page">
          <a className="skip-link" href="#conteudo-shell-erro">Pular para o conteúdo</a>
          <div className="auth-shell dashboard-access-shell">
            <BrandPanel />
            <section aria-labelledby="titulo-shell-erro" className="auth-form-panel">
              <div className="auth-form-content auth-state-card" id="conteudo-shell-erro">
                <BrandLockup stacked />
                <h1 id="titulo-shell-erro" tabIndex={-1}>Não foi possível verificar seu acesso</h1>
                <p className="lede">{access.error ?? "Ocorreu um erro ao validar as permissões da sua conta. Tente novamente para continuar."}</p>
                <button className="auth-secondary-action" onClick={() => void access.refetch()} type="button">
                  Tentar novamente
                </button>
              </div>
            </section>
          </div>
        </main>
      );
    }

    if (access.status === "ready" && access.accessContext) {
      const { breedingFarm, onboarding, access: accessDetails } = access.accessContext;

      // 1. Precedência: Sem criatório ou onboarding pendente -> retomada do onboarding (não tela de inadimplência)
      if (!breedingFarm || onboarding.status === "Pending") {
        const onboardingHref = resolveOnboardingRoute(onboarding.nextStep, Boolean(breedingFarm));
        const isSelecting = onboarding.nextStep === "SelectBreedingFarm" || (breedingFarm !== null && onboarding.nextStep !== "CreateBreedingFarm");
        const actionLabel = isSelecting ? "Selecionar criatório" : "Criar meu criatório";
        const heading = isSelecting ? "Selecione um criatório" : "Crie seu primeiro criatório";
        const message = isSelecting
          ? "Escolha um criatório para acessar o painel e os recursos do sistema."
          : "Ainda não existe um criatório vinculado a esta conta. Crie um agora para liberar seu acesso.";

        return (
          <main className="auth-page dashboard-access-page">
            <a className="skip-link" href="#conteudo-shell-onboarding">Pular para o conteúdo</a>
            <div className="auth-shell dashboard-access-shell">
              <BrandPanel />
              <section aria-labelledby="titulo-shell-onboarding" className="auth-form-panel">
                <div className="auth-form-content auth-state-card" id="conteudo-shell-onboarding">
                  <BrandLockup stacked />
                  <h1 id="titulo-shell-onboarding" tabIndex={-1}>{heading}</h1>
                  <p className="lede">{message}</p>
                  <Link className="auth-primary-action" href={onboardingHref}>{actionLabel}</Link>
                </div>
              </section>
            </div>
          </main>
        );
      }

      // 2. Precedência: canAccessApp === false -> bloquear conteúdo funcional e obedecer exclusivamente a requiredAction
      if (!accessDetails.canAccessApp) {
        if (activeNav === "subscription" && (accessDetails.requiredAction === "Regularize" || accessDetails.requiredAction === "Resubscribe")) {
          return (
            <AuthenticatedShellLayout
              activeNav={activeNav}
              canAccessApp={false}
              displayName={displayName}
              email={resolvedEmail}
              farmName={resolvedFarmName}
            >
              {children}
            </AuthenticatedShellLayout>
          );
        }

        let heading = "Acesso suspenso";
        let message = "O acesso funcional deste criatório está temporariamente bloqueado. Entre em contato com o suporte para mais informações.";
        let actionHref: string | undefined;
        let actionLabel: string | undefined;

        if (accessDetails.requiredAction === "Subscribe") {
          heading = "Assinatura necessária";
          message = "Para acessar as funcionalidades do criatório, inicie seu período de avaliação ou contrate uma assinatura.";
          actionHref = "/billing/subscription-checkout";
          actionLabel = "Contratar assinatura";
        } else if (accessDetails.requiredAction === "Regularize") {
          heading = "Acesso bloqueado por pagamento pendente";
          message = "Existe uma fatura em aberto para o criatório. Regularize seu pagamento para restabelecer o acesso funcional.";
          actionHref = "/assinatura";
          actionLabel = "Regularizar pagamento";
        } else if (accessDetails.requiredAction === "Resubscribe") {
          heading = "Assinatura cancelada";
          message = "A assinatura deste criatório foi cancelada. Reative sua assinatura para recuperar o acesso às funcionalidades.";
          actionHref = "/assinatura";
          actionLabel = "Reativar assinatura";
        }

        return (
          <main className="auth-page dashboard-access-page">
            <a className="skip-link" href="#conteudo-shell-bloqueado">Pular para o conteúdo</a>
            <div className="auth-shell dashboard-access-shell">
              <BrandPanel />
              <section aria-labelledby="titulo-shell-bloqueado" className="auth-form-panel">
                <div className="auth-form-content auth-state-card" id="conteudo-shell-bloqueado">
                  <BrandLockup stacked />
                  <h1 id="titulo-shell-bloqueado" tabIndex={-1}>{heading}</h1>
                  <p className="lede">{message}</p>
                  {actionHref && actionLabel ? (
                    <Link className="auth-primary-action" href={actionHref}>{actionLabel}</Link>
                  ) : (
                    <button className="auth-secondary-action" onClick={() => void access.refetch()} type="button">
                      Verificar novamente
                    </button>
                  )}
                </div>
              </section>
            </div>
          </main>
        );
      }
    }
  }

  return (
    <AuthenticatedShellLayout
      activeNav={activeNav}
      canAccessApp={access?.accessContext?.access?.canAccessApp ?? true}
      displayName={displayName}
      email={resolvedEmail}
      farmName={resolvedFarmName}
    >
      {children}
    </AuthenticatedShellLayout>
  );
}
