"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Banknote, Car, ExternalLink, MapPin, Mail, Phone, ShieldCheck, Wrench } from "lucide-react";
import { PublicFooter, PublicHeader, PublicMobileNav } from "../PublicChrome";
import { frontofficeCopy, hrefWithLanguage, languageFromSearchParams } from "../i18n";

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "60108281218";
const showroomAddress = process.env.NEXT_PUBLIC_SHOWROOM_ADDRESS ??
  "No.6,JALAN PULAI, KAWASAN JALAN MERSING BATU 1 1/2,86000 KLUANG,JOHOR.";
const salesPhone = process.env.NEXT_PUBLIC_SALES_PHONE ?? "010-828 1218";
const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "yshengauto@gmail.com";
const facebookUrl = "https://www.facebook.com/p/Ys-Heng-Automotive-Sdn-Bhd-100065128765841/";
const registrationText = "YS HENG AUTOMOTIVE SDN BHD 202301051775 (1545689-H)";

export default function ContactPage() {
  const searchParams = useSearchParams();
  const language = languageFromSearchParams({ lang: searchParams.get("lang") ?? undefined });
  const t = frontofficeCopy[language].contact;
  const phoneHref = `tel:${salesPhone.replace(/[^\d+]/g, "")}`;
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(showroomAddress)}`;
  const salesIntro = t.salesIntro ?? "Nak jual atau beli kereta? Hubungi Ah Boon 010-828 1218.";
  const serviceTiles = Array.isArray(t.tiles) && t.tiles.length >= 4 ? t.tiles : ["Vehicle viewing", "Financing guidance", "Preparation tracking", "Release readiness"];
  const workshopTiles = Array.isArray(t.workshopTiles) && t.workshopTiles.length >= 4 ? t.workshopTiles : ["Pre-delivery inspection", "JPJ & Puspakom", "Body and paint follow-up", "Handover coordination"];
  const callNow = t.callNow ?? "Call now";
  const whatsapp = t.whatsapp ?? "WhatsApp";
  const openMap = t.openMap ?? "Open map";
  const browse = t.browse ?? "Browse cars";
  const facebook = t.facebook ?? "Facebook";
  const reviewSnippet = t.reviewSnippet ?? "Not yet rated";
  const helpTitle = t.helpTitle ?? "How we help";
  const helpText = t.helpText ?? "Our team supports your used-car process from shortlist to handover.";
  const workshopKicker = t.workshopKicker ?? "Panel Workshop";
  const workshopTitle = t.workshopTitle ?? "Inspection, preparation and handover follow-up";
  const workshopText = t.workshopText ?? "We coordinate workshop support for inspections and preparation.";

  return (
    <main className="atelierSubPage">
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
          </div>
          <div className="heroActions">
            <Link href={hrefWithLanguage("/vehicles", language)} className="primaryAction">{browse}</Link>
            <a href={facebookUrl} target="_blank" rel="noreferrer" className="secondaryAction">{facebook}</a>
          </div>
        </div>
      </header>

      <section className="contactGrid" id="contact">
        <a className="contactCard" href={mapHref} target="_blank" rel="noreferrer">
          <MapPin size={28} />
          <h2>Ys Heng Automotive Sdn Bhd</h2>
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
          <p>Ys Heng Automotive Sdn Bhd</p>
        </a>
      </section>

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

      <section className="atelierServicePanel contactServices" id="workshop">
        <div>
          <p className="atelierKicker">{workshopKicker}</p>
          <h2>{workshopTitle}</h2>
          <p>{workshopText}</p>
        </div>
        <div className="serviceTiles">
          <span><Wrench size={20} /> {workshopTiles[0]}</span>
          <span><ShieldCheck size={20} /> {workshopTiles[1]}</span>
          <span><Car size={20} /> {workshopTiles[2]}</span>
          <span><Banknote size={20} /> {workshopTiles[3]}</span>
        </div>
      </section>

      <PublicFooter language={language} />

      <PublicMobileNav language={language} active="contact" />
    </main>
  );
}
