import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClearVoice | Free AI Noise Cancellation",
  description:
    "High-quality real-time AI noise cancellation in your browser. Closer to Anker-level isolation without expensive headsets. Your audio never leaves your device.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
