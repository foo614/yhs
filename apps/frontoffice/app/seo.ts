import type { Metadata } from "next";
import type { Language } from "./i18n";
import type { PublicVehicle } from "./vehicles/service";

const siteName = "YS Heng Cars";
const legalName = "YS HENG AUTOMOTIVE SDN BHD";
const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname = `${baseUrl.pathname}/`;
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";
const defaultSocialImage = canonicalUrl("/ys-heng-social-preview.png");
const dealerId = canonicalUrl("/#business");
const facebookUrl = "https://www.facebook.com/p/Ys-Heng-Automotive-Sdn-Bhd-100065128765841/";
const googleMapsUrl = "https://maps.app.goo.gl/3GGVr6vHLxhGabP28";

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
    ? `${vehicleName} 二手车出售 | ${siteName}`
    : `${vehicleName} for sale | ${siteName}`;
  const description = language === "zh"
    ? `查看 YS Heng 的 ${vehicleName}，售价 RM ${vehicle.sellingPrice.toLocaleString()}，可咨询看车与贷款流程。`
    : `View this ${vehicleName} at YS Heng. Selling price RM ${vehicle.sellingPrice.toLocaleString()} with sales enquiry and viewing support.`;
  const image = vehicle.isRepresentativePhoto ? undefined : vehicle.photoUrl;

  return pageMetadata({ title, description, path: `/vehicles/${vehicle.id}`, image, language });
}

export function organizationStructuredData() {
  const salesPhone = process.env.NEXT_PUBLIC_SALES_PHONE ?? "010-828 1218";
  const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "yshengauto@gmail.com";
  const showroomAddress = process.env.NEXT_PUBLIC_SHOWROOM_ADDRESS
    ?? "No.6, Jalan Pulai, Kawasan Jalan Mersing Batu 1 1/2, 86000 Kluang, Johor.";

  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "@id": dealerId,
    name: siteName,
    legalName,
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
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: salesPhone,
      email: salesEmail,
      availableLanguage: ["en", "zh"]
    }
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
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();
  const vehicleUrl = canonicalUrl(`/vehicles/${vehicle.id}`);
  const actualImages = vehicle.isRepresentativePhoto || !vehicle.photoUrl
    ? []
    : [vehicle.photoUrl];

  return {
    "@context": "https://schema.org",
    "@type": ["Product", "Car"],
    "@id": `${vehicleUrl}#vehicle`,
    name: vehicleName,
    description: `Used ${vehicleName} available for sales enquiry and viewing at YS Heng.`,
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
