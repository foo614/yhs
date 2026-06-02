import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, Banknote, Car, MapPin, Search, ShieldCheck, Sparkles, Star, Wrench } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "./PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type Language } from "./i18n";
import { distinctMakes, priceRange } from "./vehicles/listing";
import { getPublicVehicles } from "./vehicles/service";

const heroImage = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1900&q=88";
const conciergeImage = "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=1200&q=88";
const mapImage = "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1400&q=80";

const categoryImages = [
  "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=84",
  "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=84",
  "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=84",
  "https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=900&q=84"
];

const fallbackMakes = ["Toyota", "Honda", "Perodua", "Proton", "Nissan", "Mazda"];
const workshopPinClasses = ["pinOne", "pinTwo"];

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const language = languageFromSearchParams(params);
  const t = frontofficeCopy[language];
  const vehicles = await getPublicVehicles();
  const makes = distinctMakes(vehicles);
  const prices = priceRange(vehicles);
  const popularMakes = makes.length ? makes.slice(0, 6) : fallbackMakes;

  return (
    <main className="atelierPage">
      <PublicHeader language={language} active="home" />

      <section className="atelierHero">
        <img src={heroImage} alt="" className="heroMedia" />
        <div className="heroOverlay" />
        <div className="atelierHeroInner">
          <p className="atelierKicker">{t.home.kicker}</p>
          <h1>
            {t.home.titleLineOne} <br />
            <span>{t.home.titleAccent}</span>
          </h1>
          <form className="atelierSearch" action="/vehicles">
            {language === "zh" && <input type="hidden" name="lang" value="zh" />}
            <label>
              <span>{t.home.make}</span>
              <select name="make" defaultValue="">
                <option value="">{t.home.anyBrand}</option>
                {(makes.length ? makes : fallbackMakes).map((make) => <option value={make} key={make}>{make}</option>)}
              </select>
            </label>
            <label>
              <span>{t.home.model}</span>
              <input name="model" placeholder={t.home.modelPlaceholder} />
            </label>
            <label>
              <span>{t.home.priceFrom}</span>
              <input name="minPrice" inputMode="numeric" placeholder={t.home.minPrice} />
            </label>
            <label>
              <span>{t.home.priceTo}</span>
              <input name="maxPrice" inputMode="numeric" placeholder={prices.max ? `RM ${prices.max.toLocaleString()}` : t.home.maxPrice} />
            </label>
            <label>
              <span>{t.home.yearFrom}</span>
              <select name="minYear" defaultValue="">
                <option value="">2015</option>
                <option value="2020">2020</option>
                <option value="2022">2022</option>
              </select>
            </label>
            <button type="submit"><Search size={16} /> {t.home.find}</button>
          </form>
        </div>
      </section>

      <section className="marqueBand">
        <p>{t.home.popularMakes}</p>
        <div>
          {popularMakes.map((make) => <Link href={hrefWithSearch("/vehicles", language, { q: make })} key={make}>{make}</Link>)}
        </div>
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
          <img src={mapImage} alt="" />
          {t.home.workshopBranches.map((branch, index) => (
            <MapPinLabel className={workshopPinClasses[index]} label={branch.pinLabel} key={branch.pinLabel} />
          ))}
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

      <PublicMobileNav language={language} />
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

function MapPinLabel({ className, label }: { className: string; label: string }) {
  return (
    <div className={`mapPin ${className}`}>
      <span><MapPin size={15} /></span>
      <strong>{label}</strong>
    </div>
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

function hrefWithSearch(path: string, language: Language, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  if (language === "zh") {
    searchParams.set("lang", "zh");
  }
  return `${path}?${searchParams.toString()}`;
}
