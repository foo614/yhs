import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Car, CheckCircle2, ChevronLeft, ShieldCheck, Tag, WalletCards } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams, type SearchParams } from "../../i18n";
import { relatedVehicles } from "../listing";
import { structuredDataJson, vehicleMetadata, vehicleStructuredData } from "../../seo";
import { getPublicVehicle, getPublicVehicleDetailPageData } from "../service";
import { VehiclePhoto } from "../VehiclePhoto";
import { LeadForm } from "./LeadForm";
import { formatThousands } from "../../formatters";
import { LoanCalculator } from "../LoanCalculator";
import { MarketingDescription } from "../MarketingDescription";
import { VehicleGallery } from "./VehicleGallery";
import { legalBusinessName } from "../../business";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }): Promise<Metadata> {
  const { id } = await params;
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  const vehicle = await getPublicVehicle(id);
  if (!vehicle) {
    return { title: "Vehicle not found | YS Heng Cars", robots: { index: false, follow: false } };
  }
  return vehicleMetadata(vehicle, language);
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
  const stockLabel = vehicle.stockOwner === "KS" ? "Partner stock" : "YS Heng stock";
  const availabilityText = vehicle.status === "Available" ? "Available for enquiry" : vehicle.status;
  const listingSummary = language === "zh"
    ? `${title} 二手车，刊登售价 RM ${formatThousands(vehicle.sellingPrice)}，可通过 ${legalBusinessName} 查询。请联络居銮展厅确认车源与看车详情。`
    : `${title} used car listed at RM ${formatThousands(vehicle.sellingPrice)} and available for enquiry through ${legalBusinessName}. Contact the Kluang showroom to confirm availability and viewing details.`;
  const introText = listingSummary;
  const nextTitle = t.nextTitle ?? "What happens next";
  const nextText = language === "zh"
    ? "销售团队可确认看车安排，并说明贷款估算、文件、付款、保险、转名与交车需要进一步确认的事项。"
    : "Sales can confirm viewing arrangements and explain which loan-estimate, document, payment, insurance, transfer, and handover details still need confirmation.";
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
  const supportItems = language === "zh"
    ? ["确认看车安排", "贷款与月供估算说明", "按需要讨论 Trade-in", "询问保险、转名与交车步骤"]
    : ["Viewing-arrangement confirmation", "Loan and monthly-estimate guidance", "Trade-in discussion if needed", "Questions about insurance, transfer, and handover steps"];
  const enquiryCopy = language === "zh"
    ? {
        kicker: "快速询问",
        title: `想了解这辆 ${make || "车"}？`,
        body: "留下资料后，团队会协助确认看车时间、贷款估算、trade-in 与下一步流程。",
        priceLabel: "当前挂牌价",
        monthlyLabel: "估算月供",
        highlights: ["销售跟进", "看车询问", "贷款估算", "Trade-in 咨询"]
      }
    : {
        kicker: "Fast enquiry",
        title: `Interested in this ${make || "car"}?`,
        body: "Send your details and the team can help confirm viewing slots, loan estimate, trade-in options, and the next steps.",
        priceLabel: "Listed price",
        monthlyLabel: "Est. monthly",
        highlights: ["Sales follow-up", "Viewing request", "Loan estimate", "Trade-in discussion"]
      };
  const compareIntro = language === "zh"
    ? "快速比较最接近的车源，不需要离开当前页面。"
    : "Quick alternatives for side-by-side decisions without taking over the page.";
  const viewDetailsLabel = language === "zh" ? "查看详情" : "View details";

  return (
    <main className="atelierSubPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="vehicles" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(vehicleStructuredData(vehicle, language)) }} />

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
        <div className="detailGalleryColumn">
          <VehicleGallery photos={gallery} title={`${make} ${model}`} fallback={fallbackLetters} fallbackSrc={vehicle.fallbackPhotoUrl} />
          {vehicle.descriptionMarkdown && (
            <section className="vehicleDescriptionSection" aria-label="Vehicle description">
              <h2>Vehicle description</h2>
              <MarketingDescription markdown={vehicle.descriptionMarkdown} />
            </section>
          )}
        </div>
        <div className="detailInfo">
          <p className="plate">{plateNumber}</p>
          <h1>{title}</h1>
          <p className="detailLead">{listingSummary}</p>
          <div className="priceBox">
            <span>{t.sellingPrice}</span>
            <strong>RM {formatThousands(vehicle.sellingPrice)}</strong>
          </div>
          <div className="detailStatGrid" aria-label="Vehicle summary">
            <span><CalendarDays size={17} /> {year}</span>
            <span><Tag size={17} /> {availabilityText}</span>
            <span><Car size={17} /> {stockLabel}</span>
          </div>
          <LoanCalculator sellingPrice={vehicle.sellingPrice} />
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
                <strong>RM {formatThousands(vehicle.sellingPrice)}</strong>
              </span>
              <span>
                {enquiryCopy.monthlyLabel}
                <strong>See calculator above</strong>
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
                    <span>{item.status}</span>
                  </span>
                  <span className="compactComparePrice">RM {formatThousands(item.sellingPrice)}</span>
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
