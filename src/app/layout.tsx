import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Federated API Gateway",
  description: "Catálogo y proxy seguro para APIs externas con autenticación RS256 federada.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
