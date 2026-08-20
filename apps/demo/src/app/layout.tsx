import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MirrorVersionProvider } from "@/components/demo/mirror";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ElementMirror",
  description:
    "A live mirror of any DOM element, rendered into a canvas that sizes like an image.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MirrorVersionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MirrorVersionProvider>
      </body>
    </html>
  );
}
