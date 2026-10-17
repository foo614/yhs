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
import styles from "./VehicleDetail.module.css";

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
  const stockLabel = vehicle.stockOwner === "KS" ? t.partnerStock : t.yshengStock;
  const availabilityText = vehicle.status === "Available"
    ? t.availableForEnquiry
    : vehicle.status === "LoanProcessing"
      ? t.loanProcessing
      : t.sold;
  const listingSummary = t.listingSummary
    .replace("{title}", title)
    .replace("{price}", formatThousands(vehicle.sellingPrice))
    .replace("{business}", legalBusinessName);
  const gallery = vehicle.photoUrls.length > 0
    ? vehicle.photoUrls
    : vehicle.fallbackPhotoUrls ?? (vehicle.fallbackPhotoUrl ? [vehicle.fallbackPhotoUrl] : []);
  const detailFacts = [
    { label: t.make, value: make },
    { label: t.model, value: model },
    { label: t.year, value: String(year) },
    { label: t.plate, value: plateNumber },
    { label: t.stockChannel, value: stockLabel },
    { label: t.availability, value: availabilityText }
  ];
  const enquiryCopy = t.enquiry;
  const vehicleCardCopy = frontofficeCopy[language].vehicleCard;
  const enquiryTitle = enquiryCopy.title.replace("{make}", make || (language === "zh" ? "车" : "car"));
  const viewDetailsLabel = vehicleCardCopy.viewDetails;

  return (
    <main className="atelierSubPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="vehicles" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(vehicleStructuredData(vehicle, language)) }} />

      <header className={`atelierSubHero detailAtelierHero ${styles.detailBreadcrumbHero}`}>
        <div className={`atelierSubHeroInner ${styles.detailBreadcrumbInner}`}>
          <Link href={hrefWithLanguage("/vehicles", language)} className="backLink"><ChevronLeft size={18} /> {t.back}</Link>
          <p className={`atelierKicker ${styles.detailBreadcrumbKicker}`}>{t.kicker}</p>
        </div>
      </header>
      <section className="detailPage">
      <section className="detailGrid">
        <div className="detailGalleryColumn">
          <VehicleGallery
            photos={gallery}
            title={title}
            fallback={fallbackLetters}
            fallbackSrc={vehicle.fallbackPhotoUrl}
            language={language}
          />
          {vehicle.descriptionMarkdown && (
            <section className="vehicleDescriptionSection" aria-label={t.descriptionAria}>
              <h2>{t.descriptionTitle}</h2>
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
          <div className="detailStatGrid" aria-label={t.summaryAria}>
            <span><CalendarDays size={17} /> {year}</span>
            <span><Tag size={17} /> {availabilityText}</span>
            <span><Car size={17} /> {stockLabel}</span>
          </div>
          <LoanCalculator sellingPrice={vehicle.sellingPrice} language={language} />
          <a className="primaryAction wideAction" href="#enquire">{t.enquire}</a>
        </div>
      </section>

      <section className="detailPanels">
        <article>
          <ShieldCheck size={24} />
          <h2>{t.nextTitle}</h2>
          <p>{t.nextText}</p>
        </article>
        <article>
          <Car size={24} />
          <h2>{t.highlights}</h2>
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
          <h2>{t.buyerSupport}</h2>
          <ul className="supportList">
            {t.supportItems.map((item) => (
              <li key={item}><CheckCircle2 size={17} /> {item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section id="enquire" className="enquirySection">
        <div className="enquiryShell">
          <div className="enquiryPitch">
            <p className="atelierKicker">{enquiryCopy.kicker}</p>
            <h2>{enquiryTitle}</h2>
            <p>{enquiryCopy.body}</p>
            <div className="enquiryHighlights" aria-label={enquiryCopy.benefitsAria}>
              {enquiryCopy.highlights.map((item) => (
                <span key={item}><CheckCircle2 size={16} /> {item}</span>
              ))}
            </div>
            <div className="enquiryPriceRail" aria-label={enquiryCopy.priceSummaryAria}>
              <span>
                {enquiryCopy.priceLabel}
                <strong>RM {formatThousands(vehicle.sellingPrice)}</strong>
              </span>
              <span>
                {enquiryCopy.monthlyLabel}
                <strong>{enquiryCopy.calculatorLink}</strong>
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
              <p>{t.compareIntro}</p>
            </div>
            <Link href={hrefWithLanguage("/vehicles", language)} className="textLink">{t.viewAll}</Link>
          </div>
          <div className="compactCompareGrid">
            {related.map((item) => {
              const compareTitle = `${item.year} ${item.make} ${item.model}`.trim();
              const compareFallback = `${item.make.slice(0, 1)}${item.model.slice(0, 1)}` || "YH";
              const compareStatus = item.status === "Available"
                ? t.availableForEnquiry
                : item.status === "LoanProcessing"
                  ? t.loanProcessing
                  : t.sold;
              const comparePhotoAlt = item.isRepresentativePhoto
                ? `${item.photoUrls.length > 0 ? vehicleCardCopy.representativePhotoAlt : vehicleCardCopy.photoComingSoon}: ${compareTitle}`
                : compareTitle;
              return (
                <Link
                  href={hrefWithLanguage(`/vehicles/${item.id}`, language)}
                  className="compactCompareCard"
                  key={item.id}
                  aria-label={`${viewDetailsLabel}: ${compareTitle}`}
                >
                  <span className="compactCompareThumb">
                    <VehiclePhoto src={item.photoUrl} alt={comparePhotoAlt} fallback={compareFallback} fallbackSrc={item.fallbackPhotoUrl} />
                  </span>
                  <span className="compactCompareBody">
                    <span className="plate">{item.plateNumber}</span>
                    <strong>{compareTitle}</strong>
                    <span>{compareStatus}</span>
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
