import type { MetadataRoute } from "next";
import { canonicalUrl } from "./seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" }
    ],
    sitemap: canonicalUrl("/sitemap.xml")
  };
}
