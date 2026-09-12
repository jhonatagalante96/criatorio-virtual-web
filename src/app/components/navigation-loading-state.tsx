"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import RouteLoadingState from "./route-loading-state";

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function NavigationLoadingState({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const routeKey = pathname ?? "";
  const [isNavigating, setIsNavigating] = useState(false);
  const [targetPathname, setTargetPathname] = useState<string>();

  useEffect(() => {
    setIsNavigating(false);
    setTargetPathname(undefined);
  }, [routeKey]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (isModifiedClick(event) || event.defaultPrevented) return;

      const element = event.target instanceof Element ? event.target : undefined;
      const anchor = element?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname) return;

      setTargetPathname(destination.pathname);
      setIsNavigating(true);
    }

    function handlePopState() {
      setTargetPathname(undefined);
      setIsNavigating(true);
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (isNavigating) return <RouteLoadingState pathnameOverride={targetPathname} />;
  return <>{children}</>;
}
