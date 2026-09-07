import React from "react";
import { BrandLockup, BrandPanel } from "./components/brand";

const navigationItems = [
  { href: "#visao-geral", label: "Visão geral" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#suporte", label: "Suporte" },
  { href: "/cadastro", label: "Criar conta" }
];

export default function Home() {
  return (
    <main className="landing-page">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <div className="landing-shell">
        <BrandPanel />
        <section className="landing-content" aria-labelledby="titulo-principal">
          <div className="landing-topbar">
            <div className="landing-mobile-brand"><BrandLockup /></div>
            <nav aria-label="Navegação principal">
              <ul>
                {navigationItems.map((item) => (
                  <li key={item.href}><a href={item.href}>{item.label}</a></li>
                ))}
              </ul>
            </nav>
          </div>

          <div id="conteudo" className="landing-main" tabIndex={-1}>
            <section id="visao-geral" aria-labelledby="titulo-principal">
              <p className="eyebrow">Gestão do seu criatório</p>
              <h1 id="titulo-principal">Informações claras para decisões melhores.</h1>
              <p className="lede">Organize o acompanhamento das suas aves em um único lugar, com simplicidade desde o primeiro acesso.</p>
              <a className="primary-action" href="/cadastro">Criar minha conta</a>
            </section>

            <section id="beneficios" className="landing-benefits" aria-labelledby="titulo-beneficios">
              <div>
                <p className="eyebrow">Base da plataforma</p>
                <h2 id="titulo-beneficios">Feita para acompanhar o que importa.</h2>
              </div>
              <ul>
                <li><strong>Organização</strong><span>Uma visão estruturada para o dia a dia do criatório.</span></li>
                <li><strong>Continuidade</strong><span>Uma experiência consistente em celular e computador.</span></li>
                <li><strong>Segurança</strong><span>Estrutura preparada para proteger os dados de cada criatório.</span></li>
              </ul>
            </section>
          </div>

          <footer id="suporte" className="landing-footer">
            <span>Criatório Virtual</span>
            <a href="mailto:suporte@criatoriovirtual.com.br">Falar com o suporte</a>
          </footer>
        </section>
      </div>
    </main>
  );
}

