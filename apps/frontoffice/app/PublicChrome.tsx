"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Banknote, Car, Home, Menu, Search, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { frontofficeCopy, hrefWithLanguage, languages, type Language } from "./i18n";

const facebookUrl = "https://www.facebook.com/p/Ys-Heng-Automotive-Sdn-Bhd-100065128765841/";
type ContactSection = "services" | "workshop" | "contact";

export function PublicHeader({ language, active = "home" }: { language: Language; active?: "home" | "vehicles" | "contact" }) {
  const t = frontofficeCopy[language].nav;
  const [contactSection, setContactSection] = useContactSection(active);

  return (
    <header className="atelierHeader">
      <Link href={hrefWithLanguage("/", language)} className="atelierBrand">YS HENG AUTO</Link>
      <nav>
        <Link href={hrefWithLanguage("/", language)} className={active === "home" ? "active" : undefined}>{t.home}</Link>
        <Link href={hrefWithLanguage("/vehicles", language)} className={active === "vehicles" ? "active" : undefined}>{t.buyCar}</Link>
        <Link href={hrefWithLanguage("/contact#services", language)} onClick={() => setContactSection("services")} className={active === "contact" && contactSection === "services" ? "active" : undefined}>{t.services}</Link>
        <Link href={hrefWithLanguage("/contact#workshop", language)} onClick={() => setContactSection("workshop")} className={active === "contact" && contactSection === "workshop" ? "active" : undefined}>{t.workshop}</Link>
        <Link href={hrefWithLanguage("/contact#contact", language)} onClick={() => setContactSection("contact")} className={active === "contact" && contactSection === "contact" ? "active" : undefined}>{t.contact}</Link>
      </nav>
      <div className="headerTools">
        <div className="headerSearch">
          <Search size={13} />
          <input placeholder={t.searchPlaceholder} />
        </div>
        <LanguageSwitch language={language} />
      </div>
      <button className="mobileMenu" aria-label="Open menu"><Menu size={22} /></button>
    </header>
  );
}

export function PublicSubNav({ language, active = "home" }: { language: Language; active?: "home" | "vehicles" | "contact" }) {
  const t = frontofficeCopy[language].nav;
  const [contactSection, setContactSection] = useContactSection(active);

  return (
    <nav className="atelierSubNav">
      <Link href={hrefWithLanguage("/", language)} className="atelierBrand">YS HENG AUTO</Link>
      <div>
        <Link href={hrefWithLanguage("/", language)} className={active === "home" ? "active" : undefined}>{t.home}</Link>
        <Link href={hrefWithLanguage("/vehicles", language)} className={active === "vehicles" ? "active" : undefined}>{t.buyCar}</Link>
        <Link href={hrefWithLanguage("/contact#services", language)} onClick={() => setContactSection("services")} className={active === "contact" && contactSection === "services" ? "active" : undefined}>{t.services}</Link>
        <Link href={hrefWithLanguage("/contact#workshop", language)} onClick={() => setContactSection("workshop")} className={active === "contact" && contactSection === "workshop" ? "active" : undefined}>{t.workshop}</Link>
        <Link href={hrefWithLanguage("/contact#contact", language)} onClick={() => setContactSection("contact")} className={active === "contact" && contactSection === "contact" ? "active" : undefined}>{t.contact}</Link>
      </div>
      <LanguageSwitch language={language} />
    </nav>
  );
}

export function LanguageSwitch({ language }: { language: Language }) {
  const pathname = usePathname();
  const [currentSearch, setCurrentSearch] = useState("");
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    setCurrentSearch(window.location.search || "");
    setCurrentHash(window.location.hash || "");
    const handleLocation = () => {
      setCurrentSearch(window.location.search || "");
      setCurrentHash(window.location.hash || "");
    };
    window.addEventListener("popstate", handleLocation);
    window.addEventListener("hashchange", handleLocation);
    return () => {
      window.removeEventListener("popstate", handleLocation);
      window.removeEventListener("hashchange", handleLocation);
    };
  }, []);

  const getSwitchHref = (entry: Language) => {
    const params = new URLSearchParams(currentSearch);
    if (entry === "zh") {
      params.set("lang", "zh");
    } else {
      params.delete("lang");
    }
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}${currentHash || ""}`;
  };

  return (
    <div className="languageSwitch" aria-label="Language">
      {(Object.keys(languages) as Language[]).map((entry) => (
        <Link
          href={getSwitchHref(entry)}
          className={entry === language ? "active" : undefined}
          key={entry}
          aria-label={languages[entry].label}
        >
          {languages[entry].shortLabel}
        </Link>
      ))}
    </div>
  );
}

export function PublicFooter({ language }: { language: Language }) {
  const t = frontofficeCopy[language].footer;
  return (
    <footer className="atelierFooter">
      <div>
        <strong>YS HENG AUTO</strong>
        <p>{t.description}</p>
      </div>
      <FooterLinks title={t.quickLinks} items={t.quickItems} language={language} />
      <FooterLinks title={t.services} items={t.serviceItems} language={language} />
      <FooterLinks title={t.company} items={t.companyItems} language={language} />
      <FooterLinks title={t.support} items={t.supportItems} language={language} />
    </footer>
  );
}

export function PublicMobileNav({ language, active = "home" }: { language: Language; active?: "home" | "vehicles" | "contact" }) {
  const t = frontofficeCopy[language].nav;
  const items = [
    { key: "home", href: hrefWithLanguage("/", language), icon: <Home size={18} />, label: t.home },
    { key: "vehicles", href: hrefWithLanguage("/vehicles", language), icon: <Car size={18} />, label: t.mobileCars },
    { key: "sell", href: hrefWithLanguage("/contact#contact", language), icon: <Sparkles size={18} />, label: t.mobileSell },
    { key: "finance", href: hrefWithLanguage("/contact#services", language), icon: <Banknote size={18} />, label: t.mobileFinance },
    { key: "profile", href: hrefWithLanguage("/contact", language), icon: <UserRound size={18} />, label: t.mobileProfile }
  ];

  return (
    <nav className="atelierMobileNav" aria-label="Mobile navigation">
      {items.map((item) => (
        <Link
          href={item.href}
          className={(item.key === active || (active === "contact" && item.key === "profile")) ? "active" : undefined}
          aria-current={item.key === active ? "page" : undefined}
          key={item.key}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function FooterLinks({ title, items, language }: { title: string; items: readonly string[]; language: Language }) {
  return (
    <nav>
      <h3>{title}</h3>
      {items.map((item) => {
        const href = footerHref(item, language);
        return href.startsWith("http")
          ? <a href={href} target="_blank" rel="noreferrer" key={item}>{item}</a>
          : <Link href={href} key={item}>{item}</Link>;
      })}
    </nav>
  );
}

function footerHref(item: string, language: Language) {
  const normalized = item.toLowerCase();
  if (normalized.includes("facebook")) return facebookUrl;
  if (normalized.includes("sell") || item.includes("卖车")) return hrefWithLanguage("/contact#contact", language);
  if (normalized.includes("about") || item.includes("关于")) return hrefWithLanguage("/contact#services", language);
  if (normalized.includes("contact") || item.includes("联络")) return hrefWithLanguage("/contact#contact", language);
  if (normalized.includes("showroom") || item.includes("展厅")) return hrefWithLanguage("/contact#contact", language);
  if (normalized.includes("workshop") || item.includes("维修厂")) return hrefWithLanguage("/contact#workshop", language);
  if (normalized.includes("loan") || item.includes("贷款")) return hrefWithLanguage("/contact#services", language);
  if (normalized.includes("insurance") || normalized.includes("trade-in") || normalized.includes("jpj") || item.includes("保险")) return hrefWithLanguage("/contact#services", language);
  if (normalized.includes("privacy") || normalized.includes("terms") || normalized.includes("faq") || normalized.includes("guide") || item.includes("隐私") || item.includes("条款") || item.includes("常见") || item.includes("指南")) return hrefWithLanguage("/contact#services", language);
  return hrefWithLanguage("/vehicles", language);
}

function useContactSection(active: "home" | "vehicles" | "contact"): [ContactSection, (section: ContactSection) => void] {
  const [section, setSection] = useState<ContactSection>("contact");

  useEffect(() => {
    if (active !== "contact") {
      return;
    }

    const readSection = () => {
      setSection(normalizeContactHash(window.location.hash));
    };

    readSection();
    window.addEventListener("hashchange", readSection);
    return () => window.removeEventListener("hashchange", readSection);
  }, [active]);

  return [section, setSection];
}

function normalizeContactHash(hash: string): ContactSection {
  const section = hash.replace(/^#/, "").split("#")[0];
  return section === "services" || section === "workshop" || section === "contact" ? section : "contact";
}
