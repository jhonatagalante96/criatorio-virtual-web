import React from "react";
import { BrandLockup } from "./components/brand";

const navigationItems = [
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#sobre", label: "Sobre" },
  { href: "#conteudo", label: "Conteúdo" }
];

const featureItems = [
  { icon: "gestao-plantel", title: "Gestão do plantel", copy: "Acompanhe suas aves com clareza." },
  { icon: "documentos", title: "Documentos e crachás", copy: "Tudo organizado e pronto para usar." },
  { icon: "transferencias", title: "Transferências", copy: "Registre cada movimento com segurança." },
  { icon: "relatorios", title: "Relatórios", copy: "Resultados para decisões melhores." }
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

function FeatureIcon({ type }: { type: string }) {
  return <img src={`/assets/icons/features/${type}.svg`} alt="" aria-hidden="true" />;
}

function BirdThumb({ variant = "great-tit" }: { variant?: string }) {
  const flockBird = variant !== "great-tit";
  return <img className={`bird-thumb bird-thumb-${variant}`} src={flockBird ? "/assets/imagery/birds/budgie-and-finch-flock.png" : "/assets/imagery/birds/great-tit-header.png"} alt="" aria-hidden="true" />;
}

function DashboardPreview() {
  return (
    <div className="dashboard-window" aria-label="Prévia do painel do Criatório Virtual">
      <div className="dashboard-leaf dashboard-leaf-one" aria-hidden="true" />
      <div className="dashboard-leaf dashboard-leaf-two" aria-hidden="true" />
      <div className="dashboard-window-top" />
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <BrandLockup className="brand-lockup-dashboard" />
          <div className="dashboard-menu dashboard-menu-active"><span className="menu-symbol">⌂</span>Início</div>
          <div className="dashboard-menu"><span className="menu-symbol">▧</span>Plantel</div>
          <div className="dashboard-menu"><span className="menu-symbol">□</span>Documentos</div>
          <div className="dashboard-menu"><span className="menu-symbol">⇄</span>Transferências</div>
          <div className="dashboard-menu"><span className="menu-symbol">▥</span>Relatórios</div>
          <span className="dashboard-sidebar-foot" />
        </aside>
        <section className="dashboard-content">
          <div className="dashboard-inner-nav"><span>Dashboard</span><span>Sobre</span></div>
          <div className="dashboard-welcome">
            <p>Olá, Criador!</p>
            <span>Seu criatório em boas mãos.</span>
          </div>
          <div className="dashboard-metrics">
            <div><strong>124</strong><span>Aves</span></div>
            <div><strong>28</strong><span>Reprodutores</span></div>
            <div><strong>12</strong><span>Filhotes</span></div>
            <div><strong>8</strong><span>Transferências</span></div>
          </div>
          <div className="dashboard-plantel">
            <div className="dashboard-plantel-heading"><strong>Meu plantel</strong><span>⌄</span></div>
            <div className="dashboard-birds">
              <div><BirdThumb variant="budgie" /><span>Coleiro</span></div>
              <div><BirdThumb variant="canary" /><span>Canário</span></div>
              <div><BirdThumb variant="finch" /><span>Diamante</span></div>
              <div><BirdThumb /><span>Trinca-ferro</span></div>
            </div>
          </div>
          <div className="dashboard-note">Criadores de hoje.<br /><em>Conservação de amanhã.</em></div>
          <div className="dashboard-showcase-bird"><BirdThumb /></div>
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing-page">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <div className="landing-leaf landing-leaf-top" aria-hidden="true" />
      <div className="landing-leaf landing-leaf-bottom" aria-hidden="true" />
      <div className="landing-shell">
        <header className="landing-header">
          <a className="landing-brand-link" href="#conteudo" aria-label="Criatório Virtual, página inicial">
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
            <a className="landing-login-link" href="/login">Entrar</a>
            <a className="landing-header-cta" href="/cadastro">Começar agora <ArrowIcon /></a>
          </div>
          <a className="landing-menu-button" href="#recursos" aria-label="Ir para os recursos">
            <MenuIcon />
          </a>
        </header>

        <div id="conteudo" className="landing-main" tabIndex={-1}>
          <section className="landing-hero" aria-labelledby="titulo-principal">
            <div className="landing-copy">
              <p className="eyebrow">Gestão simples para grandes criadores</p>
              <h1 id="titulo-principal">Seu criatório organizado, mais tempo para o que você ama.</h1>
              <p className="landing-lede">Gerencie seu plantel, documentos, pedigree, transferências e toda a rotina do seu criatório em um só lugar.</p>
              <div className="landing-actions">
                <a className="primary-action" href="/cadastro">Começar agora <ArrowIcon /></a>
                <a className="secondary-action landing-secondary-action" href="/login">Entrar</a>
              </div>
            </div>
            <DashboardPreview />
          </section>

          <section id="recursos" className="landing-features" aria-labelledby="titulo-recursos">
            <div className="landing-feature-grid">
              {featureItems.map((feature) => (
                <article className="landing-feature-card" key={feature.title}>
                  <span className="landing-feature-icon"><FeatureIcon type={feature.icon} /></span>
                  <div><strong>{feature.title}</strong><span>{feature.copy}</span></div>
                </article>
              ))}
            </div>
            <h2 id="titulo-recursos" className="sr-only">Recursos do Criatório Virtual</h2>
          </section>

          <section className="landing-mobile-showcase" aria-hidden="true">
            <div className="landing-showcase-copy">Criadores de hoje.<br /><em>Conservação de amanhã.</em></div>
            <img src="/assets/imagery/birds/budgie-and-finch-flock.png" alt="" />
          </section>
        </div>

        <footer id="sobre" className="landing-footer">
          <span className="landing-footer-brand"><BrandLockup /></span>
          <span className="landing-footer-links"><a href="#recursos">Gestão</a><span>•</span><a href="#recursos">Organização</a><span>•</span><a href="#recursos">Paixão</a><span>•</span><a href="#recursos">Conservação</a></span>
          <a className="landing-support" href="mailto:suporte@criatoriovirtual.com.br">Falar com o suporte</a>
        </footer>
      </div>
    </main>
  );
}
