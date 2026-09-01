import "./globals.css";
import { Playfair_Display, Manrope } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Hairfy — Reserva tu cita",
  description:
    "Peluquería Hairfy: reserva tu cita online en un minuto y consulta tus citas cuando quieras.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${playfair.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
