import Link from "next/link";
import { Car, ChevronLeft, Search } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type SearchParams } from "../i18n";
import { InventoryBrowser } from "./InventoryBrowser";
import { listingFiltersFromSearchParams } from "./listing";
import { getPublicVehicles } from "./service";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export default async function VehiclesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearchParams = isStaticExport ? undefined : await searchParams;
  const vehicles = await getPublicVehicles();
  const language = languageFromSearchParams(resolvedSearchParams);
  const t = frontofficeCopy[language].inventory;

  return (
    <main className="atelierSubPage">
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
        initialFilters={listingFiltersFromSearchParams(resolvedSearchParams ?? {})}
        language={language}
      />
      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="vehicles" />
    </main>
  );
}
