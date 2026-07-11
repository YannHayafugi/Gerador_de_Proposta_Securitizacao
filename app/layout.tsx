import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gerador de Propostas – Securitização | FIA",
  description: "Sistema interno para geração de propostas de securitização",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
