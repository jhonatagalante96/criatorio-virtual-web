import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSafeHostedAsaasUrl,
  redirectToHostedAsaas,
  sanitizeHostedAsaasUrl
} from "./asaas-redirect";

describe("asaas-redirect", () => {
  describe("isSafeHostedAsaasUrl", () => {
    it("accepts canonical HTTPS asaas.com URLs", () => {
      expect(isSafeHostedAsaasUrl("https://asaas.com/")).toBe(true);
      expect(isSafeHostedAsaasUrl("https://asaas.com/i/invoice-id")).toBe(true);
      expect(isSafeHostedAsaasUrl("https://asaas.com/checkoutSession/show/12345")).toBe(true);
      expect(isSafeHostedAsaasUrl("https://asaas.com:443/i/invoice-id")).toBe(true);
      expect(isSafeHostedAsaasUrl("  https://asaas.com/i/invoice-id  ")).toBe(true);
    });

    it("accepts legitimate subdomains of asaas.com", () => {
      expect(isSafeHostedAsaasUrl("https://www.asaas.com/i/invoice-id")).toBe(true);
      expect(isSafeHostedAsaasUrl("https://sandbox.asaas.com/checkoutSession/show/checkout-id")).toBe(true);
      expect(isSafeHostedAsaasUrl("https://sandbox.asaas.com:443/checkoutSession/show/checkout-id")).toBe(true);
      expect(isSafeHostedAsaasUrl("https://pay.sandbox.asaas.com/i/123")).toBe(true);
    });

    it("rejects non-HTTPS protocols", () => {
      expect(isSafeHostedAsaasUrl("http://asaas.com/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("http://sandbox.asaas.com/checkoutSession")).toBe(false);
      expect(isSafeHostedAsaasUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeHostedAsaasUrl("javascript://asaas.com/%0Aalert(1)")).toBe(false);
      expect(isSafeHostedAsaasUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeHostedAsaasUrl("ftp://asaas.com/file")).toBe(false);
    });

    it("rejects non-standard or unauthorized ports", () => {
      expect(isSafeHostedAsaasUrl("https://asaas.com:80/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://asaas.com:8080/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://asaas.com:8443/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://sandbox.asaas.com:3000/checkout")).toBe(false);
    });

    it("rejects URLs with embedded credentials (user/password)", () => {
      expect(isSafeHostedAsaasUrl("https://user:password@asaas.com/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://user@asaas.com/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://admin:secret@sandbox.asaas.com/checkout")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://asaas.com@evil.example/i/invoice-id")).toBe(false);
    });

    it("rejects domain spoofing, typosquatting and deceptive hostnames", () => {
      expect(isSafeHostedAsaasUrl("https://asaas.com.evil.example/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://evilasaas.com/checkout")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://fake-asaas.com/checkout")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://asaas.co/checkout")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://attacker.example/?next=https://asaas.com")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://asaas.com.br/checkout")).toBe(false);
    });

    it("rejects malformed URLs, empty domains and invalid inputs", () => {
      expect(isSafeHostedAsaasUrl("")).toBe(false);
      expect(isSafeHostedAsaasUrl("   ")).toBe(false);
      expect(isSafeHostedAsaasUrl("not a url")).toBe(false);
      expect(isSafeHostedAsaasUrl("//asaas.com/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://.asaas.com/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl("https://..asaas.com/i/invoice-id")).toBe(false);
      expect(isSafeHostedAsaasUrl(null)).toBe(false);
      expect(isSafeHostedAsaasUrl(undefined)).toBe(false);
      expect(isSafeHostedAsaasUrl(12345)).toBe(false);
      expect(isSafeHostedAsaasUrl({})).toBe(false);
    });
  });

  describe("sanitizeHostedAsaasUrl", () => {
    it("returns canonical URL string for safe Asaas URLs", () => {
      expect(sanitizeHostedAsaasUrl("https://asaas.com/i/invoice-id")).toBe("https://asaas.com/i/invoice-id");
      expect(sanitizeHostedAsaasUrl("  https://sandbox.asaas.com/checkout  ")).toBe("https://sandbox.asaas.com/checkout");
    });

    it("returns undefined for unsafe or invalid URLs", () => {
      expect(sanitizeHostedAsaasUrl("http://asaas.com/i/invoice-id")).toBeUndefined();
      expect(sanitizeHostedAsaasUrl("https://evilasaas.com/checkout")).toBeUndefined();
      expect(sanitizeHostedAsaasUrl("invalid")).toBeUndefined();
      expect(sanitizeHostedAsaasUrl(null)).toBeUndefined();
    });
  });

  describe("redirectToHostedAsaas", () => {
    it("navigates to verified Asaas URLs using the navigate executor", () => {
      const navigate = vi.fn();
      const result = redirectToHostedAsaas("https://sandbox.asaas.com/checkoutSession/show/abc", navigate);
      expect(result).toBe(true);
      expect(navigate).toHaveBeenCalledWith("https://sandbox.asaas.com/checkoutSession/show/abc");
    });

    it("does not navigate and returns false when URL is invalid or outside policy", () => {
      const navigate = vi.fn();
      const result = redirectToHostedAsaas("https://evilasaas.com/checkoutSession", navigate);
      expect(result).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it("does not navigate when URL contains credentials or non-standard port", () => {
      const navigate = vi.fn();
      expect(redirectToHostedAsaas("https://user:pass@asaas.com/checkout", navigate)).toBe(false);
      expect(redirectToHostedAsaas("https://asaas.com:8080/checkout", navigate)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
