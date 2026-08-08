import type { Metadata } from "next";
import { MotionEnhancer } from "./MotionEnhancer";
import { organizationStructuredData, structuredDataJson } from "./seo";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "YS Heng Cars", template: "%s" },
  description: "Browse public YS Heng used-car inventory and submit sales enquiries for available vehicles.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "YS Heng Cars",
    description: "Browse available used cars and contact YS Heng for viewing, loan guidance, and sales follow-up.",
    url: "/",
    siteName: "YS Heng Cars",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(organizationStructuredData()) }} />
        <MotionEnhancer>{children}</MotionEnhancer>
      </body>
    </html>
  );
}
