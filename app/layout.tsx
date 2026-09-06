import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GroLo · Growatt Local",
  description: "Live view of a Growatt NEXA 2000 balcony battery, fed by the local GroLo stack.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111217" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
