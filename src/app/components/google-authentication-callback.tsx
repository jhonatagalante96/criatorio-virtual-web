"use client";

import { useEffect } from "react";

export const googleAuthenticationMessageType = "criatorio-google-authentication";
export const googleAuthenticationWindowName = "criatorio-google-authentication";

export function GoogleAuthenticationCallback() {
  useEffect(() => {
    if (window.name !== googleAuthenticationWindowName) return;
    if (!window.opener || window.opener.closed) return;

    window.opener.postMessage(
      { status: "success", type: googleAuthenticationMessageType },
      window.location.origin
    );
    window.close();
  }, []);

  return null;
}
