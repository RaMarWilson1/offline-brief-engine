import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brief to Plan",
  description:
    "A campaign brief in, a ranked plan of IRL communities out, priced per verified attendee.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
