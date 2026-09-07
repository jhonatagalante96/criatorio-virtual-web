import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("provides keyboard-accessible navigation to the page sections", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).getAttribute("href")).toBe("#conteudo-principal");
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
    for (const [name, href] of [["Recursos", "#recursos"], ["Planos", "#planos"], ["Sobre", "#sobre"], ["Conteúdo", "#conteudo"]]) {
      expect(screen.getAllByRole("link", { name }).some((link) => link.getAttribute("href") === href)).toBe(true);
      expect(document.querySelector(href)).toBeTruthy();
    }
    expect(screen.getByRole("navigation", { name: "Navegação móvel" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Começar agora" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Começar agora" })[0].getAttribute("href")).toBe("/cadastro");
    expect(screen.getAllByRole("link", { name: "Entrar" })[0].getAttribute("href")).toBe("/login");
  });
});
