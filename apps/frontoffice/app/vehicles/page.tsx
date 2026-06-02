import Link from "next/link";
import { Car, ChevronLeft, Search } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams } from "../i18n";
import { InventoryBrowser } from "./InventoryBrowser";
import { listingFiltersFromSearchParams } from "./listing";
import { getPublicVehicles } from "./service";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const vehicles = await getPublicVehicles();
  const params = await searchParams;
  const language = languageFromSearchParams(params);
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
        initialFilters={listingFiltersFromSearchParams(params)}
        language={language}
      />
      <PublicFooter language={language} />

      <PublicMobileNav language={language} />
    </main>
  );
}
