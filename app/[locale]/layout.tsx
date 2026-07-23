import type { Metadata } from "next";
import "../globals.css";
import { isLocale } from "../i18n/messages";

export const metadata: Metadata = {
  title: "Ewan's World · Interactive 3D Portfolio",
  description:
    "Explore the scenes and interactions of a Japanese festival-inspired 3D world.",
  icons: {
    icon: "/favicon.ico"
  }
};

export default async function LocaleRootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  return (
    <html lang={isLocale(locale) ? locale : "en"}>
      <body>{children}</body>
    </html>
  );
}
