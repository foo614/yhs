import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarDays,
  Car,
  CheckCircle2,
  Fuel,
  Gauge,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wrench
} from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "./PublicChrome";
import { hrefWithLanguage, languageFromSearchParams, type Language, type SearchParams } from "./i18n";
import { distinctMakes, priceRange } from "./vehicles/listing";
import { pageMetadata } from "./seo";
import { getPublicVehicles } from "./vehicles/service";

const fallbackMakes = ["Toyota", "Honda", "BMW", "Mercedes-Benz", "Perodua", "Proton"];
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

const featuredCars = [
  {
    name: "Toyota Camry 2.5V",
    make: "Toyota",
    model: "Camry",
    price: "RM 138,800",
    year: "2021",
    mileage: "42,000 km",
    fuel: "Petrol",
    transmission: "Auto",
    location: "Kluang, Johor",
    tone: "graphite"
  },
  {
    name: "Honda Civic RS",
    make: "Honda",
    model: "Civic RS",
    price: "RM 126,500",
    year: "2022",
    mileage: "28,500 km",
    fuel: "Petrol",
    transmission: "Auto",
    location: "Johor Bahru",
    tone: "crimson"
  },
  {
    name: "BMW 320i",
    make: "BMW",
    model: "320i",
    price: "RM 158,000",
    year: "2020",
    mileage: "55,200 km",
    fuel: "Petrol",
    transmission: "Auto",
    location: "Kluang, Johor",
    tone: "steel"
  },
  {
    name: "Mercedes-Benz C200",
    make: "Mercedes-Benz",
    model: "C200",
    price: "RM 178,800",
    year: "2019",
    mileage: "61,000 km",
    fuel: "Petrol",
    transmission: "Auto",
    location: "Batu Pahat",
    tone: "champagne"
  },
  {
    name: "Perodua Myvi",
    make: "Perodua",
    model: "Myvi",
    price: "RM 45,800",
    year: "2022",
    mileage: "24,700 km",
    fuel: "Petrol",
    transmission: "Auto",
    location: "Kluang, Johor",
    tone: "oxide"
  },
  {
    name: "Proton X70",
    make: "Proton",
    model: "X70",
    price: "RM 89,800",
    year: "2021",
    mileage: "38,900 km",
    fuel: "Petrol",
    transmission: "Auto",
    location: "Muar, Johor",
    tone: "emerald"
  }
] as const;

const trustFeatures = [
  {
    icon: <BadgeCheck size={24} />,
    title: "Verified Listings",
    text: "Public inventory is filtered to available vehicles with clear price, model, and contact paths."
  },
  {
    icon: <Wrench size={24} />,
    title: "Inspected Cars",
    text: "Viewing and preparation steps stay coordinated before handover, loan, and delivery follow-up."
  },
  {
    icon: <Banknote size={24} />,
    title: "Transparent Pricing",
    text: "Selling prices stay visible so buyers can compare options without hidden marketplace friction."
  },
  {
    icon: <ShieldCheck size={24} />,
    title: "Secure Seller Contact",
    text: "Enquiries route through the sales workflow instead of exposing private back-office data."
  }
] as const;

const stats = [
  { value: 10000, suffix: "+", label: "Cars Listed" },
  { value: 500, suffix: "+", label: "Trusted Sellers" },
  { value: 98, suffix: "%", label: "Customer Satisfaction" },
  { value: 24, suffix: "/7", label: "Smart Search" }
] as const;

const steps = [
  {
    icon: <Search size={24} />,
    title: "Search",
    text: "Filter by brand, model, budget, year, and location from one premium dashboard."
  },
  {
    icon: <Car size={24} />,
    title: "Compare",
    text: "Scan price, mileage, fuel type, transmission, and verification status at a glance."
  },
  {
    icon: <MessageCircle size={24} />,
    title: "Contact Seller",
    text: "Send an enquiry, arrange viewing, or book the next test-drive discussion."
  }
] as const;

export const metadata: Metadata = pageMetadata({
  title: "YS Heng Cars | Premium second-hand cars in Johor",
  description: "Browse verified used cars, compare prices instantly, and connect with trusted YS Heng sellers in Malaysia.",
  path: "/"
});

export default async function HomePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  const vehicles = await getPublicVehicles();
  const makes = distinctMakes(vehicles);
  const prices = priceRange(vehicles);
  const popularMakes = makes.length ? makes.slice(0, 8) : fallbackMakes;

  return (
    <main className="premiumHome">
      <PublicHeader language={language} active="home" />

      <HeroSection
        language={language}
        makes={makes.length ? makes : fallbackMakes}
        maxPrice={prices.max}
        popularMakes={popularMakes}
      />

      <BrandMarquee language={language} makes={popularMakes} />
      <FeaturedCars language={language} />
      <TrustSection />
      <StatsSection />
      <HowItWorks />
      <FinalCTA language={language} />

      <PublicFooter language={language} />
      <PublicMobileNav language={language} active="home" />
    </main>
  );
}

function HeroSection({
  language,
  makes,
  maxPrice,
  popularMakes
}: {
  language: Language;
  makes: readonly string[];
  maxPrice: number;
  popularMakes: readonly string[];
}) {
  return (
    <section className="premiumHero" aria-labelledby="home-hero-title">
      <div className="premiumAurora" aria-hidden="true" />
      <div className="roadLines" aria-hidden="true" />
      <div className="premiumHeroInner">
        <div className="heroCopy">
          <p className="premiumKicker"><Sparkles size={15} /> AI-assisted used car discovery</p>
          <h1 id="home-hero-title">Find Your Perfect Second-Hand Car</h1>
          <p className="heroSubline">
            Browse verified used cars, compare prices instantly, and connect with trusted sellers.
          </p>
          <div className="premiumHeroActions">
            <Link href={hrefWithLanguage("/vehicles", language)} className="shineButton primary">
              Browse Cars <ArrowRight size={17} />
            </Link>
            <Link href={hrefWithLanguage("/contact#contact", language)} className="shineButton secondary">
              Sell Your Car
            </Link>
          </div>
          <div className="heroProof">
            <span><CheckCircle2 size={16} /> Verified public inventory</span>
            <span><CheckCircle2 size={16} /> Loan and handover support</span>
          </div>
        </div>

        <HeroVisual makes={popularMakes} />
      </div>

      <SearchPanel language={language} makes={makes} maxPrice={maxPrice} />
      <HeroSignalStrip />
    </section>
  );
}

function SearchPanel({ language, makes, maxPrice }: { language: Language; makes: readonly string[]; maxPrice: number }) {
  return (
    <form className="premiumSearchPanel" action={`${basePath}/vehicles`}>
      {language === "zh" && <input type="hidden" name="lang" value="zh" />}
      <div className="searchPanelHeader">
        <span><Search size={16} /></span>
        <div>
          <p>Smart Search Console</p>
          <strong>Match your budget, lifestyle, and next test drive.</strong>
        </div>
      </div>
      <div className="premiumSearchGrid">
        <DashboardField label="Brand">
          <select name="make" defaultValue="">
            <option value="">Any Brand</option>
            {makes.map((make) => <option value={make} key={make}>{make}</option>)}
          </select>
        </DashboardField>
        <DashboardField label="Model">
          <input name="model" placeholder="Camry, Civic, X70..." />
        </DashboardField>
        <DashboardField label="Budget">
          <select name="maxPrice" defaultValue="">
            <option value="">Any Budget</option>
            <option value="50000">Under RM 50k</option>
            <option value="90000">Under RM 90k</option>
            <option value="140000">Under RM 140k</option>
            <option value={maxPrice ? String(maxPrice) : "200000"}>Premium Range</option>
          </select>
        </DashboardField>
        <DashboardField label="Year">
          <select name="minYear" defaultValue="">
            <option value="">Any Year</option>
            <option value="2018">2018+</option>
            <option value="2020">2020+</option>
            <option value="2022">2022+</option>
          </select>
        </DashboardField>
        <DashboardField label="Location">
          <select name="location" defaultValue="">
            <option value="">Any Location</option>
            <option value="Kluang">Kluang</option>
            <option value="Johor Bahru">Johor Bahru</option>
            <option value="Batu Pahat">Batu Pahat</option>
          </select>
        </DashboardField>
        <button type="submit" className="searchSubmit">Search Cars</button>
      </div>
    </form>
  );
}

function DashboardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="dashboardField">
      <span>{label}</span>
      {children}
    </label>
  );
}

function HeroVisual({ makes }: { makes: readonly string[] }) {
  return (
    <div className="heroVehicleStage" aria-label="Futuristic car showcase">
      <div className="stageSpotlight" aria-hidden="true" />
      <div className="stageGrid" aria-hidden="true" />
      <div className="roadRibbon" aria-hidden="true" />
      <div className="speedTrace" aria-hidden="true" />
      <div className="heroCarCard">
        <div className="heroCarGlow" aria-hidden="true" />
        <div className="heroCarReflection" aria-hidden="true" />
        <CarSilhouette variant="hero" />
      </div>
      <div className="heroFloorShadow" aria-hidden="true" />
      <div className="floatingSpec top">
        <span>AI Match</span>
        <strong>94%</strong>
      </div>
      <div className="floatingSpec bottom">
        <span>Avg. savings</span>
        <strong>RM 8.4k</strong>
      </div>
      <div className="brandStack" aria-label="Popular brands">
        {makes.slice(0, 4).map((make) => <span key={make}>{make}</span>)}
      </div>
    </div>
  );
}

function HeroSignalStrip() {
  const signals = [
    { icon: <BadgeCheck size={16} />, label: "Verified Listings" },
    { icon: <Banknote size={16} />, label: "Clear Selling Prices" },
    { icon: <ShieldCheck size={16} />, label: "Secure Enquiries" },
    { icon: <Sparkles size={16} />, label: "Smart Search Ready" }
  ];

  return (
    <div className="heroSignalStrip" aria-label="Marketplace trust signals">
      {signals.map((signal) => (
        <span key={signal.label}>{signal.icon}{signal.label}</span>
      ))}
    </div>
  );
}

function BrandMarquee({ language, makes }: { language: Language; makes: readonly string[] }) {
  const doubledMakes = [...makes, ...makes];
  return (
    <section className="premiumBrandRail" aria-label="Popular makes">
      <p>Popular verified searches</p>
      <div>
        {doubledMakes.map((make, index) => (
          <Link href={hrefWithSearch("/vehicles", language, { q: make })} key={`${make}-${index}`}>
            {make}
          </Link>
        ))}
      </div>
    </section>
  );
}

function FeaturedCars({ language }: { language: Language }) {
  return (
    <section className="premiumSection featuredCars" aria-labelledby="featured-cars-title">
      <SectionHeading
        kicker="Curated Inventory"
        title="Featured second-hand cars"
        text="Six realistic picks shaped like a premium comparison board, with price, mileage, ownership signals, and a clear next action."
      />
      <div className="premiumCarGrid">
        {featuredCars.map((car, index) => (
          <CarCard car={car} language={language} index={index} key={car.name} />
        ))}
      </div>
    </section>
  );
}

function CarCard({ car, language, index }: { car: (typeof featuredCars)[number]; language: Language; index: number }) {
  return (
    <article className="premiumCarCard premiumReveal" style={{ "--motion-order": index } as CSSProperties}>
      <Link href={hrefWithSearch("/vehicles", language, { make: car.make, model: car.model })} className="premiumCarMedia" aria-label={`View ${car.name}`}>
        <span className="verifiedBadge"><BadgeCheck size={14} /> Verified</span>
        <div className={`carArt ${car.tone}`}>
          <CarSilhouette />
        </div>
      </Link>
      <div className="premiumCarBody">
        <div className="premiumCarTitle">
          <div>
            <p>{car.location}</p>
            <h3>{car.name}</h3>
          </div>
          <strong>{car.price}</strong>
        </div>
        <dl className="carSpecs">
          <div><dt><CalendarDays size={15} /> Year</dt><dd>{car.year}</dd></div>
          <div><dt><Gauge size={15} /> Mileage</dt><dd>{car.mileage}</dd></div>
          <div><dt><Fuel size={15} /> Fuel</dt><dd>{car.fuel}</dd></div>
          <div><dt><Car size={15} /> Gear</dt><dd>{car.transmission}</dd></div>
        </dl>
        <Link href={hrefWithSearch("/vehicles", language, { make: car.make, model: car.model })} className="cardCta">
          View Details <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}

function TrustSection() {
  return (
    <section className="premiumSection trustSection" aria-labelledby="trust-title">
      <SectionHeading
        kicker="Trusted Marketplace"
        title="Premium confidence signals"
        text="Glass-style cards keep the experience futuristic while staying grounded in practical used-car buying support."
      />
      <div className="trustGrid">
        {trustFeatures.map((feature, index) => (
          <article className="premiumTrustCard premiumReveal" style={{ "--motion-order": index } as CSSProperties} key={feature.title}>
            <span>{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="premiumStats" aria-label="Marketplace statistics">
      {stats.map((stat, index) => (
        <article className="premiumStat premiumReveal" style={{ "--motion-order": index } as CSSProperties} key={stat.label}>
          <strong className="premiumStatNumber" data-count-to={stat.value} data-count-suffix={stat.suffix}>0{stat.suffix}</strong>
          <span>{stat.label}</span>
        </article>
      ))}
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="premiumSection howSection" aria-labelledby="how-title">
      <SectionHeading
        kicker="How it works"
        title="Search, compare, then move with confidence"
        text="The flow is built for buyers who want a faster route from shortlist to viewing without losing trust."
      />
      <div className="stepTrack">
        {steps.map((step, index) => (
          <article className="premiumStep premiumReveal" style={{ "--motion-order": index } as CSSProperties} key={step.title}>
            <span className="stepNumber">0{index + 1}</span>
            <div>{step.icon}</div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCTA({ language }: { language: Language }) {
  return (
    <section className="finalCta premiumReveal" aria-labelledby="final-cta-title">
      <div className="finalCtaGlow" aria-hidden="true" />
      <p className="premiumKicker"><Star size={15} /> Next move</p>
      <h2 id="final-cta-title">Ready to find your next car?</h2>
      <p>Start with verified inventory, or send the team your selling details for the next step.</p>
      <div className="premiumHeroActions">
        <Link href={hrefWithLanguage("/vehicles", language)} className="shineButton primary">
          Start Browsing <ArrowRight size={17} />
        </Link>
        <Link href={hrefWithLanguage("/contact#contact", language)} className="shineButton secondary dark">
          List Your Car
        </Link>
      </div>
    </section>
  );
}

function SectionHeading({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="premiumSectionHeading">
      <p className="premiumKicker">{kicker}</p>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function CarSilhouette({ variant = "card" }: { variant?: "card" | "hero" }) {
  return (
    <div className={`carSilhouette ${variant}`} aria-hidden="true">
      <span className="carRoof" />
      <span className="carGlass" />
      <span className="carBody" />
      <span className="carBeltline" />
      <span className="carHighlight" />
      <span className="carMirror left" />
      <span className="carMirror right" />
      <span className="carLight left" />
      <span className="carLight right" />
      <span className="carWheel front" />
      <span className="carWheel rear" />
      <span className="carGround" />
    </div>
  );
}

function hrefWithSearch(path: string, language: Language, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  if (language === "zh") {
    searchParams.set("lang", "zh");
  }
  return `${path}?${searchParams.toString()}`;
}
