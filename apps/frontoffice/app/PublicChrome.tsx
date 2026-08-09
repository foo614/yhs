"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Banknote, Car, Home, MessageCircle, Search, Sparkles } from "lucide-react";
import { frontofficeCopy, hrefWithLanguage, languages, languageSwitchHref, type Language } from "./i18n";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type ContactSection = "services" | "workshop" | "contact";
type FooterLink = { label: string; href: string };

export function PublicHeader({ language, active = "home" }: { language: Language; active?: "home" | "vehicles" | "contact" }) {
  const t = frontofficeCopy[language].nav;
  const [contactSection, setContactSection] = useContactSection(active);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="atelierHeader">
      <BrandLogo language={language} />
      <nav>
        <Link href={hrefWithLanguage("/", language)} className={active === "home" ? "active" : undefined}>{t.home}</Link>
        <Link href={hrefWithLanguage("/vehicles", language)} className={active === "vehicles" ? "active" : undefined}>{t.buyCar}</Link>
        <Link href={hrefWithLanguage("/contact#services", language)} onClick={() => setContactSection("services")} className={active === "contact" && contactSection === "services" ? "active" : undefined}>{t.services}</Link>
        <Link href={hrefWithLanguage("/contact#workshop", language)} onClick={() => setContactSection("workshop")} className={active === "contact" && contactSection === "workshop" ? "active" : undefined}>{t.workshop}</Link>
        <Link href={hrefWithLanguage("/contact#contact", language)} onClick={() => setContactSection("contact")} className={active === "contact" && contactSection === "contact" ? "active" : undefined}>{t.contact}</Link>
      </nav>
      <div className="headerTools">
        <form className="headerSearch" action={hrefWithLanguage("/vehicles", language)}>
          <Search size={13} />
          <input name="q" placeholder={t.searchPlaceholder} />
        </form>
        <Suspense fallback={null}>
          <LanguageSwitch language={language} />
        </Suspense>
      </div>
      <button
        className="mobileMenu"
        type="button"
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-header-menu"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        <span className="menuGlyph" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <button
        className={mobileMenuOpen ? "mobileDrawerBackdrop open" : "mobileDrawerBackdrop"}
        type="button"
        aria-label="Close menu"
        onClick={closeMobileMenu}
      />
      <nav
        id="mobile-header-menu"
        className={mobileMenuOpen ? "mobileDrawer open" : "mobileDrawer"}
        aria-label="Mobile menu"
        aria-hidden={!mobileMenuOpen}
      >
        <Link href={hrefWithLanguage("/", language)} onClick={closeMobileMenu} className={active === "home" ? "active" : undefined}>{t.home}</Link>
        <Link href={hrefWithLanguage("/vehicles", language)} onClick={closeMobileMenu} className={active === "vehicles" ? "active" : undefined}>{t.buyCar}</Link>
        <Link href={hrefWithLanguage("/contact#services", language)} onClick={() => { setContactSection("services"); closeMobileMenu(); }} className={active === "contact" && contactSection === "services" ? "active" : undefined}>{t.services}</Link>
        <Link href={hrefWithLanguage("/contact#workshop", language)} onClick={() => { setContactSection("workshop"); closeMobileMenu(); }} className={active === "contact" && contactSection === "workshop" ? "active" : undefined}>{t.workshop}</Link>
        <Link href={hrefWithLanguage("/contact#contact", language)} onClick={() => { setContactSection("contact"); closeMobileMenu(); }} className={active === "contact" && contactSection === "contact" ? "active" : undefined}>{t.contact}</Link>
        <form className="mobileDrawerSearch" action={hrefWithLanguage("/vehicles", language)} onSubmit={closeMobileMenu}>
          <Search size={14} />
          <input name="q" placeholder={t.searchPlaceholder} />
        </form>
        <Suspense fallback={null}>
          <LanguageSwitch language={language} />
        </Suspense>
      </nav>
    </header>
  );
}

export function PublicSubNav({ language, active = "home" }: { language: Language; active?: "home" | "vehicles" | "contact" }) {
  const t = frontofficeCopy[language].nav;
  const [contactSection, setContactSection] = useContactSection(active);

  return (
    <nav className="atelierSubNav">
      <BrandLogo language={language} />
      <div>
        <Link href={hrefWithLanguage("/", language)} className={active === "home" ? "active" : undefined}>{t.home}</Link>
        <Link href={hrefWithLanguage("/vehicles", language)} className={active === "vehicles" ? "active" : undefined}>{t.buyCar}</Link>
        <Link href={hrefWithLanguage("/contact#services", language)} onClick={() => setContactSection("services")} className={active === "contact" && contactSection === "services" ? "active" : undefined}>{t.services}</Link>
        <Link href={hrefWithLanguage("/contact#workshop", language)} onClick={() => setContactSection("workshop")} className={active === "contact" && contactSection === "workshop" ? "active" : undefined}>{t.workshop}</Link>
        <Link href={hrefWithLanguage("/contact#contact", language)} onClick={() => setContactSection("contact")} className={active === "contact" && contactSection === "contact" ? "active" : undefined}>{t.contact}</Link>
      </div>
      <Suspense fallback={null}>
        <LanguageSwitch language={language} />
      </Suspense>
    </nav>
  );
}

export function LanguageSwitch({ language }: { language: Language }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hash, setHash] = useState("");

  useEffect(() => {
    setHash(window.location.hash);
  }, []);

  const getSwitchHref = (entry: Language) => languageSwitchHref(pathname, searchParams?.toString() ?? "", entry, hash);

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
        <BrandLogo language={language} footer />
        <p>{t.description}</p>
      </div>
      <FooterLinks title={t.quickLinks} items={t.quickItems} language={language} />
      <FooterLinks title={t.services} items={t.serviceItems} language={language} />
      <FooterLinks title={t.company} items={t.companyItems} language={language} />
    </footer>
  );
}

function BrandLogo({ language, footer = false }: { language: Language; footer?: boolean }) {
  return (
    <Link href={hrefWithLanguage("/", language)} className={footer ? "atelierBrand footerBrand" : "atelierBrand"} aria-label="YS Heng Auto home">
      <img src={`${publicBasePath}/ys-heng-logo.png`} alt="YS Heng Auto" />
    </Link>
  );
}

export function PublicMobileNav({ language, active = "home" }: { language: Language; active?: "home" | "vehicles" | "contact" }) {
  const t = frontofficeCopy[language].nav;
  const items = [
    { key: "home", href: hrefWithLanguage("/", language), icon: <Home size={18} />, label: t.home },
    { key: "vehicles", href: hrefWithLanguage("/vehicles", language), icon: <Car size={18} />, label: t.mobileCars },
    { key: "sell", href: hrefWithLanguage("/contact#contact", language), icon: <Sparkles size={18} />, label: t.mobileSell },
    { key: "finance", href: hrefWithLanguage("/contact#services", language), icon: <Banknote size={18} />, label: t.mobileFinance },
    { key: "contact", href: hrefWithLanguage("/contact", language), icon: <MessageCircle size={18} />, label: t.mobileProfile }
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

function FooterLinks({ title, items, language }: { title: string; items: readonly FooterLink[]; language: Language }) {
  return (
    <nav>
      <h3>{title}</h3>
      {items.map((item) => {
        const href = item.href.startsWith("http") ? item.href : hrefWithLanguage(item.href, language);
        return href.startsWith("http")
          ? <a href={href} target="_blank" rel="noreferrer" key={item.label}>{item.label}</a>
          : <Link href={href} key={item.label}>{item.label}</Link>;
      })}
    </nav>
  );
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
