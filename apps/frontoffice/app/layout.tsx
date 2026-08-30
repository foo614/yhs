import type { Metadata } from "next";
import { MotionEnhancer } from "./MotionEnhancer";
import { organizationStructuredData, pageMetadata, structuredDataJson } from "./seo";
import "./styles.css";

const defaultMetadata = pageMetadata({
  title: "YS Heng Automotive | Used cars in Kluang",
  description: "YS HENG AUTOMOTIVE SDN BHD is a used-car dealership in Kluang, Johor, Malaysia. Browse current public inventory and contact the showroom to confirm viewing details.",
  path: "/"
});

export const metadata: Metadata = {
  ...defaultMetadata,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "YS Heng Automotive | Used cars in Kluang", template: "%s" }
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
