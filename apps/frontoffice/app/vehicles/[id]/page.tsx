import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CalendarDays, Car, ChevronLeft, Gauge, ShieldCheck } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams } from "../../i18n";
import { relatedVehicles } from "../listing";
import { getPublicVehicleDetailPageData } from "../service";
import { VehiclePhoto } from "../VehiclePhoto";
import { VehicleCard } from "../VehicleCard";
import { LeadForm } from "./LeadForm";

export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const language = languageFromSearchParams(await searchParams);
  const t = frontofficeCopy[language].detail;
  const pageData = await getPublicVehicleDetailPageData(id);
  if (!pageData) notFound();
  const { vehicle, vehicles } = pageData;
  const make = typeof vehicle.make === "string" ? vehicle.make : "";
  const model = typeof vehicle.model === "string" ? vehicle.model : "";
  const year = Number.isFinite(vehicle.year) ? vehicle.year : 0;
  const title = `${year} ${make} ${model}`.trim();
  const plateNumber = typeof vehicle.plateNumber === "string" ? vehicle.plateNumber : "N/A";
  const fallbackLetters = `${make.slice(0, 1)}${model.slice(0, 1)}` || "YH";
  const related = relatedVehicles(vehicles, vehicle);
  const monthlyEstimate = Number.isFinite(vehicle.sellingPrice) ? Math.round((vehicle.sellingPrice * 0.9) / 84) : 0;
  const leadText = t.lead ?? "A used-car listing prepared for enquiry, viewing, financing guidance, and delivery follow-up.";
  const introText = t.intro ?? "Ready-to-view second-hand car with enquiry and loan follow-up guidance.";
  const loanText = t.loanText ?? "Estimated from RM {amount} / month, subject to approval and final bank terms.";
  const nextTitle = t.nextTitle ?? "What happens next";
  const nextText = t.nextText ?? "Sales follow up, confirms viewing, and guides loan, documents, payment, insurance, transfer, and delivery steps.";
  const highlightsTitle = t.highlights ?? "Vehicle highlights";

  return (
    <main className="atelierSubPage">
      <PublicHeader language={language} active="vehicles" />

      <header className="atelierSubHero detailAtelierHero">
        <div className="atelierSubHeroInner">
          <Link href={hrefWithLanguage("/vehicles", language)} className="backLink"><ChevronLeft size={18} /> {t.back}</Link>
          <p className="atelierKicker">{t.kicker}</p>
          <h1>{title}</h1>
          <p>{introText}</p>
        </div>
      </header>
      <section className="detailPage">
      <section className="detailGrid">
        <div className="detailImage">
          <VehiclePhoto
            src={vehicle.photoUrl}
            alt={`${make} ${model}`}
            fallback={fallbackLetters}
          />
        </div>
        <div className="detailInfo">
          <p className="plate">{plateNumber}</p>
          <h1>{title}</h1>
          <p className="detailLead">{leadText}</p>
          <div className="priceBox">
            <span>{t.sellingPrice}</span>
            <strong>RM {vehicle.sellingPrice.toLocaleString()}</strong>
          </div>
          <div className="specPills detailPills">
            <span><CalendarDays size={16} /> {year}</span>
            <span><Car size={16} /> {vehicle.stockOwner}</span>
            <span><Gauge size={16} /> {vehicle.status}</span>
          </div>
          <div className="financeBox">
            <Banknote size={22} />
            <div>
              <h2>{t.loanTitle}</h2>
              <p>{loanText.replace("{amount}", monthlyEstimate.toLocaleString())}</p>
            </div>
          </div>
          <a className="primaryAction wideAction" href="#enquire">{t.enquire}</a>
        </div>
      </section>

      <section className="detailPanels">
        <article>
          <ShieldCheck size={24} />
          <h2>{nextTitle}</h2>
          <p>{nextText}</p>
        </article>
        <article>
          <Car size={24} />
          <h2>{highlightsTitle}</h2>
          <dl>
            <div><dt>{t.make}</dt><dd>{make}</dd></div>
            <div><dt>{t.model}</dt><dd>{model}</dd></div>
            <div><dt>{t.plate}</dt><dd>{plateNumber}</dd></div>
          </dl>
        </article>
      </section>

      <section id="enquire" className="enquirySection">
        <LeadForm vehicleId={vehicle.id} language={language} />
      </section>

      {related.length > 0 && (
        <section className="inventorySection relatedSection">
          <div className="sectionHeading splitHeading">
            <div>
              <p className="atelierKicker">{t.similarKicker}</p>
              <h2>{t.similarTitle}</h2>
            </div>
            <Link href={hrefWithLanguage("/vehicles", language)} className="textLink">{t.viewAll}</Link>
          </div>
          <div className="vehicleGrid">
            {related.map((item) => <VehicleCard vehicle={item} language={language} key={item.id} />)}
          </div>
        </section>
      )}
      </section>

      <PublicFooter language={language} />

      <PublicMobileNav language={language} />
    </main>
  );
}
