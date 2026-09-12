"use client";

import React, { useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const installDismissedStorageKey = "criatorio-pwa-install-dismissed";

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function isStandaloneDisplayMode(): boolean {
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  const supportsMatchMedia = typeof window.matchMedia === "function";
  return (supportsMatchMedia && window.matchMedia("(display-mode: standalone)").matches) || standaloneNavigator.standalone === true;
}

function hasDismissedInstallPrompt(): boolean {
  try {
    return window.localStorage.getItem(installDismissedStorageKey) === "true";
  } catch {
    return false;
  }
}

function rememberInstallPromptDismissal(): void {
  try {
    window.localStorage.setItem(installDismissedStorageKey, "true");
  } catch {
    // Storage can be unavailable in private browsing; the prompt remains usable.
  }
}

export function PwaInstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | undefined>(undefined);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const mobileMediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 47.99rem)")
      : undefined;
    const mediaQueryListeners = mobileMediaQuery as unknown as {
      addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
      addListener?: (listener: () => void) => void;
      removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
      removeListener?: (listener: () => void) => void;
    };
    const updateMobileState = () => setIsMobile(mobileMediaQuery?.matches ?? false);
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };
    const handleAppInstalled = () => {
      deferredPrompt.current = undefined;
      rememberInstallPromptDismissal();
      setIsInstallable(false);
      setIsStandalone(true);
      setIsDismissed(true);
    };

    updateMobileState();
    setIsIos(isIosDevice());
    setIsStandalone(isStandaloneDisplayMode());
    setIsDismissed(hasDismissedInstallPrompt());
    setIsReady(true);

    if (mobileMediaQuery && mediaQueryListeners.addEventListener) mediaQueryListeners.addEventListener("change", updateMobileState);
    else if (mobileMediaQuery) mediaQueryListeners.addListener?.(updateMobileState);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      if (mobileMediaQuery && mediaQueryListeners.removeEventListener) mediaQueryListeners.removeEventListener("change", updateMobileState);
      else if (mobileMediaQuery) mediaQueryListeners.removeListener?.(updateMobileState);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp(): Promise<void> {
    const installEvent = deferredPrompt.current;
    if (!installEvent || isInstalling) return;

    setIsInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      deferredPrompt.current = undefined;
      setIsInstallable(false);
      if (choice.outcome === "accepted") {
        rememberInstallPromptDismissal();
        setIsDismissed(true);
      }
    } finally {
      setIsInstalling(false);
    }
  }

  function dismissPrompt(): void {
    deferredPrompt.current = undefined;
    rememberInstallPromptDismissal();
    setIsDismissed(true);
  }

  if (!isReady || !isMobile || isStandalone || isDismissed) return null;

  const instructions = isIos
    ? "Toque em Compartilhar e escolha Adicionar à Tela de Início."
    : isInstallable
      ? "Instale o app para acessar seu criatório com mais rapidez."
      : "Abra o menu do navegador e escolha Adicionar à tela inicial para criar um atalho.";

  return (
    <aside aria-label="Instale o Criatório Virtual" className="pwa-install-prompt" role="status">
      <span aria-hidden="true" className="pwa-install-prompt-icon">＋</span>
      <div className="pwa-install-prompt-copy">
        <strong>Instale o Criatório Virtual</strong>
        <p>{instructions}</p>
      </div>
      <div className="pwa-install-prompt-actions">
        {isInstallable && !isIos && (
          <button className="pwa-install-prompt-action" disabled={isInstalling} onClick={() => void installApp()} type="button">
            {isInstalling ? "Abrindo…" : "Instalar agora"}
          </button>
        )}
        <button className="pwa-install-prompt-dismiss" onClick={dismissPrompt} type="button">
          {isInstallable && !isIos ? "Agora não" : "Entendi"}
        </button>
      </div>
    </aside>
  );
}
