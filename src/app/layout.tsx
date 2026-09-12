import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Criatório Virtual",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Criatório Virtual"
  },
  title: "Criatório Virtual",
  description: "Gestão simples e segura para o seu criatório.",
  icons: {
    apple: "/icons/icon-192.png",
    icon: "/icons/icon-192.png"
  },
  manifest: "/manifest.webmanifest",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default"
  }
};

export const viewport: Viewport = {
  colorScheme: "light",
  initialScale: 1,
  themeColor: "#0e2d25",
  width: "device-width"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
