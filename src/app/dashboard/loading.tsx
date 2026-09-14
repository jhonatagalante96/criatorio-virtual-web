import React from "react";
import { AppLoadingState } from "../components/app-loading-state";

export default function DashboardLoading() {
  return (
    <AppLoadingState
      activeNav="dashboard"
      label="Carregando painel"
      message="Um instante enquanto preparamos seu espaço."
    />
  );
}
