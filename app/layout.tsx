import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Report Analytics Dashboard",
  description: "Analytics dashboard for media reporting and insights",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to improve performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      </head>
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
