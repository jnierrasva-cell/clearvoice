import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClearVoice | AI Noise Cancellation",
  description:
    "Clearer calls. Less background noise. Experience ClearVoice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

