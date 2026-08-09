import type { MetadataRoute } from "next";
import { canonicalUrl, localizedLanguageUrls } from "./seo";
import { getPublicVehicles } from "./vehicles/service";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vehicles = await getPublicVehicles();
  const staticPages = ["/", "/vehicles", "/contact"].map((path) => ({
    url: canonicalUrl(path),
    alternates: { languages: localizedLanguageUrls(path) }
  }));

  return [
    ...staticPages,
    ...vehicles.map((vehicle) => {
      const path = `/vehicles/${vehicle.id}`;
      return { url: canonicalUrl(path), alternates: { languages: localizedLanguageUrls(path) } };
    })
  ];
}
