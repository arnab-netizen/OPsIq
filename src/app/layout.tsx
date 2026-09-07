import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpsIQ - Business health & priorities",
  description:
    "OpsIQ helps business owners see how their business is doing, what needs attention, and what to do next.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
