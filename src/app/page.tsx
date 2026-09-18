import React from "react";
import Link from "next/link";
import { BrandLockup } from "./components/brand";
import { DashboardIcon } from "./components/dashboard-icons";
import type { DashboardIconName } from "./components/dashboard-icons";
import { GoogleAuthenticationCallback } from "./components/google-authentication-callback";

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
  },
  {
    icon: "trophy",
    title: "Competições",
    copy: "Registre resultados e acompanhe o histórico competitivo das suas aves."
  }
];

const previewModules: Array<{
  icon: DashboardIconName;
  label: string;
}> = [
  { icon: "home", label: "Painel" },
  { icon: "chart", label: "Estatísticas" },
  { icon: "bird", label: "Aves" },
  { icon: "heart", label: "Reprodução" },
  { icon: "transfer", label: "Transferências" },
  { icon: "trophy", label: "Competições" },
  { icon: "document", label: "Documentos" }
];

const previewMetrics: Array<{
  icon: DashboardIconName;
  label: string;
  value: string;
  tone: string;
}> = [
  { icon: "bird", label: "Aves Ativas", value: "42", tone: "green" },
  { icon: "heart", label: "Reproduções registradas", value: "8", tone: "rose" },
  { icon: "alert", label: "Pendências", value: "2", tone: "orange" },
  { icon: "transfer", label: "Transferências", value: "5", tone: "blue" }
];

const previewSummaryMetrics = [
  { icon: "bird" as const, label: "Aves no plantel", value: "68" },
  { icon: "calendar" as const, label: "Nascimentos · 30 dias", value: "7" },
  { icon: "heart" as const, label: "Reproduções iniciadas", value: "4" },
  { icon: "transfer" as const, label: "Saídas · 30 dias", value: "3" }
];

const previewDistributions = [
  {
    title: "Distribuição por sexo",
    rows: [
      { label: "Fêmeas", value: "34", width: "50%" },
      { label: "Machos", value: "30", width: "44%" },
      { label: "Não informado", value: "4", width: "12%" }
    ]
  },
  {
    title: "Principais espécies",
    rows: [
      { label: "Curió", value: "22", width: "78%" },
      { label: "Canário", value: "12", width: "43%" },
      { label: "Trinca-ferro", value: "9", width: "32%" }
    ]
  }
];

const previewActions: Array<{
  icon: DashboardIconName;
  label: string;
  tone: string;
  description: string;
}> = [
  { icon: "bird", label: "Cadastrar ave", description: "Adicione uma nova ave ao seu criatório", tone: "green" },
  { icon: "heart", label: "Registrar reprodução", description: "Acompanhe seus cruzamentos", tone: "rose" },
  { icon: "transfer", label: "Nova transferência", description: "Registre entrada ou saída de aves", tone: "blue" },
  { icon: "trophy", label: "Registrar competição", description: "Adicione resultados de competições", tone: "purple" }
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
          <nav aria-label="Módulos do painel">
            <ul className="landing-preview-module-list">
              {previewModules.map((module, index) => (
                <li key={module.label}>
                  <span className={"landing-preview-module" + (index === 0 ? " is-active" : "")}>
                    <DashboardIcon name={module.icon} />
                    <span>{module.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </nav>
          <div className="landing-preview-farm-link">
            <DashboardIcon name="home" />
            <span>Meu Criatório</span>
            <span aria-hidden="true">⌄</span>
          </div>
          <div className="landing-preview-sidebar-inspiration">
            <p>“Grandes criatórios começam com boas histórias.”</p>
            <img src="/assets/brand/png/criatorio-virtual-symbol.png" alt="" />
            <small>Criatório Virtual</small>
          </div>
        </aside>

        <div className="landing-preview-main">
          <div className="landing-preview-mobile-header">
            <MenuIcon />
            <BrandLockup className="landing-preview-brand" />
            <span className="landing-preview-avatar" aria-hidden="true">CV</span>
          </div>
          <div className="landing-preview-topbar">
            <span><DashboardIcon name="search" /> Buscar no sistema...</span>
            <span className="landing-preview-profile">
              <span className="landing-preview-avatar" aria-hidden="true">CV</span>
              <span><strong>Criador</strong><small>Seu criatório</small></span>
              <span aria-hidden="true">⌄</span>
            </span>
          </div>

          <div className="landing-preview-content">
            <header className="landing-preview-page-heading">
              <div>
                <h2>Painel</h2>
                <p>Visão geral do seu criatório. Acompanhe suas aves, reproduções, transferências e muito mais.</p>
              </div>
              <div className="landing-preview-page-context">
                <p><DashboardIcon name="calendar" /> <span>Hoje</span></p>
                <p><DashboardIcon name="leaf" /> <span>Que tal fazer hoje um grande dia para o seu criatório?</span></p>
              </div>
            </header>

            <section className="landing-preview-metrics" aria-label="Indicadores do criatório">
              {previewMetrics.map((metric) => (
                <article className={"landing-preview-metric tone-" + metric.tone} key={metric.label}>
                  <span className="landing-preview-metric-icon"><DashboardIcon name={metric.icon} /></span>
                  <span className="landing-preview-metric-copy">
                    <strong>{metric.value}</strong>
                    <small>{metric.label}</small>
                  </span>
                  <span className="landing-preview-metric-arrow" aria-hidden="true">›</span>
                </article>
              ))}
            </section>

            <section className="landing-preview-card landing-preview-statistics" aria-labelledby="landing-preview-summary-title">
              <header className="landing-preview-section-heading">
                <div>
                  <span>VISÃO ANALÍTICA</span>
                  <h3 id="landing-preview-summary-title">Resumo do criatório</h3>
                  <p>Plantel atual e movimentações dos últimos 30 dias.</p>
                </div>
                <span className="landing-preview-link">Ver estatísticas <span aria-hidden="true">›</span></span>
              </header>
              <div className="landing-preview-summary-metrics">
                {previewSummaryMetrics.map((metric) => (
                  <div className="landing-preview-summary-metric" key={metric.label}>
                    <span><DashboardIcon name={metric.icon} /></span>
                    <strong>{metric.value}</strong>
                    <small>{metric.label}</small>
                    <span aria-hidden="true" className="landing-preview-summary-arrow">›</span>
                  </div>
                ))}
              </div>
              <div className="landing-preview-distributions">
                {previewDistributions.map((distribution) => (
                  <section className="landing-preview-distribution" key={distribution.title}>
                    <h4>{distribution.title}</h4>
                    <ul>
                      {distribution.rows.map((row) => (
                        <li key={row.label}>
                          <span className="landing-preview-distribution-row"><span>{row.label}</span><strong>{row.value}</strong></span>
                          <span className="landing-preview-distribution-track" aria-hidden="true"><span style={{ width: row.width }} /></span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <div className="landing-preview-evolution">
                <span className="landing-preview-evolution-kicker">EVOLUÇÃO</span>
                <h4>Cadastros e nascimentos</h4>
                <p>Contagens por dia no período selecionado, em UTC.</p>
                <div className="landing-preview-chart-legend"><span>Aves cadastradas</span><span>Nascimentos</span></div>
                <svg className="landing-preview-chart" viewBox="0 0 640 180" preserveAspectRatio="none" aria-hidden="true">
                  <path className="landing-preview-chart-grid" d="M20 18H620M20 86H620M20 154H620" />
                  <path className="landing-preview-chart-registered" d="M20 154H425L454 136 475 154 496 18 515 154 538 136 558 18 578 154H620" />
                  <path className="landing-preview-chart-births" d="M20 154H620" />
                </svg>
              </div>
            </section>

            <section className="landing-preview-quick-actions" aria-labelledby="landing-preview-actions-title">
              <header className="landing-preview-section-heading">
                <div>
                  <span>ACESSO RÁPIDO</span>
                  <h3 id="landing-preview-actions-title">Atalhos rápidos</h3>
                  <p>Acesse as principais funcionalidades do sistema.</p>
                </div>
                <span className="landing-preview-customize"><DashboardIcon name="settings" /> Personalizar atalhos</span>
              </header>
              <div className="landing-preview-action-grid">
                {previewActions.map((action) => (
                  <div className={"landing-preview-action tone-" + action.tone} key={action.label}>
                    <span className="landing-preview-action-icon"><DashboardIcon name={action.icon} /></span>
                    <span className="landing-preview-action-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
                    <span className="landing-preview-action-arrow" aria-hidden="true">›</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="landing-preview-secondary-grid">
              <section className="landing-preview-card landing-preview-pending">
                <header className="landing-preview-section-heading">
                  <div><span>ATENÇÃO</span><h3>Pendências <span className="landing-preview-count">2</span></h3><p>Itens que precisam da sua atenção.</p></div>
                  <span className="landing-preview-link">Ver todas <span aria-hidden="true">›</span></span>
                </header>
                <div className="landing-preview-pending-item"><span>!</span><strong>Aves com identificação pendente</strong><small>2 registros</small></div>
              </section>
              <section className="landing-preview-card landing-preview-activities">
                <header className="landing-preview-section-heading">
                  <div><span>ACOMPANHE DE PERTO</span><h3>Atividades recentes</h3><p>Últimas ações realizadas no seu criatório.</p></div>
                  <span className="landing-preview-link">Ver mais <span aria-hidden="true">›</span></span>
                </header>
                <div className="landing-preview-activity-item"><span><DashboardIcon name="heart" /></span><strong>Reprodução cadastrada</strong><small>Hoje</small></div>
                <div className="landing-preview-activity-item"><span><DashboardIcon name="bird" /></span><strong>Ave cadastrada</strong><small>Ontem</small></div>
              </section>
            </div>

            <div className="landing-preview-inspiration-banner" aria-hidden="true" />
          </div>
        </div>
      </article>
      <p className="landing-preview-caption"><span aria-hidden="true">i</span> Prévia ilustrativa com dados de demonstração.</p>
    </div>
  );
}

function MobileAppPreview() {
  return (
    <section className="mobile-app-section" aria-labelledby="titulo-app-mobile">
      <div className="mobile-app-copy">
        <p className="eyebrow">CRIATÓRIO NO SEU BOLSO</p>
        <h2 id="titulo-app-mobile">Seu criatório, onde você estiver.</h2>
        <p>Acesse pelo celular e adicione o Criatório Virtual à tela inicial para abrir como um app e chegar mais rápido ao painel.</p>
        <div className="mobile-app-install-guide">
          <span><DashboardIcon name="device" /></span>
          <div><strong>Instale em poucos passos</strong><p>No menu do navegador, escolha “Adicionar à tela inicial”. No iPhone, toque em Compartilhar e depois nessa opção.</p></div>
        </div>
        <Link className="primary-action" href="/cadastro">Criar minha conta <ArrowIcon /></Link>
      </div>
      <article className="mobile-app-device" aria-label="Prévia do painel do Criatório Virtual no celular">
        <div className="mobile-app-screen">
          <span className="mobile-app-island" aria-hidden="true" />
          <header className="mobile-app-header">
            <MenuIcon />
            <BrandLockup />
            <span className="mobile-app-avatar" aria-hidden="true">CV</span>
          </header>
          <div className="mobile-app-content">
            <header className="mobile-app-page-heading">
              <h3>Painel</h3>
              <p>Visão geral do seu criatório. Acompanhe suas aves, reproduções, transferências e muito mais.</p>
            </header>
            <div className="mobile-app-context">
              <p><DashboardIcon name="calendar" /> Hoje</p>
              <p><DashboardIcon name="leaf" /> Que tal fazer hoje um grande dia para o seu criatório?</p>
            </div>
            <div className="mobile-app-metrics" aria-label="Indicadores do criatório no celular">
              {previewMetrics.map((metric) => (
                <div className={"mobile-app-metric tone-" + metric.tone} key={metric.label}>
                  <span><DashboardIcon name={metric.icon} /></span>
                  <strong>{metric.value}</strong>
                  <small>{metric.label}</small>
                  <span aria-hidden="true" className="mobile-app-metric-arrow">›</span>
                </div>
              ))}
            </div>
            <section className="mobile-app-summary">
              <span>VISÃO ANALÍTICA</span>
              <h4>Resumo do criatório</h4>
              <p>Plantel atual e movimentações dos últimos 30 dias.</p>
              <div className="mobile-app-summary-row"><DashboardIcon name="bird" /><strong>68</strong><small>Aves no plantel</small></div>
              <div className="mobile-app-summary-row"><DashboardIcon name="calendar" /><strong>7</strong><small>Nascimentos · 30 dias</small></div>
            </section>
          </div>
          <div className="mobile-app-scroll-cue"><span>Role para ver mais do painel</span><span aria-hidden="true">⌄</span></div>
        </div>
      </article>
    </section>
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
          <div className="landing-header-actions">
            <Link className="landing-login-link" href="/login">Entrar</Link>
            <Link className="landing-header-cta" href="/cadastro">Criar conta <ArrowIcon /></Link>
          </div>
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
              <a className="landing-scroll-cue" href="#recursos">
                <span className="landing-scroll-cue-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v15m-6-6 6 6 6-6" /></svg></span>
                <span><strong>Role a tela para descobrir</strong><small>Veja o que mais você pode fazer pelo seu criatório.</small></span>
              </a>
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

          <MobileAppPreview />

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
