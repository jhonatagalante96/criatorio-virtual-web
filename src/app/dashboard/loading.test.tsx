import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DashboardLoading from "./loading";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("DashboardLoading", () => {
  it("renders the authenticated shell instead of the generic legacy loading page", () => {
    render(<DashboardLoading />);

    expect(screen.getByRole("complementary", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Carregando dashboard");
    expect(document.querySelector(".app-loading-page")).toBeNull();
  });
});
