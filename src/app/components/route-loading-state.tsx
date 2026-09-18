"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth/auth-context";
import { AppLoadingState } from "./app-loading-state";
import type { AuthenticatedNav } from "./authenticated-shell";

interface LoadingCopy {
  activeNav?: AuthenticatedNav;
  label: string;
  message: string;
}

function loadingCopyForPathname(pathname: string): LoadingCopy {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return { activeNav: "dashboard", label: "Carregando painel", message: "Um instante enquanto preparamos seu espaço." };
  }

  if (pathname.startsWith("/reproducao")) {
    return pathname.startsWith("/reproducao/novo")
      ? { activeNav: "reproduction", label: "Carregando cadastro", message: "Um instante enquanto preparamos o registro da reprodução." }
      : { activeNav: "reproduction", label: "Carregando reproduções", message: "Um instante enquanto consultamos o histórico do criatório." };
  }

  if (pathname.startsWith("/plantel/aves/novo")) {
    return { activeNav: "birds", label: "Carregando cadastro", message: "Um instante enquanto preparamos o cadastro." };
  }

  if (pathname.includes("/editar")) {
    return { activeNav: "birds", label: "Carregando edição", message: "Um instante enquanto preparamos a edição." };
  }

  if (pathname.startsWith("/plantel/aves/")) {
    return { activeNav: "birds", label: "Carregando ficha da ave", message: "Um instante enquanto preparamos os dados da ave." };
  }

  if (pathname === "/plantel/aves" || pathname.startsWith("/plantel/aves?")) {
    return { activeNav: "birds", label: "Carregando plantel", message: "Um instante enquanto preparamos as aves do criatório." };
  }

  if (pathname.startsWith("/configuracoes/criatorio")) {
    return { activeNav: "farm", label: "Carregando criatório", message: "Um instante enquanto preparamos as informações do criatório." };
  }

  if (pathname.startsWith("/assinatura")) {
    return { activeNav: "subscription", label: "Carregando assinatura", message: "Um instante enquanto consultamos sua situação financeira." };
  }

  if (pathname.startsWith("/configuracoes")) {
    return { activeNav: "settings", label: "Carregando configurações", message: "Um instante enquanto preparamos suas configurações." };
  }

  if (pathname.startsWith("/onboarding")) {
    return { label: "Carregando onboarding", message: "Um instante enquanto preparamos o próximo passo." };
  }

  if (pathname.startsWith("/login")) {
    return { label: "Carregando acesso", message: "Um instante enquanto verificamos seu acesso." };
  }

  return { label: "Carregando página", message: "Um instante enquanto preparamos seu espaço." };
}

export default function RouteLoadingState({ pathnameOverride }: Readonly<{ pathnameOverride?: string }>) {
  const pathname = usePathname();
  const { session } = useAuth();
  const copy = loadingCopyForPathname(pathnameOverride ?? pathname ?? "/");

  return <AppLoadingState activeNav={copy.activeNav} email={copy.activeNav ? session?.email : undefined} label={copy.label} message={copy.message} />;
}
