import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shotcandy",
  description:
    "Turn any screenshot into a beautiful, share-ready image in seconds. Free, open source, runs entirely in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
