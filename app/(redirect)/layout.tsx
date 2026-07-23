import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Ewan's World · Interactive 3D Portfolio",
  description:
    "Explore the scenes and interactions of a Japanese festival-inspired 3D world.",
  icons: {
    icon: "/favicon.ico"
  }
};

export default function RedirectRootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
