import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PROUNI | Mentorías",
  description: "Espacio de acompañamiento y desarrollo profesional.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
