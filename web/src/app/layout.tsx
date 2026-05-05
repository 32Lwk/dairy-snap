import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IosSafariInputViewportFix } from "@/components/ios-safari-input-viewport-fix";

function safeMetadataBase() {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (!origin) return undefined;
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: "daily-snap",
  description: "気楽に書ける、個人向け日記。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/daily-snap-icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/brand/daily-snap-icon-512.png", sizes: "512x512" }],
  },
  appleWebApp: {
    capable: true,
    title: "daily-snap",
  },
};

/** Allow zoom (no maximum-scale lock) for accessibility. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh max-h-dvh overflow-hidden antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-0 h-dvh max-h-dvh flex-col overflow-hidden" suppressHydrationWarning>
        <IosSafariInputViewportFix />
        {children}
      </body>
    </html>
  );
}
