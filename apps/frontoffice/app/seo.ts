import type { Metadata } from "next";
import type { PublicVehicle } from "./vehicles/service";

const siteName = "YS Heng Cars";
const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export function canonicalUrl(path = "/") {
  return new URL(path, baseUrl).toString();
}

export function pageMetadata({ title, description, path, image }: { title: string; description: string; path: string; image?: string }): Metadata {
  const url = canonicalUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName,
      type: "website",
      images: image ? [{ url: image, alt: title }] : undefined
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

export function vehicleMetadata(vehicle: PublicVehicle): Metadata {
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model} for sale | ${siteName}`;
  const description = `View this ${vehicle.year} ${vehicle.make} ${vehicle.model} at YS Heng. Selling price RM ${vehicle.sellingPrice.toLocaleString()} with sales enquiry and viewing support.`;
  return pageMetadata({ title, description, path: `/vehicles/${vehicle.id}`, image: vehicle.photoUrl });
}

export function organizationStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: siteName,
    url: canonicalUrl("/"),
    telephone: process.env.NEXT_PUBLIC_SALES_PHONE ?? "010-828 1218"
  };
}

export function vehicleListStructuredData(vehicles: PublicVehicle[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "YS Heng available vehicles",
    itemListElement: vehicles.map((vehicle, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: canonicalUrl(`/vehicles/${vehicle.id}`),
      name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim()
    }))
  };
}

export function vehicleStructuredData(vehicle: PublicVehicle) {
  return {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(),
    url: canonicalUrl(`/vehicles/${vehicle.id}`),
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    productionDate: String(vehicle.year),
    ...(vehicle.photoUrls.length > 0 ? { image: vehicle.photoUrls } : {}),
    offers: {
      "@type": "Offer",
      price: vehicle.sellingPrice,
      priceCurrency: "MYR",
      availability: "https://schema.org/InStock",
      url: canonicalUrl(`/vehicles/${vehicle.id}`)
    }
  };
}

export function structuredDataJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
