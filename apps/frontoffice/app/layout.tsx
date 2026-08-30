import type { Metadata } from "next";
import { MotionEnhancer } from "./MotionEnhancer";
import { organizationStructuredData, pageMetadata, structuredDataJson } from "./seo";
import "./styles.css";

const defaultMetadata = pageMetadata({
  title: "YS Heng Cars",
  description: "Browse available used cars and contact YS Heng for viewing, loan guidance, and sales follow-up.",
  path: "/"
});

export const metadata: Metadata = {
  ...defaultMetadata,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "YS Heng Cars", template: "%s" }
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
