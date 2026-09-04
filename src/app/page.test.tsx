import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("provides keyboard-accessible navigation to the page sections", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).getAttribute("href")).toBe("#conteudo");
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Visão geral" }).getAttribute("href")).toBe("#visao-geral");
  });
});
