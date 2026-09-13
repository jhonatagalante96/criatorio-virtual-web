import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDirectory = resolve(process.cwd(), "public");

describe("PWA assets", () => {
  it("keeps account passkey requests on the network", () => {
    const serviceWorker = readFileSync(resolve(publicDirectory, "sw.js"), "utf8");

    expect(serviceWorker).toContain('requestUrl.pathname === "/api/auth/passkeys"');
    expect(serviceWorker).toContain('requestUrl.pathname.startsWith("/api/auth/passkeys/")');
  });

  it("uses versioned high-contrast icons in the manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDirectory, "manifest.webmanifest"), "utf8")) as {
      icons: Array<{ purpose: string; src: string }>;
      short_name: string;
    };

    expect(manifest.short_name).toBe("Criatório Virtual");
    expect(manifest.icons).toEqual([
      { purpose: "any", sizes: "192x192", src: "/icons/icon-192-v2.png", type: "image/png" },
      { purpose: "any maskable", sizes: "512x512", src: "/icons/icon-512-v2.png", type: "image/png" }
    ]);
  });

  it("keeps every manifest icon available as a non-empty PNG", () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDirectory, "manifest.webmanifest"), "utf8")) as {
      icons: Array<{ src: string }>;
    };

    for (const icon of manifest.icons) {
      const iconPath = resolve(publicDirectory, icon.src.slice(1));
      expect(readFileSync(iconPath).length).toBeGreaterThan(0);
    }
  });
});
