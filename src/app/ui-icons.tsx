export type IconName =
  | "activity"
  | "apps"
  | "arrow"
  | "check"
  | "code"
  | "docs"
  | "gateway"
  | "globe"
  | "key"
  | "lock"
  | "logout"
  | "route"
  | "search"
  | "server"
  | "shield"
  | "sparkles"
  | "upload";

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const common = {
    "aria-hidden": true,
    className,
    fill: "none",
    focusable: false,
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: size,
  };

  switch (name) {
    case "activity":
      return <svg {...common}><path d="M3 12h4l2.4-6 4.1 12 2.5-6h5" /></svg>;
    case "apps":
      return <svg {...common}><rect height="6" rx="1.5" width="6" x="3" y="3" /><rect height="6" rx="1.5" width="6" x="15" y="3" /><rect height="6" rx="1.5" width="6" x="3" y="15" /><rect height="6" rx="1.5" width="6" x="15" y="15" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
    case "code":
      return <svg {...common}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></svg>;
    case "docs":
      return <svg {...common}><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 11h6M9 15h6" /></svg>;
    case "gateway":
      return <svg {...common}><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.5 11.2 16.5 6.8M7.5 12.8l9 4.4" /></svg>;
    case "globe":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>;
    case "key":
      return <svg {...common}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M15 8l2 2M17 6l2 2" /></svg>;
    case "lock":
      return <svg {...common}><rect height="10" rx="2" width="16" x="4" y="11" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></svg>;
    case "logout":
      return <svg {...common}><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></svg>;
    case "route":
      return <svg {...common}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>;
    case "server":
      return <svg {...common}><rect height="6" rx="2" width="18" x="3" y="4" /><rect height="6" rx="2" width="18" x="3" y="14" /><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3 4.5 6v5.5c0 4.7 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.8 7.5-9.5V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
    case "sparkles":
      return <svg {...common}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM5.5 13l.7 2.3 2.3.7-2.3.7L5.5 19l-.7-2.3-2.3-.7 2.3-.7z" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5M4 15v5h16v-5" /></svg>;
  }
}
