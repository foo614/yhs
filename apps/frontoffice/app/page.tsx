import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, Banknote, Car, MapPin, ShieldCheck, Sparkles, Star, Wrench } from "lucide-react";
import { HeroVehicleFilters } from "./HeroVehicleFilters";
import { PublicFooter, PublicHeader, PublicMobileNav } from "./PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type Language, type SearchParams } from "./i18n";
import { pageMetadata } from "./seo";
import { distinctMakes, priceRange } from "./vehicles/listing";
import { getPublicInventory, getPublicVehicleCatalog, type PublicVehicle, type PublicVehicleCatalogModel } from "./vehicles/service";
import { VehicleCard } from "./vehicles/VehicleCard";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const heroImage = `${basePath}/hero-price-bay-option2.png`;
const conciergeImage = "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=1200&q=88";
const showroomAddress = process.env.NEXT_PUBLIC_SHOWROOM_ADDRESS ??
  "No.6,JALAN PULAI, KAWASAN JALAN MERSING BATU 1 1/2,86000 KLUANG,JOHOR.";
const mapHref = "https://maps.app.goo.gl/3GGVr6vHLxhGabP28";
const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(showroomAddress)}&output=embed`;

const categoryImages = [
  "/category-art/budget.png",
  "/category-art/mpv.png",
  "/category-art/suv.png",
  "/category-art/utility.png"
];

const fallbackMakes = ["Toyota", "Honda", "Perodua", "Proton", "Nissan", "Mazda"];
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export async function generateMetadata({ searchParams }: { searchParams?: Promise<SearchParams> }): Promise<Metadata> {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  return pageMetadata({
    title: language === "zh" ? "居銮二手车买卖 | YS Heng Cars" : "Used cars in Kluang | YS Heng Cars",
    description: language === "zh"
      ? "浏览居銮 YS Heng 的二手车源、透明售价，并咨询看车、贷款与 trade-in 流程。"
      : "Browse YS Heng used cars in Kluang with clear prices and support for viewing, financing, trade-in, and handover.",
    path: "/",
    language
  });
}

export const previewFeaturedVehicles: PublicVehicle[] = [
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
    title: "Ready-to-view cars with clear prices",
    text: "A tighter showcase of available second-hand cars, shaped for quick comparison before you arrange viewing.",
    viewAll: "View all cars",
    trustLabel: "Buyer confidence"
  },
  zh: {
    kicker: "精选车源",
    title: "可预约看车，价格清楚",
    text: "精选可比较的二手车源，让买家更快查看价格、年份与下一步看车安排。",
    viewAll: "查看全部车源",
    trustLabel: "买家信心"
  }
} as const;

export default async function HomePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  const t = frontofficeCopy[language];
  const featureT = featuredCopy[language];
  const [inventory, catalog] = await Promise.all([getPublicInventory(), getPublicVehicleCatalog()]);
  const vehicles = inventory.vehicles;
  const makes = distinctMakes(vehicles);
  const catalogModels = catalog.unavailable ? catalogModelsFromVehicles(vehicles) : catalog.models;
  const prices = priceRange(vehicles);
  const years = distinctYears(vehicles);
  const popularMakes = popularMakesFrom(makes);
  const featuredVehicles = featuredVehiclesFrom(vehicles);
  const heroVehicles = featuredVehicles.slice(0, 2);

  return (
    <main className="atelierPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="home" />

      <section className="atelierHero">
        <img src={heroImage} alt="" className="heroMedia" />
        <div className="heroOverlay" />
        <HeroPriceTags language={language} vehicles={heroVehicles} />
        <div className="atelierHeroInner">
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

      <section className="marqueBand">
        <p>{t.home.popularMakes}</p>
        <div>
          {popularMakes.map((make) => <Link href={hrefWithSearch("/vehicles", language, { q: make })} key={make}>{make}</Link>)}
        </div>
      </section>

      <section className="featuredInventorySection" aria-labelledby="featured-inventory-title">
        <div className="sectionHeading splitHeading">
          <div>
            <p className="atelierKicker">{featureT.kicker}</p>
            <h2 id="featured-inventory-title">{featureT.title}</h2>
            <p>{featureT.text}</p>
          </div>
          <Link href={hrefWithLanguage("/vehicles", language)} className="secondaryAction">{featureT.viewAll}</Link>
        </div>
        {featuredVehicles.length > 0 ? (
          <div className="vehicleGrid featuredHomeGrid">
            {featuredVehicles.map((vehicle, index) => (
              <VehicleCard vehicle={vehicle} featured={index === 0} language={language} key={`${vehicle.id}-${index}`} />
            ))}
          </div>
        ) : (
          <div className="emptyState homeInventoryEmpty">
            <h3>{inventory.unavailable ? t.inventory.unavailableTitle : t.inventory.emptyTitle}</h3>
            <p>{inventory.unavailable ? t.inventory.unavailableText : t.inventory.emptyText}</p>
            <Link href={hrefWithLanguage("/contact", language)} className="secondaryAction">{t.inventory.contactSales}</Link>
          </div>
        )}
      </section>

      <section className="personaSection">
        <div className="centerHeading">
          <p className="atelierKicker">{t.home.shopKicker}</p>
          <h2>{t.home.shopTitle}</h2>
        </div>
        <div className="personaGrid">
          {t.home.categories.map((category, index) => (
            <Link href={hrefWithSearch("/vehicles", language, { q: category.query })} className="personaCard" key={category.title}>
              <img src={categoryImages[index]} alt="" />
              <div>
                <h3>{category.title}</h3>
                <p>{category.label}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="ecosystemSection">
        <div className="centerHeading">
          <p className="atelierKicker">{t.home.supportKicker}</p>
          <h2>{t.home.supportTitle}</h2>
        </div>
        <div className="solutionGrid">
          <SolutionCard icon={<Banknote />} title={t.home.solutions[0].title} text={t.home.solutions[0].text} />
          <SolutionCard icon={<Wrench />} title={t.home.solutions[1].title} text={t.home.solutions[1].text} />
          <SolutionCard icon={<ShieldCheck />} title={t.home.solutions[2].title} text={t.home.solutions[2].text} />
        </div>
      </section>

      <section className="conciergeSection">
        <div>
          <p className="atelierKicker">{t.home.conciergeKicker}</p>
          <h2>{t.home.conciergeTitle}</h2>
          <p>{t.home.conciergeText}</p>
          <div className="conciergeList">
            <span><Sparkles size={15} /> {t.home.conciergeItems[0]}</span>
            <span><Car size={15} /> {t.home.conciergeItems[1]}</span>
            <span><BadgeCheck size={15} /> {t.home.conciergeItems[2]}</span>
            <span><ShieldCheck size={15} /> {t.home.conciergeItems[3]}</span>
          </div>
        </div>
        <figure className="conciergePhoto">
          <img src={conciergeImage} alt="" />
          <figcaption>{t.home.buyerHelp}</figcaption>
        </figure>
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
              <a href={mapHref} target="_blank" rel="noreferrer">Open in Google Maps</a>
            </div>
          </div>
        </div>
      </section>

      <section className="trustReviewSection">
        <div className="trustColumn">
          <p className="atelierKicker">{t.home.whyKicker}</p>
          <h2>{t.home.whyTitle}</h2>
          <TrustRow icon={<BadgeCheck />} title={t.home.trustRows[0].title} text={t.home.trustRows[0].text} />
          <TrustRow icon={<Sparkles />} title={t.home.trustRows[1].title} text={t.home.trustRows[1].text} />
          <TrustRow icon={<ShieldCheck />} title={t.home.trustRows[2].title} text={t.home.trustRows[2].text} />
        </div>
        <div className="testimonialPanel">
          <div className="testimonialHeader">
            <h3>{t.home.reviews}</h3>
            <span>Facebook</span>
          </div>
          <Review text={t.home.reviewOne} name={t.home.reviewName} />
          <Review text={t.home.reviewTwo} name={t.home.reviewName} />
          <Link href={hrefWithLanguage("/contact", language)}>{t.home.readReviews}</Link>
        </div>
      </section>

      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="home" />
    </main>
  );
}

function HeroPriceTags({ language, vehicles }: { language: Language; vehicles: PublicVehicle[] }) {
  if (vehicles.length === 0) return null;

  return (
    <div className="heroPriceTags" aria-label={language === "zh" ? "精选车源价格" : "Featured vehicle prices"}>
      {vehicles.map((vehicle, index) => (
        <Link
          href={hrefWithSearch("/vehicles", language, { make: vehicle.make, maxPrice: String(vehicle.sellingPrice) })}
          className={`heroPriceTag heroPriceTag${index + 1}`}
          key={vehicle.id}
          aria-label={`${vehicle.year} ${vehicle.make} ${vehicle.model}, RM ${vehicle.sellingPrice.toLocaleString()}`}
        >
          <span className="heroPriceTagMotion">
            <span className="heroPriceTagPrice"><em>RM</em>{vehicle.sellingPrice.toLocaleString()}</span>
            <small>{vehicle.year} {vehicle.make} {vehicle.model}</small>
          </span>
        </Link>
      ))}
    </div>
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

function TrustRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="trustRow">
      <span>{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

function Review({ text, name }: { text: string; name: string }) {
  return (
    <article className="reviewBlock">
      <div>{Array.from({ length: 5 }).map((_, index) => <Star size={13} fill="currentColor" key={index} />)}</div>
      <p>"{text}"</p>
      <strong>- {name}</strong>
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

function popularMakesFrom(makes: string[]) {
  const seen = new Set<string>();
  return [...makes, ...fallbackMakes]
    .filter((make) => {
      const key = make.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function hrefWithSearch(path: string, language: Language, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  if (language === "zh") {
    searchParams.set("lang", "zh");
  }
  return `${path}?${searchParams.toString()}`;
}
