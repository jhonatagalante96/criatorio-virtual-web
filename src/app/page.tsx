import React from "react";
import Link from "next/link";
import { BrandLockup } from "./components/brand";
import { DashboardIcon } from "./components/dashboard-icons";
import type { DashboardIconName } from "./components/dashboard-icons";
import { GoogleAuthenticationCallback } from "./components/google-authentication-callback";

const navigationItems = [
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Plano" }
];

const featureItems: Array<{
  icon: DashboardIconName;
  title: string;
  copy: string;
}> = [
  {
    icon: "home",
    title: "Painel do criatório",
    copy: "Veja indicadores, pendências e atividades recentes em uma visão geral."
  },
  {
    icon: "bird",
    title: "Gestão de aves",
    copy: "Cadastre seu plantel e consulte os dados e a genealogia de cada ave."
  },
  {
    icon: "heart",
    title: "Reprodução",
    copy: "Registre reproduções e acompanhe os cruzamentos do seu criatório."
  },
  {
    icon: "transfer",
    title: "Transferências",
    copy: "Organize as movimentações internas e externas do plantel."
  },
  {
    icon: "document",
    title: "Documentos",
    copy: "Emita crachás, certificados de genealogia e documentos de procedência; gere relatórios temporários do plantel."
  },
  {
    icon: "chart",
    title: "Estatísticas",
    copy: "Acompanhe a composição do plantel e as movimentações dos últimos 30 dias."
  }
];

const previewModules: Array<{
  icon: DashboardIconName;
  label: string;
  disabled?: boolean;
}> = [
  { icon: "home", label: "Painel" },
  { icon: "chart", label: "Estatísticas" },
  { icon: "bird", label: "Aves" },
  { icon: "heart", label: "Reprodução" },
  { icon: "transfer", label: "Transferências" },
  { icon: "document", label: "Documentos" },
  { icon: "trophy", label: "Competições", disabled: true }
];

const previewMetrics: Array<{
  icon: DashboardIconName;
  label: string;
  tone: string;
}> = [
  { icon: "bird", label: "Aves ativas", tone: "green" },
  { icon: "heart", label: "Reproduções registradas", tone: "rose" },
  { icon: "alert", label: "Pendências", tone: "orange" },
  { icon: "transfer", label: "Transferências", tone: "blue" }
];

const previewActions: Array<{
  icon: DashboardIconName;
  label: string;
  tone: string;
  disabled?: boolean;
}> = [
  { icon: "bird", label: "Cadastrar ave", tone: "green" },
  { icon: "heart", label: "Registrar reprodução", tone: "rose" },
  { icon: "transfer", label: "Nova transferência", tone: "blue" },
  { icon: "trophy", label: "Competições", tone: "purple", disabled: true }
];

function ArrowIcon() {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function MenuIcon() {
  return <img src="/assets/icons/ui/menu.svg" alt="" aria-hidden="true" />;
}

function DashboardPreview() {
  return (
    <div className="landing-preview-wrap">
      <article className="landing-preview" aria-label="Prévia ilustrativa do painel do Criatório Virtual">
        <aside className="landing-preview-sidebar" aria-label="Navegação ilustrativa do painel">
          <BrandLockup className="landing-preview-brand" />
          <div className="landing-preview-farm">
            <span>Criatório selecionado</span>
            <strong>Seu criatório</strong>
          </div>
          <nav aria-label="Módulos do painel">
            <ul className="landing-preview-module-list">
              {previewModules.map((module, index) => (
                <li key={module.label}>
                  <span className={"landing-preview-module" + (index === 0 ? " is-active" : "") + (module.disabled ? " is-disabled" : "")} aria-disabled={module.disabled || undefined}>
                    <DashboardIcon name={module.icon} />
                    <span>{module.label}</span>
                    {module.disabled && <small>Em desenvolvimento</small>}
                  </span>
                </li>
              ))}
            </ul>
          </nav>
          <div className="landing-preview-sidebar-footer">
            <span className="landing-preview-brand-symbol">
              <img src="/assets/brand/png/criatorio-virtual-symbol.png" alt="" />
            </span>
            <span><strong>Criatório Virtual</strong><small>Gestão do criatório</small></span>
          </div>
        </aside>

        <div className="landing-preview-main">
          <div className="landing-preview-mobile-header">
            <BrandLockup className="landing-preview-brand" />
            <MenuIcon />
          </div>
          <div className="landing-preview-topbar">
            <span><DashboardIcon name="search" /> Buscar no sistema...</span>
            <span className="landing-preview-avatar" aria-hidden="true">CV</span>
          </div>

          <div className="landing-preview-content">
            <header className="landing-preview-page-heading">
              <div>
                <span className="landing-preview-kicker">VISÃO DO CRIATÓRIO</span>
                <h2>Painel</h2>
                <p>Indicadores e atualizações em um só lugar.</p>
              </div>
              <span className="landing-preview-period"><DashboardIcon name="calendar" /> Últimos 30 dias</span>
            </header>

            <section className="landing-preview-metrics" aria-label="Indicadores do criatório">
              {previewMetrics.map((metric) => (
                <article className={"landing-preview-metric tone-" + metric.tone} key={metric.label}>
                  <span className="landing-preview-metric-icon"><DashboardIcon name={metric.icon} /></span>
                  <span className="landing-preview-metric-copy">
                    <strong aria-label="Valor exibido após entrar">—</strong>
                    <small>{metric.label}</small>
                  </span>
                  <span className="landing-preview-metric-arrow" aria-hidden="true">›</span>
                </article>
              ))}
            </section>

            <div className="landing-preview-primary-grid">
              <section className="landing-preview-card landing-preview-analytics">
                <header>
                  <div><span>VISÃO ANALÍTICA</span><h3>Resumo do criatório</h3></div>
                  <span>Ver estatísticas <span aria-hidden="true">›</span></span>
                </header>
                <p>Plantel atual e movimentações do período.</p>
                <div className="landing-preview-chart">
                  <div className="landing-preview-chart-y" aria-hidden="true"><span>Plantel</span><span>Atividade</span><span>Período</span></div>
                  <svg viewBox="0 0 360 96" preserveAspectRatio="none" aria-hidden="true">
                    <path className="landing-preview-chart-grid" d="M0 16H360M0 48H360M0 80H360" />
                    <path className="landing-preview-chart-registered" d="M2 72C30 67 42 73 63 56S97 63 120 45 153 48 180 36 215 49 238 28 272 34 296 21 332 35 358 9" />
                    <path className="landing-preview-chart-births" d="M2 86C30 84 42 80 63 83S97 76 120 79 153 68 180 74 215 61 238 67 272 52 296 59 332 48 358 45" />
                  </svg>
                </div>
                <div className="landing-preview-chart-legend"><span>Aves cadastradas</span><span>Nascimentos</span></div>
              </section>

              <section className="landing-preview-card landing-preview-actions">
                <header><div><span>ACESSO RÁPIDO</span><h3>Atalhos rápidos</h3></div></header>
                <p>Acesse as principais funções.</p>
                <ul>
                  {previewActions.map((action) => (
                    <li className={"tone-" + action.tone + (action.disabled ? " is-disabled" : "")} key={action.label} aria-disabled={action.disabled || undefined}>
                      <span className="landing-preview-action-icon"><DashboardIcon name={action.icon} /></span>
                      <strong>{action.label}</strong>
                      {action.disabled && <small>Em desenvolvimento</small>}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="landing-preview-secondary-grid">
              <section className="landing-preview-card">
                <header><div><span>ATENÇÃO</span><h3>Pendências</h3></div><span className="landing-preview-count">—</span></header>
                <div className="landing-preview-empty"><span aria-hidden="true">✓</span><p>Veja aqui os itens que precisam da sua atenção.</p></div>
              </section>
              <section className="landing-preview-card">
                <header><div><span>ACOMPANHE DE PERTO</span><h3>Atividades recentes</h3></div></header>
                <div className="landing-preview-empty"><span aria-hidden="true">•</span><p>Os registros do seu criatório aparecem nesta área.</p></div>
              </section>
            </div>
          </div>
        </div>
      </article>
      <p className="landing-preview-caption"><span aria-hidden="true">i</span> Prévia ilustrativa. Seus indicadores reais aparecem após entrar.</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing-page" id="inicio">
      <GoogleAuthenticationCallback />
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      <div className="landing-shell">
        <header className="landing-header">
          <a className="landing-brand-link" href="#inicio" aria-label="Criatório Virtual, voltar ao início">
            <BrandLockup />
          </a>
          <nav className="landing-nav" aria-label="Navegação principal">
            <ul>
              {navigationItems.map((item) => (
                <li key={item.href}><a href={item.href}>{item.label}</a></li>
              ))}
            </ul>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-login-link" href="/login">Entrar</Link>
            <Link className="landing-header-cta" href="/cadastro">Criar conta <ArrowIcon /></Link>
          </div>
          <details className="landing-mobile-menu">
            <summary aria-label="Abrir menu de navegação"><MenuIcon /></summary>
            <nav aria-label="Navegação móvel">
              <ul>
                {navigationItems.map((item) => (
                  <li key={item.href}><a href={item.href}>{item.label}</a></li>
                ))}
                <li><Link href="/login">Entrar</Link></li>
              </ul>
            </nav>
          </details>
        </header>

        <div id="conteudo-principal" className="landing-main" tabIndex={-1}>
          <section className="landing-hero" aria-labelledby="titulo-principal">
            <div className="landing-copy">
              <p className="eyebrow">GESTÃO FEITA PARA CRIADORES</p>
              <h1 id="titulo-principal">Seu criatório organizado. Sua rotina mais clara.</h1>
              <p className="landing-lede">Gerencie aves, reproduções, transferências e documentos. Acompanhe os indicadores e as pendências do criatório no mesmo painel.</p>
              <div className="landing-actions">
                <Link className="primary-action" href="/cadastro">Criar minha conta <ArrowIcon /></Link>
                <Link className="secondary-action landing-secondary-action" href="/login">Já tenho conta</Link>
              </div>
              <p className="landing-plan-note"><DashboardIcon name="shield" /> Um plano com as mesmas funcionalidades nas opções mensal e anual.</p>
            </div>
            <DashboardPreview />
          </section>

          <section id="recursos" className="landing-features" aria-labelledby="titulo-recursos">
            <div className="landing-section-heading">
              <div>
                <p className="eyebrow">RECURSOS INCLUÍDOS</p>
                <h2 id="titulo-recursos">Tudo do plantel às movimentações, no mesmo lugar.</h2>
              </div>
              <p>O plano reúne as ferramentas que aparecem no painel do Criatório Virtual.</p>
            </div>
            <div className="landing-feature-grid">
              {featureItems.map((feature) => (
                <article className="landing-feature-card" key={feature.title}>
                  <span className="landing-feature-icon"><DashboardIcon name={feature.icon} /></span>
                  <div><h3>{feature.title}</h3><p>{feature.copy}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section id="planos" className="landing-section plans-section" aria-labelledby="titulo-planos">
            <div className="landing-section-heading">
              <div>
                <p className="eyebrow">PLANO CRIATÓRIO VIRTUAL</p>
                <h2 id="titulo-planos">Um plano. Todas as funcionalidades disponíveis.</h2>
              </div>
              <p>Escolha a periodicidade. Os recursos incluídos são os mesmos.</p>
            </div>
            <article className="single-plan-card">
              <div className="plan-summary">
                <span className="plan-label">Tudo incluído</span>
                <h3>Uma gestão completa para o seu criatório.</h3>
                <p>Use os módulos disponíveis no painel com uma única assinatura.</p>
                <ul>
                  {featureItems.map((feature) => <li key={feature.title}>{feature.title}</li>)}
                </ul>
              </div>
              <div className="billing-options" role="group" aria-label="Opções de assinatura">
                <div className="billing-option">
                  <div>
                    <span className="billing-period">Assinatura mensal</span>
                    <p>Cobrança realizada todos os meses.</p>
                  </div>
                  <p className="plan-price"><strong>R$ 19,90</strong><span>por mês</span></p>
                </div>
                <div className="billing-option billing-option-featured">
                  <span className="savings-badge">2 meses grátis</span>
                  <div>
                    <span className="billing-period">Assinatura anual</span>
                    <p>Uma cobrança por ano.</p>
                  </div>
                  <p className="plan-price"><strong>R$ 199,90</strong><span>por ano</span></p>
                </div>
                <Link className="primary-action plan-action" href="/cadastro">Criar minha conta <ArrowIcon /></Link>
              </div>
            </article>
          </section>

          <section className="landing-closing" aria-labelledby="titulo-final">
            <div>
              <p className="eyebrow">CRIATÓRIO VIRTUAL</p>
              <h2 id="titulo-final">Mais clareza para cuidar do que importa.</h2>
              <p>Organize os registros do seu criatório e acompanhe tudo pelo painel.</p>
            </div>
            <Link className="landing-closing-action" href="/cadastro">Começar agora <ArrowIcon /></Link>
          </section>
        </div>

        <footer className="landing-footer">
          <span className="landing-footer-brand"><BrandLockup /></span>
          <span className="landing-footer-links"><a href="#recursos">Recursos</a><span aria-hidden="true">•</span><a href="#planos">Plano</a></span>
          <span className="landing-footer-actions">
            <a href="#inicio">Voltar ao topo</a>
            <a className="landing-support" href="mailto:suporte@criatoriovirtual.com.br">Falar com o suporte</a>
          </span>
        </footer>
      </div>
    </main>
  );
}
