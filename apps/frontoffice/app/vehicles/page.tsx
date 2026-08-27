import type { Metadata } from "next";
import Link from "next/link";
import { Car, ChevronLeft, Search } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type SearchParams } from "../i18n";
import { InventoryBrowser } from "./InventoryBrowser";
import { listingFiltersFromSearchParams } from "./listing";
import { pageMetadata, structuredDataJson, vehicleListStructuredData } from "../seo";
import { getPublicInventory } from "./service";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export async function generateMetadata({ searchParams }: { searchParams?: Promise<SearchParams> }): Promise<Metadata> {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  return pageMetadata({
    title: language === "zh" ? "居銮二手车源 | YS Heng Automotive" : "Used cars for sale in Kluang, Johor | YS Heng Automotive",
    description: language === "zh"
      ? "浏览 YS HENG AUTOMOTIVE SDN BHD 目前公开的二手车售价与照片，并联络居銮展厅确认车源和看车详情。"
      : "Browse current public used-car listings from YS HENG AUTOMOTIVE SDN BHD, with published prices and photos. Contact the Kluang showroom to confirm availability and viewing details.",
    path: "/vehicles",
    language
  });
}

export default async function VehiclesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearchParams = isStaticExport ? undefined : await searchParams;
  const inventory = await getPublicInventory();
  const vehicles = inventory.vehicles;
  const language = languageFromSearchParams(resolvedSearchParams);
  const t = frontofficeCopy[language].inventory;

  return (
    <main className="atelierSubPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="vehicles" />

      <header className="atelierSubHero inventoryAtelierHero">
        <div className="atelierSubHeroInner">
          <Link href={hrefWithLanguage("/", language)} className="backLink"><ChevronLeft size={18} /> {t.backHome}</Link>
          <p className="atelierKicker">{t.kicker}</p>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
          <div className="subHeroActions">
            <span><Car size={16} /> {vehicles.length} {t.availableVehicles}</span>
            <span><Search size={16} /> {t.searchEnabled}</span>
          </div>
        </div>
      </header>
      <InventoryBrowser
        vehicles={vehicles}
        unavailable={inventory.unavailable}
        initialFilters={listingFiltersFromSearchParams(resolvedSearchParams ?? {})}
        language={language}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(vehicleListStructuredData(vehicles, language)) }} />
      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="vehicles" />
    </main>
  );
}
