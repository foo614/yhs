import type { Metadata } from "next";
import { Suspense } from "react";
import { languageFromSearchParams, type SearchParams } from "../i18n";
import { pageMetadata } from "../seo";
import ContactPageClient from "./ContactPageClient";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

export async function generateMetadata({ searchParams }: { searchParams?: Promise<SearchParams> }): Promise<Metadata> {
  const language = isStaticExport ? "en" : languageFromSearchParams(await searchParams);
  return pageMetadata({
    title: language === "zh" ? "联系 YS Heng 居銮车行" : "Contact YS Heng Automotive in Kluang",
    description: language === "zh"
      ? "联系 YS Heng 咨询居銮二手车、看车、贷款、trade-in 与交车安排。"
      : "Contact YS Heng in Kluang for used-car enquiries, viewing, financing guidance, trade-in, and handover support.",
    path: "/contact",
    language
  });
}

export default function ContactPage() {
  return (
    <Suspense fallback={<main className="atelierSubPage">Loading...</main>}>
      <ContactPageClient />
    </Suspense>
  );
}
