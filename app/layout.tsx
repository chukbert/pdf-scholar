import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Scholar - AI-Powered Document Learning",
  description: "A privacy-first web app for learning from PDFs with a local AI tutor powered by Qwen 2.5-VL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
