import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import AuthProvider from "./components/AuthProvider";

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
