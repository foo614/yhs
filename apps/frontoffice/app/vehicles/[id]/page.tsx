import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CalendarDays, Car, CheckCircle2, ChevronLeft, Gauge, ShieldCheck, Tag, WalletCards } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type SearchParams } from "../../i18n";
import { relatedVehicles } from "../listing";
import { structuredDataJson, vehicleMetadata, vehicleStructuredData } from "../../seo";
import { getPublicVehicle, getPublicVehicleDetailPageData } from "../service";
import { VehiclePhoto } from "../VehiclePhoto";
import { LeadForm } from "./LeadForm";
import { VehicleGallery } from "./VehicleGallery";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await getPublicVehicle(id);
  if (!vehicle) {
    return { title: "Vehicle not found | YS Heng Cars", robots: { index: false, follow: false } };
  }
  return vehicleMetadata(vehicle);
}

export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
  const { id } = await params;
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
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
  const estimatedDownPayment = Number.isFinite(vehicle.sellingPrice) ? Math.round((vehicle.sellingPrice * 0.1) / 100) * 100 : 0;
  const currentYear = new Date().getFullYear();
  const ageText = year > 0 ? `${Math.max(0, currentYear - year)} years` : "To confirm";
  const stockLabel = vehicle.stockOwner === "KS" ? "Partner stock" : "YS Heng stock";
  const availabilityText = vehicle.status === "Available" ? "Available for enquiry" : vehicle.status;
  const leadText = t.lead ?? "A used-car listing prepared for enquiry, viewing, financing guidance, and delivery follow-up.";
  const introText = t.intro ?? "Ready-to-view second-hand car with enquiry and loan follow-up guidance.";
  const loanText = t.loanText ?? "Estimated from RM {amount} / month, subject to approval and final bank terms.";
  const nextTitle = t.nextTitle ?? "What happens next";
  const nextText = t.nextText ?? "Sales follow up, confirms viewing, and guides loan, documents, payment, insurance, transfer, and delivery steps.";
  const highlightsTitle = t.highlights ?? "Vehicle highlights";
  const gallery = vehicle.photoUrls.length > 0
    ? vehicle.photoUrls
    : vehicle.fallbackPhotoUrls ?? (vehicle.fallbackPhotoUrl ? [vehicle.fallbackPhotoUrl] : []);
  const detailFacts = [
    { label: t.make, value: make },
    { label: t.model, value: model },
    { label: "Year", value: String(year) },
    { label: t.plate, value: plateNumber },
    { label: "Stock channel", value: stockLabel },
    { label: "Availability", value: availabilityText }
  ];
  const supportItems = [
    "Viewing appointment follow-up",
    "Loan and monthly estimate guidance",
    "Trade-in discussion if needed",
    "Insurance, transfer, and delivery coordination"
  ];
  const enquiryCopy = language === "zh"
    ? {
        kicker: "快速询问",
        title: `想了解这辆 ${make || "车"}？`,
        body: "留下资料后，团队会协助确认看车时间、贷款估算、trade-in 与下一步流程。",
        priceLabel: "当前挂牌价",
        monthlyLabel: "估算月供",
        highlights: ["同日跟进", "可约看车", "贷款估算", "Trade-in 咨询"]
      }
    : {
        kicker: "Fast enquiry",
        title: `Interested in this ${make || "car"}?`,
        body: "Send your details and the team can help confirm viewing slots, loan estimate, trade-in options, and the next steps.",
        priceLabel: "Listed price",
        monthlyLabel: "Est. monthly",
        highlights: ["Same-day follow-up", "Viewing slot", "Loan estimate", "Trade-in advice"]
      };
  const compareIntro = language === "zh"
    ? "快速比较最接近的车源，不需要离开当前页面。"
    : "Quick alternatives for side-by-side decisions without taking over the page.";
  const viewDetailsLabel = language === "zh" ? "查看详情" : "View details";
  const readyStockLabel = language === "zh" ? "现车可询问" : "Ready stock";

  return (
    <main className="atelierSubPage">
      <PublicHeader language={language} active="vehicles" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(vehicleStructuredData(vehicle)) }} />

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
        <VehicleGallery photos={gallery} title={`${make} ${model}`} fallback={fallbackLetters} fallbackSrc={vehicle.fallbackPhotoUrl} />
        <div className="detailInfo">
          <p className="plate">{plateNumber}</p>
          <h1>{title}</h1>
          <p className="detailLead">{leadText}</p>
          <div className="priceBox">
            <span>{t.sellingPrice}</span>
            <strong>RM {vehicle.sellingPrice.toLocaleString()}</strong>
          </div>
          <div className="detailStatGrid" aria-label="Vehicle summary">
            <span><CalendarDays size={17} /> {year}</span>
            <span><Gauge size={17} /> {ageText}</span>
            <span><Tag size={17} /> {availabilityText}</span>
            <span><Car size={17} /> {stockLabel}</span>
          </div>
          <div className="financeBox">
            <Banknote size={22} />
            <div>
              <h2>{t.loanTitle}</h2>
              <p>{loanText.replace("{amount}", monthlyEstimate.toLocaleString())}</p>
            </div>
          </div>
          <div className="detailPaymentGrid">
            <div>
              <span>Est. 10% down payment</span>
              <strong>RM {estimatedDownPayment.toLocaleString()}</strong>
            </div>
            <div>
              <span>Public listing price</span>
              <strong>RM {vehicle.sellingPrice.toLocaleString()}</strong>
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
            {detailFacts.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </article>
        <article>
          <WalletCards size={24} />
          <h2>Buyer support</h2>
          <ul className="supportList">
            {supportItems.map((item) => (
              <li key={item}><CheckCircle2 size={17} /> {item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section id="enquire" className="enquirySection">
        <div className="enquiryShell">
          <div className="enquiryPitch">
            <p className="atelierKicker">{enquiryCopy.kicker}</p>
            <h2>{enquiryCopy.title}</h2>
            <p>{enquiryCopy.body}</p>
            <div className="enquiryHighlights" aria-label="Enquiry benefits">
              {enquiryCopy.highlights.map((item) => (
                <span key={item}><CheckCircle2 size={16} /> {item}</span>
              ))}
            </div>
            <div className="enquiryPriceRail" aria-label="Vehicle price summary">
              <span>
                {enquiryCopy.priceLabel}
                <strong>RM {vehicle.sellingPrice.toLocaleString()}</strong>
              </span>
              <span>
                {enquiryCopy.monthlyLabel}
                <strong>RM {monthlyEstimate.toLocaleString()} / mo</strong>
              </span>
            </div>
          </div>
          <LeadForm vehicleId={vehicle.id} language={language} />
        </div>
      </section>

      {related.length > 0 && (
        <section className="inventorySection relatedSection">
          <div className="sectionHeading splitHeading">
            <div>
              <p className="atelierKicker">{t.similarKicker}</p>
              <h2>{t.similarTitle}</h2>
              <p>{compareIntro}</p>
            </div>
            <Link href={hrefWithLanguage("/vehicles", language)} className="textLink">{t.viewAll}</Link>
          </div>
          <div className="compactCompareGrid">
            {related.map((item) => {
              const compareTitle = `${item.year} ${item.make} ${item.model}`.trim();
              const compareFallback = `${item.make.slice(0, 1)}${item.model.slice(0, 1)}` || "YH";
              return (
                <Link
                  href={hrefWithLanguage(`/vehicles/${item.id}`, language)}
                  className="compactCompareCard"
                  key={item.id}
                  aria-label={`${viewDetailsLabel}: ${compareTitle}`}
                >
                  <span className="compactCompareThumb">
                    <VehiclePhoto src={item.photoUrl} alt={compareTitle} fallback={compareFallback} fallbackSrc={item.fallbackPhotoUrl} />
                  </span>
                  <span className="compactCompareBody">
                    <span className="plate">{item.plateNumber}</span>
                    <strong>{compareTitle}</strong>
                    <span>{item.status === "Available" ? readyStockLabel : item.status}</span>
                  </span>
                  <span className="compactComparePrice">RM {item.sellingPrice.toLocaleString()}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      </section>

      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="vehicles" />
    </main>
  );
}
