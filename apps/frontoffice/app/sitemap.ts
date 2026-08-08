import type { MetadataRoute } from "next";
import { canonicalUrl } from "./seo";
import { getPublicVehicles } from "./vehicles/service";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vehicles = await getPublicVehicles();
  const staticPages = ["/", "/vehicles", "/contact"].map((path) => ({
    url: canonicalUrl(path)
  }));

  return [
    ...staticPages,
    ...vehicles.map((vehicle) => ({ url: canonicalUrl(`/vehicles/${vehicle.id}`) }))
  ];
}
