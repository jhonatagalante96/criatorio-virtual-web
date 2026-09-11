import React from "react";

export type DashboardIconName =
  | "alert"
  | "bird"
  | "crown"
  | "document"
  | "farm"
  | "heart"
  | "home"
  | "leaf"
  | "settings"
  | "transfer"
  | "trophy";

export function DashboardIcon({ name, className = "" }: Readonly<{ name: DashboardIconName; className?: string }>) {
  const props = {
    className: `dashboard-icon${className ? ` ${className}` : ""}`,
    fill: "none",
    height: "24",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: "1.75",
    viewBox: "0 0 24 24",
    width: "24",
    "aria-hidden": true
  };

  if (name === "home") {
    return <svg {...props}><path d="m3.5 10.8 8.5-7.3 8.5 7.3" /><path d="M5.3 9.6v10.1h13.4V9.6M9.1 19.7v-5.4h5.8v5.4" /></svg>;
  }

  if (name === "bird") {
    return <svg {...props}><path d="M4 17.7c3.3-4.2 7.4-6.3 12.6-6.2-1.4 4.5-4.4 7.2-8.8 7.4-1.7.1-2.9-.3-3.8-1.2Z" fill="currentColor" stroke="none" /><path d="M14 11.6c.4-3.5 2.1-5.9 5.1-7.3.8 3.4-.1 6.2-2.5 7.8-1 .7-1.8.9-2.6.8Z" fill="currentColor" stroke="none" /><path d="M3 20c4.7-2.7 8.1-6.1 10.2-10.1" /></svg>;
  }

  if (name === "heart") {
    return <svg {...props}><path d="M20.8 8.8c0 5.2-8.8 10.3-8.8 10.3S3.2 14 3.2 8.8A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 8.8 1.7Z" /></svg>;
  }

  if (name === "leaf") {
    return <svg {...props}><path d="M20.5 3.5C12.7 3.9 7.5 7.1 6.3 12.3c-.8 3.5 1.5 6.1 4.7 6.1 5.6 0 8.8-5.2 9.5-14.9Z" fill="currentColor" stroke="none" /><path d="M4 20c3.2-4.5 6.9-7.7 11.3-10.5" /></svg>;
  }

  if (name === "transfer") {
    return <svg {...props}><path d="M3.5 8h13" /><path d="m13 4.5 3.5 3.5-3.5 3.5" /><path d="M20.5 16h-13" /><path d="m11 12.5-3.5 3.5 3.5 3.5" /></svg>;
  }

  if (name === "trophy") {
    return <svg {...props}><path d="M8 4h8v4.3a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4.5v1.8a3.6 3.6 0 0 0 3.6 3.6M16 6h3.5v1.8a3.6 3.6 0 0 1-3.6 3.6M12 12.4v4.1M8.7 20h6.6M10 16.5h4" /></svg>;
  }

  if (name === "document") {
    return <svg {...props}><path d="M6 2.8h8l4 4v14.4H6z" /><path d="M14 2.8v4h4M8.7 11h6.6M8.7 14.5h6.6M8.7 18h4.2" /></svg>;
  }

  if (name === "farm") {
    return <svg {...props}><path d="m3.5 10.5 8.5-6.8 8.5 6.8" /><path d="M5.2 9.5v10.2h13.6V9.5M9.2 19.7v-5.2h5.6v5.2M16.7 4.8h2v3" /></svg>;
  }

  if (name === "crown") {
    return <svg {...props}><path d="m4 7 4 3 4-5 4 5 4-3-1.7 10.3H5.7z" /><path d="M6.5 20h11" /></svg>;
  }

  if (name === "settings") {
    return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.5 1.5-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.1v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.5-1.5.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H7v-2.1h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.5-1.5.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.1v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.5 1.5-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V13h-.2a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
  }

  return <svg {...props}><path d="m12 3 8.5 15H3.5z" /><path d="M12 8v4.6M12 16.1v.1" /></svg>;
}
