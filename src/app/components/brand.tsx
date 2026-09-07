import React from "react";

export function BrandLockup({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand-lockup${light ? " brand-lockup-light" : ""}`}>
      <svg className="brand-symbol" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M7.5 39.5C10 23 22.5 9.5 40.5 6.5c-.5 17.5-11 30.5-30.5 36.5-2 .5-3-1.5-2.5-3.5Z" fill="currentColor" />
        <path d="M9 42c8.5-11 17-20 29.5-32" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      </svg>
      <span>Criatório Virtual</span>
    </span>
  );
}

export function BrandPanel() {
  return (
    <aside className="brand-panel" aria-label="Sobre o Criatório Virtual">
      <a className="brand-panel-link" href="/" aria-label="Criatório Virtual, página inicial">
        <BrandLockup light />
      </a>
      <div className="brand-panel-copy">
        <h2>Gestão completa<br />para o seu criatório</h2>
        <p>Organize suas aves, acompanhe sua evolução, gere documentos em minutos. Tudo em um só lugar.</p>
      </div>
      <img className="brand-panel-bird" src="/images/auth-canary.webp" alt="" aria-hidden="true" />
    </aside>
  );
}

