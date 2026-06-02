import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "YS Heng Cars",
  description: "Available used cars and customer enquiries for YS Heng."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
