"use client";

import React from "react";
import { AuthProvider } from "../lib/auth/auth-context";
import NavigationLoadingState from "./components/navigation-loading-state";
import ServiceWorkerRegistration from "./components/service-worker-registration";

export default function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthProvider><ServiceWorkerRegistration /><NavigationLoadingState>{children}</NavigationLoadingState></AuthProvider>;
}
