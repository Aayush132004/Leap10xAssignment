import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Voice Agent Studio",
  description:
    "Configure voice agents, evaluate call transcripts, and analyze performance with evidence-backed scoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
