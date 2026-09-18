"use client";

import React from "react";

type LandingSectionLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> & {
  href: string;
};

export default function LandingSectionLink({ href, children, ...linkProps }: Readonly<LandingSectionLinkProps>) {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.currentTarget.target === "_blank") return;
    if (!href.startsWith("#")) return;

    const target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    if (href === "#conteudo-principal") target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "auto", block: "start" });
  }

  return <a {...linkProps} href={href} onClick={handleClick}>{children}</a>;
}
