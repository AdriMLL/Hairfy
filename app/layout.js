import "./globals.css";

export const metadata = {
  title: "Hairfy — Reserva tu cita",
  description: "Reserva de citas online para la peluquería",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
