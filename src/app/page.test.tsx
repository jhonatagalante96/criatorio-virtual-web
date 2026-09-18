import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page";

afterEach(cleanup);

describe("Home", () => {
  it("keeps accessible navigation and account actions", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).getAttribute("href")).toBe("#conteudo-principal");
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
    for (const [name, href] of [["Recursos", "#recursos"], ["Plano", "#planos"]]) {
      expect(screen.getAllByRole("link", { name }).some((link) => link.getAttribute("href") === href)).toBe(true);
      expect(document.querySelector(href)).toBeTruthy();
    }
    expect(screen.getByRole("navigation", { name: "Navegação móvel" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Entrar" }).some((link) => link.getAttribute("href") === "/login")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Criar minha conta" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Criar conta" }).getAttribute("href")).toBe("/cadastro");
  });

  it("shows the current dashboard layout and official platform mark", () => {
    render(<Home />);

    expect(screen.getByRole("article", { name: "Prévia ilustrativa do painel do Criatório Virtual" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Resumo do criatório" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Atividades recentes" })).toBeTruthy();
    expect(document.querySelector(".landing-preview-brand-symbol img")?.getAttribute("src")).toBe("/assets/brand/png/criatorio-virtual-symbol.png");
    expect(screen.getByText(/Prévia ilustrativa\. Seus indicadores reais aparecem após entrar\./)).toBeTruthy();
    expect(screen.getAllByText("Em desenvolvimento").length).toBeGreaterThan(0);
  });

  it("lists the features included in the single subscription and approved prices", () => {
    render(<Home />);

    for (const name of ["Painel do criatório", "Gestão de aves", "Reprodução", "Transferências", "Documentos", "Estatísticas"]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }

    expect(screen.getByText("R$ 19,90")).toBeTruthy();
    expect(screen.getByText("R$ 199,90")).toBeTruthy();
    expect(screen.getByText("2 meses grátis")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Opções de assinatura" })).toBeTruthy();
    expect(screen.getByText("Escolha a periodicidade. Os recursos incluídos são os mesmos.")).toBeTruthy();
    expect(document.querySelector(".plan-summary")?.textContent).not.toContain("Competições");
  });
});
