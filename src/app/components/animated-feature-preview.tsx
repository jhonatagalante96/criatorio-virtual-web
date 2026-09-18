"use client";

import React, { useState } from "react";

interface AnimatedFeaturePreviewProps {
  children: React.ReactNode;
  label: string;
}

export default function AnimatedFeaturePreview({ children, label }: Readonly<AnimatedFeaturePreviewProps>) {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div className={`animated-feature-preview${isPaused ? " is-paused" : ""}`}>
      {children}
      <button
        aria-label={`${isPaused ? "Retomar" : "Pausar"} ${label}`}
        className="animated-feature-preview-control"
        onClick={() => setIsPaused((paused) => !paused)}
        type="button"
      >
        {isPaused ? (
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M6.5 4.8 15 10l-8.5 5.2z" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M6.5 5v10M13.5 5v10" /></svg>
        )}
        <span>{isPaused ? "Reproduzir" : "Pausar"}</span>
      </button>
    </div>
  );
}
