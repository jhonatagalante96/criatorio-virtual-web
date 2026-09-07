import React from "react";

export function BrandLockup({ className = "", stacked = false }: { className?: string; stacked?: boolean }) {
  return (
    <span className={`brand-lockup${stacked ? " brand-lockup-stacked" : ""}${className ? ` ${className}` : ""}`} role="img" aria-label="Criatório Virtual">
      <img
        src={`/assets/brand/svg/criatorio-virtual-${stacked ? "empilhada" : "horizontal"}.svg`}
        alt=""
        aria-hidden="true"
      />
    </span>
  );
}

export function BrandPanel() {
  return (
    <aside className="brand-panel" aria-label="Sobre o Criatório Virtual">
      <div className="brand-panel-leaves brand-panel-leaves-top" aria-hidden="true" />
      <div className="brand-panel-leaves brand-panel-leaves-side" aria-hidden="true" />
      <div className="brand-panel-bird-wrap" aria-hidden="true">
        <img className="brand-panel-bird" src="/assets/imagery/birds/great-tit-header-hd.webp" alt="" />
      </div>
      <div className="brand-panel-copy">
        <span className="brand-panel-rule" aria-hidden="true" />
        <p>A avicultura<br />brasileira mais forte,<br />organizada e conectada.</p>
      </div>
    </aside>
  );
}
