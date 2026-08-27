import type { Metadata } from "next";
import {
  businessName,
  companyRegistration,
  facebookUrl,
  googleMapsUrl,
  legalBusinessName,
  salesEmail,
  salesPhone,
  showroomAddress,
  tiktokFeatureUrl
} from "./business";
import type { Language } from "./i18n";
import { formatThousands } from "./formatters";
import type { PublicVehicle } from "./vehicles/service";

const siteName = "YS Heng Automotive";
const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname = `${baseUrl.pathname}/`;
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";
const defaultSocialImage = canonicalUrl("/ys-heng-social-preview.png");
const dealerId = canonicalUrl("/#business");

export function canonicalUrl(path = "/") {
  return new URL(path.replace(/^\//, ""), baseUrl).toString();
}

export function localizedUrl(path: string, language: Language) {
  const url = new URL(canonicalUrl(path));
  if (language === "zh") url.searchParams.set("lang", "zh");
  else url.searchParams.delete("lang");
  return url.toString();
}

export function localizedLanguageUrls(path: string) {
  const urls: Record<string, string> = {
    "en-MY": localizedUrl(path, "en"),
    "x-default": localizedUrl(path, "en")
  };
  if (!isStaticExport) urls["zh-Hans-MY"] = localizedUrl(path, "zh");
  return urls;
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  language = "en"
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  language?: Language;
}): Metadata {
  const url = localizedUrl(path, language);
  const socialImage = image || defaultSocialImage;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: localizedLanguageUrls(path)
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      type: "website",
      locale: language === "zh" ? "zh_MY" : "en_MY",
      alternateLocale: language === "zh" ? ["en_MY"] : ["zh_MY"],
      images: [{ url: socialImage, width: 1200, height: 630, type: "image/png", alt: title }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage]
    }
  };
}

export function vehicleMetadata(vehicle: PublicVehicle, language: Language = "en"): Metadata {
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();
  const title = language === "zh"
    ? `${vehicleName} 二手车 | ${siteName}`
    : `${vehicleName} used car for sale | ${siteName}`;
  const description = language === "zh"
    ? `查看 ${legalBusinessName} 刊登的 ${vehicleName}，售价 RM ${formatThousands(vehicle.sellingPrice)}。请联络居銮展厅确认车源与看车详情。`
    : `View this ${vehicleName}, listed at RM ${formatThousands(vehicle.sellingPrice)} through ${legalBusinessName}. Contact the Kluang showroom to confirm availability and viewing details.`;
  const image = vehicle.isRepresentativePhoto ? undefined : vehicle.photoUrl;

  return pageMetadata({ title, description, path: `/vehicles/${vehicle.id}`, image, language });
}

export function organizationStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "@id": dealerId,
    name: legalBusinessName,
    alternateName: [businessName, "YS Heng Cars", "YS Heng Auto"],
    legalName: legalBusinessName,
    url: canonicalUrl("/"),
    logo: canonicalUrl("/ys-heng-logo.png"),
    image: canonicalUrl("/ys-heng-logo.png"),
    telephone: salesPhone,
    email: salesEmail,
    address: {
      "@type": "PostalAddress",
      streetAddress: showroomAddress,
      addressLocality: "Kluang",
      addressRegion: "Johor",
      postalCode: "86000",
      addressCountry: "MY"
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Johor, Malaysia"
    },
    hasMap: googleMapsUrl,
    sameAs: [facebookUrl],
    identifier: {
      "@type": "PropertyValue",
      propertyID: "Malaysia company registration number",
      value: companyRegistration
    },
    subjectOf: {
      "@type": "VideoObject",
      name: "YS Heng Automotive TikTok feature",
      url: tiktokFeatureUrl
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: salesPhone,
      email: salesEmail,
      availableLanguage: ["en", "zh"]
    }
  };
}

export function vehicleListStructuredData(vehicles: PublicVehicle[], language: Language = "en") {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: language === "zh" ? "YS Heng 目前可询问车源" : "YS Heng vehicles currently available for enquiry",
    itemListElement: vehicles.map((vehicle, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: localizedUrl(`/vehicles/${vehicle.id}`, language),
      name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim()
    }))
  };
}

export function vehicleStructuredData(vehicle: PublicVehicle, language: Language = "en") {
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();
  const vehicleUrl = localizedUrl(`/vehicles/${vehicle.id}`, language);
  const actualImages = vehicle.isRepresentativePhoto || !vehicle.photoUrl
    ? []
    : [vehicle.photoUrl];
  const description = language === "zh"
    ? `${vehicleName} 二手车，刊登售价 RM ${formatThousands(vehicle.sellingPrice)}，可通过 ${legalBusinessName} 查询。请联络居銮展厅确认看车详情。`
    : `Used ${vehicleName} listed at RM ${formatThousands(vehicle.sellingPrice)} and available for enquiry through ${legalBusinessName}. Contact the Kluang showroom to confirm viewing details.`;

  return {
    "@context": "https://schema.org",
    "@type": ["Product", "Car"],
    "@id": `${vehicleUrl}#vehicle`,
    name: vehicleName,
    description,
    url: vehicleUrl,
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    vehicleModelDate: String(vehicle.year),
    category: "Used car",
    ...(actualImages.length > 0 ? { image: actualImages } : {}),
    offers: {
      "@type": "Offer",
      price: vehicle.sellingPrice,
      priceCurrency: "MYR",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      url: vehicleUrl,
      seller: { "@id": dealerId }
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
