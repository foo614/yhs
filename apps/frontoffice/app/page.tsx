import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, Banknote, MapPin, ShieldCheck, Wrench } from "lucide-react";
import heroImage from "../public/hero-price-bay-option2@2x.png";
import { googleMapsUrl, showroomAddress } from "./business";
import { HeroVehicleFilters } from "./HeroVehicleFilters";
import { PublicFooter, PublicHeader, PublicMobileNav } from "./PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type Language, type SearchParams } from "./i18n";
import { pageMetadata } from "./seo";
import { priceRange } from "./vehicles/listing";
import { getPublicInventory, type PublicVehicle, type PublicVehicleCatalogModel } from "./vehicles/service";
import { VehicleCard } from "./vehicles/VehicleCard";
import "./home.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const mapHref = googleMapsUrl;
const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(showroomAddress)}&output=embed`;

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export async function generateMetadata({ searchParams }: { searchParams?: Promise<SearchParams> }): Promise<Metadata> {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  return pageMetadata({
    title: language === "zh"
      ? "居銮二手车 | YS HENG AUTOMOTIVE SDN BHD"
      : "Used Cars in Kluang | YS HENG AUTOMOTIVE SDN BHD",
    description: language === "zh"
      ? "YS HENG AUTOMOTIVE SDN BHD 位于柔佛州居銮。浏览目前可售二手车与已发布售价，并咨询看车、贷款流程及 Trade-in。"
      : "Browse currently available used cars and published selling prices from YS HENG AUTOMOTIVE SDN BHD in Kluang, Johor. Confirm viewing, loan-process, and trade-in details.",
    path: "/",
    language
  });
}

const previewFeaturedVehicles: PublicVehicle[] = [
  {
    id: "9f5d6f16-9bb5-46b9-bb13-e8a8b3534737",
    plateNumber: "VPK1234",
    make: "Toyota",
    model: "Vios",
    year: 2021,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 58000,
    photoUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=84"]
  },
  {
    id: "53af5d9e-ecb0-4f85-b7c5-0f56fd973571",
    plateNumber: "JRS8821",
    make: "Honda",
    model: "City",
    year: 2020,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 62000,
    photoUrl: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=900&q=84"]
  },
  {
    id: "2b544508-501e-4958-8bd3-f0fe728f5e14",
    plateNumber: "BQM3108",
    make: "Perodua",
    model: "Myvi",
    year: 2019,
    stockOwner: "KS",
    status: "Available",
    sellingPrice: 39800,
    photoUrl: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=84"]
  },
  {
    id: "fdc9ad77-96d8-474c-94f7-7f1646db7561",
    plateNumber: "KDH5520",
    make: "Nissan",
    model: "Serena",
    year: 2018,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 75800,
    photoUrl: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=84"]
  },
  {
    id: "a07ce9a0-b4c7-4ced-8a50-00a7ea342a7e",
    plateNumber: "PMA4306",
    make: "Mazda",
    model: "CX-5",
    year: 2021,
    stockOwner: "KS",
    status: "Available",
    sellingPrice: 108000,
    photoUrl: "https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=900&q=84"]
  },
  {
    id: "c4b31677-79b2-4861-a38d-926f50c1774e",
    plateNumber: "JTR2409",
    make: "Honda",
    model: "HR-V",
    year: 2021,
    stockOwner: "YSHeng",
    status: "Available",
    sellingPrice: 92800,
    photoUrl: "https://images.unsplash.com/photo-1600712242805-5f78671b24da?auto=format&fit=crop&w=900&q=84",
    photoUrls: ["https://images.unsplash.com/photo-1600712242805-5f78671b24da?auto=format&fit=crop&w=900&q=84"]
  }
];

const featuredCopy = {
  en: {
    kicker: "Featured Inventory",
    title: "Available cars. Clear prices.",
    text: "Find a car you like, then contact us to arrange a viewing.",
    viewAll: "View all cars",
    trustLabel: "Buyer confidence"
  },
  zh: {
    kicker: "精选车源",
    title: "目前可售车源，价格清楚",
    text: "比较目前可售的二手车与已发布售价，再联络团队确认看车详情。",
    viewAll: "查看全部车源",
    trustLabel: "买家信心"
  }
} as const;

export default async function HomePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  const t = frontofficeCopy[language];
  const featureT = featuredCopy[language];
  const inventory = await getPublicInventory();
  const vehicles = inventory.vehicles;
  const catalogModels = catalogModelsFromVehicles(vehicles);
  const prices = priceRange(vehicles);
  const years = distinctYears(vehicles);
  const featuredVehicles = featuredVehiclesFrom(vehicles);

  return (
    <main className="atelierPage homeRefinement" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="home" />

      <section className="atelierHero">
        <div className="atelierHeroInner">
          <Image
            src={heroImage}
            alt=""
            className="heroMedia"
            preload
            sizes="(max-width: 760px) 100vw, 50vw"
            placeholder="blur"
          />
          <div className="heroCopy">
            <p className="atelierKicker">{t.home.kicker}</p>
            <h1>
              <span className="heroTitleLead">{t.home.titleLineOne}</span>
              <span>{t.home.titleAccent}</span>
            </h1>
            <p className="heroIntro">{t.home.heroIntro}</p>
            <div className="heroActions">
              <Link href={hrefWithLanguage("/vehicles", language)} className="heroBrowseAction">
                {t.home.browseCars} <ArrowRight size={21} aria-hidden="true" />
              </Link>
              <span className="heroLocation"><MapPin size={18} aria-hidden="true" /> {t.home.heroLocation}</span>
            </div>
          </div>
          <HeroVehicleFilters
            action={`${basePath}/vehicles`}
            language={language}
            models={catalogModels}
            years={years}
            budgets={budgetOptions(prices.max)}
            vehicleCount={vehicles.length}
            showInventorySummary={!inventory.unavailable && vehicles.length > 0}
            labels={t.home}
          />
        </div>
      </section>

      <section className="featuredInventorySection" aria-labelledby="featured-inventory-title">
        <div className="sectionHeading splitHeading">
          <div>
            <h2 id="featured-inventory-title">{featureT.title}</h2>
            <p>{featureT.text}</p>
          </div>
          <Link href={hrefWithLanguage("/vehicles", language)} className="secondaryAction">{featureT.viewAll}</Link>
        </div>
        {featuredVehicles.length > 0 ? (
          <div className="vehicleGrid featuredHomeGrid">
            {featuredVehicles.map((vehicle, index) => (
              <VehicleCard vehicle={vehicle} language={language} key={`${vehicle.id}-${index}`} />
            ))}
          </div>
        ) : (
          <div className="emptyState homeInventoryEmpty">
            <h3>{inventory.unavailable ? t.inventory.unavailableTitle : t.inventory.emptyInventoryTitle}</h3>
            <p>{inventory.unavailable ? t.inventory.unavailableText : t.inventory.emptyInventoryText}</p>
            <Link href={hrefWithLanguage("/contact", language)} className="secondaryAction">{t.inventory.contactSales}</Link>
          </div>
        )}
      </section>

      <nav className="homeShortcuts" aria-label={t.home.shopKicker}>
        <h2>{t.home.shopKicker}</h2>
        <div>
          {t.home.categories.map((category) => (
            <Link href={hrefWithSearch("/vehicles", language, category.query === "under 30000" ? { maxPrice: "30000" } : { q: category.query })} key={category.title}>
              <span>{category.title}<small>{category.label}</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </nav>

      <section className="ecosystemSection">
        <div className="sectionHeading">
          <h2>{t.home.supportTitle}</h2>
          <p>{t.home.conciergeText}</p>
        </div>
        <div className="solutionGrid">
          <SolutionCard icon={<Banknote />} title={t.home.solutions[0].title} text={t.home.solutions[0].text} />
          <SolutionCard icon={<Wrench />} title={t.home.solutions[1].title} text={t.home.solutions[1].text} />
          <SolutionCard icon={<ShieldCheck />} title={t.home.solutions[2].title} text={t.home.solutions[2].text} />
        </div>
        <Link className="secondaryAction" href={hrefWithLanguage("/contact", language)}>{t.nav.contact}<ArrowRight size={18} aria-hidden="true" /></Link>
      </section>

      <section className="workshopSection">
        <div className="workshopCopy">
          <p className="atelierKicker">{t.home.workshopKicker}</p>
          <h2>{t.home.workshopTitle}</h2>
          <p>{t.home.workshopText}</p>
          <div className="hubList">
            {t.home.workshopBranches.map((branch) => (
              <span key={branch.region}><strong>{branch.region}</strong>{branch.description}</span>
            ))}
          </div>
        </div>
        <div className="mapPanel">
          <iframe
            src={mapEmbedUrl}
            title="YS Heng Automotive map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="mapLocationCard">
            <span><MapPin size={16} /></span>
            <div>
              <strong>{t.home.workshopBranches[0]?.region ?? "YS Heng Automotive"}</strong>
              <p>{showroomAddress}</p>
              <a href={mapHref} target="_blank" rel="noreferrer">{language === "zh" ? "在 Google 地图中查看" : "Open in Google Maps"}</a>
            </div>
          </div>
        </div>
      </section>

      <section className="trustEvidenceSection">
        <div className="evidencePanel">
          <div className="evidenceHeader">
            <h2>{t.home.whyTitle}</h2>
            <span>{t.home.evidenceIntro}</span>
          </div>
          <div className="evidenceList">
            {t.home.evidenceItems.map((item) => (
              <article className="evidenceItem" key={item.title}>
                <BadgeCheck size={20} aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
          <Link href={hrefWithLanguage("/vehicles", language)} className="secondaryAction">
            {t.home.evidenceAction} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="home" />
    </main>
  );
}

function SolutionCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article>
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function featuredVehiclesFrom(vehicles: PublicVehicle[]) {
  return vehicles
    .filter((vehicle) => vehicle.status === "Available")
    .slice(0, 6);
}

function catalogModelsFromVehicles(vehicles: PublicVehicle[]): PublicVehicleCatalogModel[] {
  const seen = new Set<string>();
  return vehicles
    .map((vehicle) => ({ make: vehicle.make.trim(), model: vehicle.model.trim() }))
    .filter((item) => {
      const key = `${item.make.toLowerCase()}-${item.model.toLowerCase()}`;
      if (!item.make || !item.model || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.make.localeCompare(right.make) || left.model.localeCompare(right.model));
}

function distinctYears(vehicles: PublicVehicle[]) {
  return [...new Set(vehicles.map((vehicle) => vehicle.year).filter(Number.isInteger))].sort((left, right) => right - left);
}

function budgetOptions(maxPrice: number) {
  return [30000, 50000, 80000, 120000, 180000].filter((price) => maxPrice === 0 || price <= maxPrice);
}

function hrefWithSearch(path: string, language: Language, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  if (language === "zh") {
    searchParams.set("lang", "zh");
  }
  return `${path}?${searchParams.toString()}`;
}
