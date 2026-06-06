import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rebilix - Governed Business Intervention OS",
  description:
    "Rebilix is a governed business intervention and consulting operating system.",
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
