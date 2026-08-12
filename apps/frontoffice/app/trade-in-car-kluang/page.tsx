import type { Metadata } from "next";
import type { SearchParams } from "../i18n";
import { LocalGuidePage, localGuideMetadata, resolveGuideLanguage } from "../local-guides";

const path = "/trade-in-car-kluang" as const;

export async function generateMetadata({ searchParams }: { searchParams?: Promise<SearchParams> }): Promise<Metadata> {
  return localGuideMetadata(path, resolveGuideLanguage(await searchParams));
}

export default async function TradeInCarKluangPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  return <LocalGuidePage path={path} language={resolveGuideLanguage(await searchParams)} />;
}
