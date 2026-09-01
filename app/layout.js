import "./globals.css";
import { Playfair_Display, Manrope } from "next/font/google";
import { BUSINESS } from "@/lib/config";

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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f0d0b",
};

export const metadata = {
  title: `${BUSINESS.name} — Barbería en ${BUSINESS.city} · Reserva tu cita online`,
  description: `${BUSINESS.fullName}: barbería en ${BUSINESS.address}. ${BUSINESS.googleRating}★ en Google. Reserva tu cita online en un minuto: corte, barba y más.`,
  keywords: [
    "barbería Leganés",
    "peluquería caballero Leganés",
    "corte de pelo Leganés",
    "arreglo de barba",
    "Fennani Barbershop",
    "reservar cita peluquería",
  ],
  openGraph: {
    title: `${BUSINESS.name} · Reserva tu cita`,
    description: `Barbería en ${BUSINESS.city} con ${BUSINESS.googleRating}★ en Google. Reserva online en un minuto.`,
    type: "website",
    locale: "es_ES",
  },
};

// Datos estructurados para Google (SEO local)
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "BarberShop",
  name: BUSINESS.fullName,
  telephone: BUSINESS.phoneLink,
  address: {
    "@type": "PostalAddress",
    streetAddress: "C. Pedro de Valdivia, 3",
    addressLocality: "Leganés",
    postalCode: "28911",
    addressRegion: "Madrid",
    addressCountry: "ES",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: BUSINESS.googleRating,
    reviewCount: BUSINESS.googleReviewCount,
  },
  url: "https://hairfy.vercel.app",
  priceRange: "€",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${playfair.variable} ${manrope.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
