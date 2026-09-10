import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleAuthenticationCallback,
  googleAuthenticationMessageType,
  googleAuthenticationWindowName
} from "./google-authentication-callback";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "name", { configurable: true, value: "" });
  Object.defineProperty(window, "opener", { configurable: true, value: null });
  vi.restoreAllMocks();
});

describe("GoogleAuthenticationCallback", () => {
  it("notifies the opener and closes the named popup", () => {
    const postMessage = vi.fn();
    const opener = { closed: false, postMessage } as unknown as Window;
    Object.defineProperty(window, "name", { configurable: true, value: googleAuthenticationWindowName });
    Object.defineProperty(window, "opener", { configurable: true, value: opener });
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);

    render(<GoogleAuthenticationCallback />);

    expect(postMessage).toHaveBeenCalledWith(
      { status: "success", type: googleAuthenticationMessageType },
      window.location.origin
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
