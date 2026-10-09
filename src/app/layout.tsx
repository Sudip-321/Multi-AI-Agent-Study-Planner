import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Cortexa — Multi-Agent Study Planner",
  description:
    "Six AI agents plan, schedule, tutor, coach, and analyze your studying. Works offline with deterministic agents; optional LLM upgrade."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('cortexa-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`
          }}
        />
      </head>
      <body>
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 min-w-0 p-6 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
