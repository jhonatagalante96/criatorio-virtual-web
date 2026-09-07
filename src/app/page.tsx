import React from "react";

const navigationItems = [
  { href: "#visao-geral", label: "Visão geral" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#suporte", label: "Suporte" }
];

export default function Home() {
  return (
    <main>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="site-header">
        <a className="brand" href="#conteudo" aria-label="Criatório Virtual, página inicial">
          <span aria-hidden="true" className="brand-mark">CV</span>
          <span>Criatório Virtual</span>
        </a>
        <nav aria-label="Navegação principal">
          <ul>
            {navigationItems.map((item) => (
              <li key={item.href}><a href={item.href}>{item.label}</a></li>
            ))}
            <li><a href="/login">Entrar</a></li>
          </ul>
        </nav>
      </header>

      <div id="conteudo" className="content" tabIndex={-1}>
        <section id="visao-geral" className="hero" aria-labelledby="titulo-principal">
          <p className="eyebrow">Gestão do seu criatório</p>
          <h1 id="titulo-principal">Informações claras para decisões melhores.</h1>
          <p className="lede">Organize o acompanhamento das suas aves em um único lugar, com simplicidade desde o primeiro acesso.</p>
          <a className="primary-action" href="#beneficios">Conhecer a plataforma</a>
        </section>

        <section id="beneficios" className="benefits" aria-labelledby="titulo-beneficios">
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

      <footer id="suporte" className="site-footer">
        <span>Criatório Virtual</span>
        <a href="mailto:suporte@criatoriovirtual.com.br">Falar com o suporte</a>
      </footer>
    </main>
  );
}
