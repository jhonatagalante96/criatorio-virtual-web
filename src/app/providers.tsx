"use client";

import React from "react";
import { AuthProvider } from "../lib/auth/auth-context";
import NavigationLoadingState from "./components/navigation-loading-state";

export default function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthProvider><NavigationLoadingState>{children}</NavigationLoadingState></AuthProvider>;
}
