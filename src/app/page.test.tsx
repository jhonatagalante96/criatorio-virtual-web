import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page";

afterEach(cleanup);

describe("Home", () => {
  it("keeps the focused header actions and guides visitors down the page", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).getAttribute("href")).toBe("#conteudo-principal");
    const header = document.querySelector(".landing-header");
    expect(header?.querySelector("nav")).toBeNull();
    expect(header?.querySelector("details")).toBeNull();
    expect(screen.getByRole("link", { name: /Role a tela para descobrir/ }).getAttribute("href")).toBe("#recursos");
    expect(document.querySelector("#recursos")).toBeTruthy();
    expect(document.querySelector("#planos")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Entrar" }).some((link) => link.getAttribute("href") === "/login")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Criar minha conta" })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Criar conta" }).getAttribute("href")).toBe("/cadastro");
  });

  it("shows the current dashboard layout and official platform mark", () => {
    render(<Home />);

    expect(screen.getByRole("article", { name: "Prévia ilustrativa do painel do Criatório Virtual" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Painel" }).length).toBeGreaterThan(1);
    expect(screen.getAllByRole("heading", { name: "Resumo do criatório" }).length).toBeGreaterThan(1);
    expect(screen.getByRole("heading", { name: "Atividades recentes" })).toBeTruthy();
    expect(document.querySelector(".landing-preview-sidebar-inspiration img")?.getAttribute("src")).toBe("/assets/brand/png/criatorio-virtual-symbol.png");
    expect(screen.getByText(/Prévia ilustrativa com dados de demonstração\./)).toBeTruthy();
    expect(screen.getAllByText("Visão geral do seu criatório. Acompanhe suas aves, reproduções, transferências e muito mais.").length).toBeGreaterThan(1);
    expect(screen.getByText("Distribuição por sexo")).toBeTruthy();
    expect(screen.getByText("Principais espécies")).toBeTruthy();
    expect(screen.getByText("Registrar competição")).toBeTruthy();
    expect(screen.queryByText("Em desenvolvimento")).toBeNull();
    expect(screen.getByRole("article", { name: "Prévia do painel do Criatório Virtual no celular" })).toBeTruthy();
    expect(screen.getByText(/Adicionar à tela inicial/)).toBeTruthy();
  });

  it("lists the features included in the single subscription and approved prices", () => {
    render(<Home />);

    for (const name of ["Painel do criatório", "Gestão de aves", "Reprodução", "Transferências", "Documentos", "Estatísticas", "Competições"]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }

    expect(screen.getByText("R$ 19,90")).toBeTruthy();
    expect(screen.getByText("R$ 199,90")).toBeTruthy();
    expect(screen.getByText("2 meses grátis")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Opções de assinatura" })).toBeTruthy();
    expect(screen.getByText("Escolha a periodicidade. Os recursos incluídos são os mesmos.")).toBeTruthy();
    expect(document.querySelector(".plan-summary")?.textContent).toContain("Competições");
  });
});
