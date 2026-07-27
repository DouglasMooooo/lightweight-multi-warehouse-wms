import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
