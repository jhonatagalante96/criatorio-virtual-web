import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ServiceWorkerRegistration from "./service-worker-registration";

afterEach(() => cleanup());

describe("ServiceWorkerRegistration", () => {
  it("registers the PWA service worker when the browser supports it", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));

    if (originalDescriptor) Object.defineProperty(navigator, "serviceWorker", originalDescriptor);
    else delete (navigator as { serviceWorker?: ServiceWorkerContainer }).serviceWorker;
  });
});
