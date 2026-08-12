"use client";

import { useSearchParams } from "next/navigation";
import { Banknote, Car, ExternalLink, MapPin, Mail, Phone, ShieldCheck, Wrench } from "lucide-react";
import {
  businessName,
  companyRegistration,
  facebookUrl,
  googleMapsUrl,
  legalBusinessName,
  salesEmail,
  salesPhone,
  showroomAddress,
  whatsappNumber
} from "../business";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../PublicChrome";
import { frontofficeCopy, languageFromSearchParams } from "../i18n";
import { ContactEnquiryForm } from "./ContactEnquiryForm";

const registrationText = `${legalBusinessName} ${companyRegistration}`;

export default function ContactPageClient() {
  const searchParams = useSearchParams();
  const language = languageFromSearchParams({ lang: searchParams.get("lang") ?? undefined });
  const t = frontofficeCopy[language].contact;
  const phoneHref = `tel:${salesPhone.replace(/[^\d+]/g, "")}`;
  const mapHref = googleMapsUrl;
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(showroomAddress)}&output=embed`;
  const salesIntro = t.salesIntro ?? "Nak jual atau beli kereta? Hubungi Ah Boon 010-828 1218.";
  const serviceTiles = Array.isArray(t.tiles) && t.tiles.length >= 4 ? t.tiles : ["Vehicle viewing", "Financing guidance", "Preparation tracking", "Release readiness"];
  const callNow = t.callNow ?? "Call now";
  const whatsapp = t.whatsapp ?? "WhatsApp";
  const openMap = t.openMap ?? "Open map";
  const facebook = t.facebook ?? "Facebook";
  const reviewSnippet = t.reviewSnippet ?? "Not yet rated";
  const helpTitle = t.helpTitle ?? "How we help";
  const helpText = t.helpText ?? "Our team supports your used-car process from shortlist to handover.";
  const workshopKicker = t.workshopKicker ?? "Panel Workshop";
  const workshopTitle = t.workshopTitle ?? "Inspection, preparation and handover follow-up";
  const workshopText = t.workshopText ?? "We coordinate workshop support for inspections and preparation.";

  return (
    <main className="atelierSubPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="contact" />

      <header className="atelierSubHero contactAtelierHero">
        <div className="atelierSubHeroInner">
          <p className="atelierKicker">{t.kicker}</p>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
          <p>{salesIntro}</p>
          <div className="contactQuickActions">
            <a href={phoneHref} className="primaryAction"><Phone size={16} /> {callNow}</a>
            {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}`} className="secondaryAction"><Phone size={16} /> {whatsapp}</a>}
            <a href={mapHref} target="_blank" rel="noreferrer" className="secondaryAction"><MapPin size={16} /> {openMap}</a>
            <a href={facebookUrl} target="_blank" rel="noreferrer" className="secondaryAction"><ExternalLink size={16} /> {facebook}</a>
          </div>
        </div>
      </header>

      <section className="atelierServicePanel contactServices" id="services">
        <div>
          <p className="atelierKicker">{t.helpKicker}</p>
          <h2>{helpTitle}</h2>
          <p>{helpText}</p>
        </div>
        <div className="serviceTiles">
          <span><Car size={20} /> {serviceTiles[0]}</span>
          <span><Banknote size={20} /> {serviceTiles[1]}</span>
          <span><Wrench size={20} /> {serviceTiles[2]}</span>
          <span><ShieldCheck size={20} /> {serviceTiles[3]}</span>
        </div>
      </section>

      <section className="atelierServicePanel contactServices locationPanel" id="workshop">
        <div>
          <p className="atelierKicker">{workshopKicker}</p>
          <h2>{workshopTitle}</h2>
          <p>{workshopText}</p>
          <div className="locationActions">
            <a href={mapHref} target="_blank" rel="noreferrer" className="primaryAction"><MapPin size={16} /> {openMap}</a>
            <a href={phoneHref} className="secondaryAction"><Phone size={16} /> {callNow}</a>
          </div>
        </div>
        <div className="mapPanel contactMapPanel">
          <iframe
            src={mapEmbedUrl}
            title="YS Heng Automotive map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="mapLocationCard">
            <span><MapPin size={16} /></span>
            <div>
              <strong>{businessName}</strong>
              <p>{showroomAddress}</p>
              <a href={mapHref} target="_blank" rel="noreferrer">{openMap}</a>
            </div>
          </div>
        </div>
      </section>

      <section className="atelierServicePanel contactEnquiryPanel" id="enquiry">
        <div>
          <p className="atelierKicker">{t.formKicker}</p>
          <h2>{t.formTitle}</h2>
          <p>{t.formIntro}</p>
          <p>{t.formPrivacy}</p>
        </div>
        <ContactEnquiryForm language={language} />
      </section>

      <section className="contactGrid" id="contact">
        <a className="contactCard" href={mapHref} target="_blank" rel="noreferrer">
          <MapPin size={28} />
          <h2>{businessName}</h2>
          <p>{showroomAddress}</p>
          <p>{registrationText}</p>
          <p>{reviewSnippet}</p>
        </a>
        <a className="contactCard" href={phoneHref}>
          <Phone size={28} />
          <h2>{t.salesLine ?? "Sales line"}</h2>
          <p>{salesPhone}</p>
        </a>
        <a className="contactCard" href={`mailto:${salesEmail}`}>
          <Mail size={28} />
          <h2>{t.email ?? "Email"}</h2>
          <p>{salesEmail}</p>
        </a>
        <a className="contactCard" href={facebookUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={28} />
          <h2>{facebook}</h2>
          <p>{businessName}</p>
        </a>
      </section>

      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="contact" />
    </main>
  );
}
