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
