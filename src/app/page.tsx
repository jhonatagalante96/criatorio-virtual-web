import React from "react";
import Link from "next/link";
import { BrandLockup } from "./components/brand";
import { GoogleAuthenticationCallback } from "./components/google-authentication-callback";

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

const planFeatures = [
  "Gestão completa do plantel",
  "Documentos e registros organizados",
  "Histórico de transferências",
  "Indicadores para acompanhar a criação"
];

const contentItems = [
  { tag: "GESTÃO", title: "Uma rotina mais leve começa pela organização", copy: "Tenha uma visão clara do plantel e encontre rapidamente o que precisa." },
  { tag: "DOCUMENTAÇÃO", title: "Informações importantes sempre à mão", copy: "Reúna documentos, registros e históricos sem depender de arquivos espalhados." },
  { tag: "CONSERVAÇÃO", title: "Tecnologia que aproxima criadores e propósito", copy: "Construa um histórico responsável para hoje e para as próximas gerações." }
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
  return <img className={`bird-thumb bird-thumb-${variant}`} src={flockBird ? "/assets/imagery/birds/bird-flock-hd.webp" : "/assets/imagery/birds/great-tit-header-hd.webp"} alt="" aria-hidden="true" />;
}

function DashboardPreview() {
  return (
    <div className="dashboard-window" aria-label="Prévia do painel do Criatório Virtual">
      <div className="dashboard-leaf dashboard-leaf-one" aria-hidden="true" />
      <div className="dashboard-leaf dashboard-leaf-two" aria-hidden="true" />
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
          <div className="dashboard-inner-nav"><span>Painel</span><span>Sobre</span></div>
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
    <main className="landing-page" id="inicio">
      <GoogleAuthenticationCallback />
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      <div className="landing-leaf landing-leaf-top" aria-hidden="true" />
      <div className="landing-leaf landing-leaf-bottom" aria-hidden="true" />
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
            <Link className="landing-header-cta" href="/cadastro">Começar agora <ArrowIcon /></Link>
          </div>
          <details className="landing-mobile-menu">
            <summary aria-label="Abrir menu de navegação"><MenuIcon /></summary>
            <nav aria-label="Navegação móvel">
              <ul>
                {navigationItems.map((item) => (
                  <li key={item.href}><a href={item.href}>{item.label}</a></li>
                ))}
              </ul>
            </nav>
          </details>
        </header>

        <div id="conteudo-principal" className="landing-main" tabIndex={-1}>
          <section className="landing-hero" aria-labelledby="titulo-principal">
            <div className="landing-copy">
              <p className="eyebrow">Gestão simples para grandes criadores</p>
              <h1 id="titulo-principal">Seu criatório organizado, mais tempo para o que você ama.</h1>
              <p className="landing-lede">Gerencie seu plantel, documentos, pedigree, transferências e toda a rotina do seu criatório em um só lugar.</p>
              <div className="landing-actions">
                <Link className="primary-action" href="/cadastro">Começar agora <ArrowIcon /></Link>
                <Link className="secondary-action landing-secondary-action" href="/login">Entrar</Link>
              </div>
            </div>
            <DashboardPreview />
          </section>

          <section id="recursos" className="landing-features" aria-labelledby="titulo-recursos">
            <div className="section-heading">
              <p className="eyebrow">Tudo o que você precisa</p>
              <h2 id="titulo-recursos">Gestão simples, do plantel aos resultados.</h2>
              <p>Recursos pensados para reduzir tarefas manuais e deixar as informações do seu criatório fáceis de encontrar.</p>
            </div>
            <div className="landing-feature-grid">
              {featureItems.map((feature) => (
                <article className="landing-feature-card" key={feature.title}>
                  <span className="landing-feature-icon"><FeatureIcon type={feature.icon} /></span>
                  <div><strong>{feature.title}</strong><span>{feature.copy}</span></div>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-mobile-showcase" aria-hidden="true">
            <div className="landing-showcase-copy">Criadores de hoje.<br /><em>Conservação de amanhã.</em></div>
            <img src="/assets/imagery/birds/bird-flock-hd.webp" alt="" />
          </section>

          <section id="planos" className="landing-section plans-section" aria-labelledby="titulo-planos">
            <div className="section-heading section-heading-centered">
              <p className="eyebrow">Um plano. Duas formas de assinar.</p>
              <h2 id="titulo-planos">Tudo o que o seu criatório precisa.</h2>
              <p>Tenha acesso a todos os recursos e escolha apenas a periodicidade que funciona melhor para você.</p>
            </div>
            <article className="single-plan-card">
              <div className="plan-summary">
                <span className="plan-label">Plano Criatório Virtual</span>
                <h3>Gestão completa, sem recursos bloqueados.</h3>
                <p>As duas assinaturas incluem exatamente as mesmas funcionalidades.</p>
                <ul>{planFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
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
                    <p>Uma cobrança por ano, com o melhor valor.</p>
                  </div>
                  <p className="plan-price"><strong>R$ 199,90</strong><span>por ano</span></p>
                </div>
                <Link className="primary-action plan-action" href="/cadastro">Criar minha conta <ArrowIcon /></Link>
              </div>
            </article>
          </section>

          <section id="sobre" className="landing-section about-section" aria-labelledby="titulo-sobre">
            <div className="about-visual" aria-hidden="true">
              <img src="/assets/imagery/birds/great-tit-header-hd.webp" alt="" />
              <span>Pássaros conectam pessoas.</span>
            </div>
            <div className="about-copy">
              <p className="eyebrow">Sobre o Criatório Virtual</p>
              <h2 id="titulo-sobre">Mais que um sistema. Um parceiro para o seu criatório.</h2>
              <p>O Criatório Virtual nasceu para tornar a rotina de criadores mais clara, segura e organizada. A tecnologia cuida dos processos para que você tenha mais tempo para cuidar das aves.</p>
              <div className="about-values">
                <span><strong>Organização</strong> para hoje</span>
                <span><strong>Informação</strong> para decidir</span>
                <span><strong>Paixão</strong> pelo que importa</span>
              </div>
            </div>
          </section>

          <section id="conteudo" className="landing-section content-section" aria-labelledby="titulo-conteudo">
            <div className="section-heading">
              <p className="eyebrow">Conteúdo para criadores</p>
              <h2 id="titulo-conteudo">Conhecimento que acompanha a sua criação.</h2>
            </div>
            <div className="content-grid">
              {contentItems.map((item) => (
                <article className="content-card" key={item.title}>
                  <span>{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <footer className="landing-footer">
          <span className="landing-footer-brand"><BrandLockup /></span>
          <span className="landing-footer-links"><a href="#recursos">Gestão</a><span>•</span><a href="#recursos">Organização</a><span>•</span><a href="#recursos">Paixão</a><span>•</span><a href="#recursos">Conservação</a></span>
          <span className="landing-footer-actions">
            <a href="#inicio">Voltar ao topo</a>
            <a className="landing-support" href="mailto:suporte@criatoriovirtual.com.br">Falar com o suporte</a>
          </span>
        </footer>
      </div>
    </main>
  );
}
