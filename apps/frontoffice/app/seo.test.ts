import { describe, expect, it, vi } from "vitest";
import {
  localizedLanguageUrls,
  organizationStructuredData,
  pageMetadata,
  structuredDataJson,
  vehicleListStructuredData,
  vehicleMetadata,
  vehicleStructuredData
} from "./seo";
import type { PublicVehicle } from "./vehicles/service";
import { generateMetadata as generateHomeMetadata } from "./page";

const vehicle: PublicVehicle = {
  id: "vehicle-1",
  plateNumber: "ABC123",
  make: "Toyota",
  model: "Vios",
  year: 2021,
  stockOwner: "YSHeng",
  status: "Available",
  sellingPrice: 58000,
  photoUrl: "https://images.example/vehicle.jpg",
  photoUrls: ["https://images.example/vehicle.jpg"]
};

describe("frontoffice SEO", () => {
  it("publishes entity-first localized homepage metadata", async () => {
    const english = await generateHomeMetadata({ searchParams: Promise.resolve({}) });
    const chinese = await generateHomeMetadata({ searchParams: Promise.resolve({ lang: "zh" }) });

    expect(english.title).toBe("Used Cars in Kluang | YS HENG AUTOMOTIVE SDN BHD");
    expect(english.description).toContain("YS HENG AUTOMOTIVE SDN BHD in Kluang, Johor");
    expect(chinese.title).toBe("居銮二手车 | YS HENG AUTOMOTIVE SDN BHD");
    expect(chinese.description).toContain("YS HENG AUTOMOTIVE SDN BHD 位于柔佛州居銮");
  });

  it("publishes reciprocal localized canonicals and social metadata", () => {
    const metadata = pageMetadata({
      title: "测试车辆",
      description: "居銮二手车",
      path: "/vehicles",
      language: "zh"
    });

    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/vehicles?lang=zh");
    expect(metadata.alternates?.languages).toEqual(localizedLanguageUrls("/vehicles"));
    expect(metadata.openGraph?.locale).toBe("zh_MY");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "http://localhost:3000/ys-heng-social-preview.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "测试车辆"
      }
    ]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("does not claim a representative fallback is the listed vehicle photo", () => {
    const realPhotoMetadata = vehicleMetadata(vehicle);
    const fallbackMetadata = vehicleMetadata({ ...vehicle, isRepresentativePhoto: true });

    expect(realPhotoMetadata.openGraph?.images).toEqual([
      {
        url: vehicle.photoUrl,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "2021 Toyota Vios used car for sale | YS Heng Automotive"
      }
    ]);
    expect(fallbackMetadata.openGraph?.images).toEqual([
      {
        url: "http://localhost:3000/ys-heng-social-preview.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "2021 Toyota Vios used car for sale | YS Heng Automotive"
      }
    ]);
  });

  it("preserves a deployment base path and suppresses false static Chinese alternates", async () => {
    const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const previousStaticExport = process.env.NEXT_STATIC_EXPORT;
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/yhs";
    process.env.NEXT_STATIC_EXPORT = "true";
    vi.resetModules();

    try {
      const staticSeo = await import("./seo");
      expect(staticSeo.canonicalUrl("/vehicles")).toBe("https://example.test/yhs/vehicles");
      expect(staticSeo.localizedLanguageUrls("/vehicles")).toEqual({
        "en-MY": "https://example.test/yhs/vehicles",
        "x-default": "https://example.test/yhs/vehicles"
      });
    } finally {
      if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
      if (previousStaticExport === undefined) delete process.env.NEXT_STATIC_EXPORT;
      else process.env.NEXT_STATIC_EXPORT = previousStaticExport;
      vi.resetModules();
    }
  });

  it("uses accurate dealer and Product plus Car structured data", () => {
    const dealer = organizationStructuredData();
    const listing = vehicleStructuredData(vehicle);
    const mixedGalleryListing = vehicleStructuredData({
      ...vehicle,
      photoUrls: [vehicle.photoUrl, "https://images.example/representative.jpg"]
    });

    expect(dealer).toMatchObject({
      "@type": "AutoDealer",
      name: "YS HENG AUTOMOTIVE SDN BHD",
      alternateName: ["YS Heng Automotive", "YS Heng Cars", "YS Heng Auto"],
      legalName: "YS HENG AUTOMOTIVE SDN BHD",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Kluang",
        addressRegion: "Johor",
        postalCode: "86000",
        addressCountry: "MY"
      },
      hasMap: "https://maps.app.goo.gl/3GGVr6vHLxhGabP28",
      sameAs: ["https://www.facebook.com/p/Ys-Heng-Automotive-Sdn-Bhd-100065128765841/"],
      identifier: {
        "@type": "PropertyValue",
        propertyID: "Malaysia company registration number",
        value: "202301051775 (1545689-H)"
      },
      subjectOf: {
        "@type": "VideoObject",
        name: "YS Heng Automotive TikTok feature",
        url: "https://www.tiktok.com/@ifyandyfaathir/video/7637074774526577940"
      }
    });
    expect(listing).toMatchObject({
      "@type": ["Product", "Car"],
      name: "2021 Toyota Vios",
      brand: { "@type": "Brand", name: "Toyota" },
      model: "Vios",
      vehicleModelDate: "2021",
      image: vehicle.photoUrls,
      offers: {
        "@type": "Offer",
        price: 58000,
        priceCurrency: "MYR",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/UsedCondition"
      }
    });
    expect(listing).not.toHaveProperty("plateNumber");
    expect(listing).not.toHaveProperty("stockOwner");
    expect(mixedGalleryListing).toHaveProperty("image", [vehicle.photoUrl]);
  });

  it("keeps localized vehicle and inventory schema URLs aligned with page canonicals", () => {
    const listing = vehicleStructuredData(vehicle, "zh");
    const inventory = vehicleListStructuredData([vehicle], "zh");

    expect(listing).toMatchObject({
      url: "http://localhost:3000/vehicles/vehicle-1?lang=zh",
      description: expect.stringContaining("YS HENG AUTOMOTIVE SDN BHD"),
      offers: { url: "http://localhost:3000/vehicles/vehicle-1?lang=zh" }
    });
    expect(inventory.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        url: "http://localhost:3000/vehicles/vehicle-1?lang=zh",
        name: "2021 Toyota Vios"
      }
    ]);
  });

  it("escapes structured-data script breakers", () => {
    expect(structuredDataJson({ value: "</script>&" })).toBe('{"value":"\\u003c/script\\u003e\\u0026"}');
  });
});
