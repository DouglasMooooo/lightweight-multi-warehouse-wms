import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/provider";

export const metadata: Metadata = {
  title: "FoxESS Warehouse Operations",
  description: "Lightweight multi-warehouse WMS operational preview",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#102c2a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><I18nProvider>{children}</I18nProvider></body>
    </html>
  );
}
