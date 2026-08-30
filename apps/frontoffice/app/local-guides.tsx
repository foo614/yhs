import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { businessName, showroomAddress } from "./business";
import { hrefWithLanguage, languageFromSearchParams, type Language, type SearchParams } from "./i18n";
import { PublicFooter, PublicHeader, PublicMobileNav } from "./PublicChrome";
import { canonicalUrl, pageMetadata, structuredDataJson } from "./seo";

export const localGuidePaths = [
  "/used-cars-kluang",
  "/used-cars-under-rm30000",
  "/car-loan-kluang",
  "/trade-in-car-kluang"
] as const;

export type LocalGuidePath = (typeof localGuidePaths)[number];

type GuideCopy = {
  title: string;
  description: string;
  kicker: string;
  heading: string;
  answer: string;
  sections: readonly { title: string; text: string }[];
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
};

const guideCopy: Record<LocalGuidePath, Record<Language, GuideCopy>> = {
  "/used-cars-kluang": {
    en: {
      title: "Used cars in Kluang, Johor | YS Heng Cars",
      description: "Browse current used cars from YS Heng Automotive in Kluang, with clear prices, viewing arrangements, and buyer support.",
      kicker: "Kluang used-car guide",
      heading: "Used cars in Kluang with clear, current details",
      answer: `${businessName} is a used-car dealer in Kluang, Johor. Buyers can browse currently available vehicles, compare published selling prices, and contact the team to arrange a viewing or discuss the next steps.`,
      sections: [
        { title: "Check current stock", text: "The inventory page shows vehicles returned as available by the public system. If stock cannot be loaded, the website shows an unavailable state instead of presenting sample cars as live inventory." },
        { title: "Arrange a viewing", text: "Choose a vehicle and send an enquiry with your name and phone number, or contact the Kluang showroom for a general viewing request." },
        { title: "Ask about the process", text: "The team can explain viewing, financing guidance, trade-in discussion, preparation, and handover steps without presenting an estimate as a guaranteed approval or quote." }
      ],
      primary: { label: "Browse available cars", href: "/vehicles" },
      secondary: { label: "Contact the Kluang showroom", href: "/contact#contact" }
    },
    zh: {
      title: "居銮二手车 | YS Heng Cars",
      description: "浏览 YS Heng Automotive 在居銮的现有二手车、公开售价、看车安排与买车支援。",
      kicker: "居銮二手车指南",
      heading: "居銮二手车，资料与价格清楚",
      answer: `${businessName} 是位于柔佛居銮的二手车商。买家可浏览目前可售车辆、比较公开售价，并联络团队安排看车或了解下一步。`,
      sections: [
        { title: "查看现有车源", text: "车源页面只显示公开系统所返回的可售车辆。若系统暂时无法读取车源，网站会显示无法载入状态，不会把示范车辆当作现货。" },
        { title: "预约看车", text: "选择车辆后，可留下姓名与电话号码询问，或直接联络居銮展厅安排一般看车。" },
        { title: "了解买车流程", text: "团队可说明看车、贷款协助、trade-in、车辆准备与交车步骤；估算不代表贷款批准或正式报价。" }
      ],
      primary: { label: "浏览可售车辆", href: "/vehicles" },
      secondary: { label: "联络居銮展厅", href: "/contact#contact" }
    }
  },
  "/used-cars-under-rm30000": {
    en: {
      title: "Used cars under RM30,000 in Kluang | YS Heng Cars",
      description: "Check YS Heng Automotive's currently available used cars priced at RM30,000 or below in Kluang, Johor.",
      kicker: "Budget car search",
      heading: "Used cars at RM30,000 or below",
      answer: `The filtered YS Heng inventory shows currently available vehicles with a published selling price of RM30,000 or below. Results depend on live stock, so the page may be empty when no matching vehicle is available.`,
      sections: [
        { title: "A real price filter", text: "The link applies a maximum selling-price filter of RM30,000. It does not redirect buyers to the unfiltered inventory." },
        { title: "Availability can change", text: "Vehicles are shown only while the public system marks them visible and available. An empty result is more accurate than stale or demo stock." },
        { title: "Confirm before visiting", text: "Open a matching vehicle page for its current published details, then enquire to confirm availability and arrange viewing in Kluang." }
      ],
      primary: { label: "View cars under RM30,000", href: "/vehicles?maxPrice=30000" },
      secondary: { label: "Ask about budget options", href: "/contact#contact" }
    },
    zh: {
      title: "居銮 RM30,000 以下二手车 | YS Heng Cars",
      description: "查看 YS Heng Automotive 在柔佛居銮目前售价 RM30,000 或以下的可售二手车。",
      kicker: "预算车源搜索",
      heading: "售价 RM30,000 或以下的二手车",
      answer: `YS Heng 的筛选车源会显示目前可售、公开售价 RM30,000 或以下的车辆。结果以实时车源为准；没有符合车辆时，页面会如实显示空白结果。`,
      sections: [
        { title: "真实价格筛选", text: "链接会使用 RM30,000 最高售价筛选，不会把买家带到没有筛选的全部车源。" },
        { title: "车源会随时变化", text: "只有公开系统标记为可见和可售的车辆才会显示。没有车源时显示空状态，比旧资料或示范车更准确。" },
        { title: "到访前先确认", text: "打开车辆详情查看现有公开资料，再发送询问以确认车源并安排在居銮看车。" }
      ],
      primary: { label: "查看 RM30,000 以下车源", href: "/vehicles?maxPrice=30000" },
      secondary: { label: "询问预算选择", href: "/contact#contact" }
    }
  },
  "/car-loan-kluang": {
    en: {
      title: "Used-car loan assistance in Kluang | YS Heng Cars",
      description: "Ask YS Heng Automotive in Kluang about used-car financing steps, documents, and estimate guidance.",
      kicker: "Financing guidance",
      heading: "Used-car loan assistance in Kluang",
      answer: `${businessName} can help buyers understand common used-car financing steps, monthly-payment estimates, and the documents a financing application may require. Final terms and approval always come from the lender.`,
      sections: [
        { title: "Start with the vehicle", text: "Select an available car and review its published selling price before discussing a down payment, tenure, or monthly estimate." },
        { title: "Prepare your details", text: "Requirements vary by lender and buyer profile. Ask the sales team which current documents are needed for your specific application." },
        { title: "Treat estimates correctly", text: "Website calculations and sales guidance are estimates only. They are not a lender offer, approval, or guaranteed interest rate." }
      ],
      primary: { label: "Browse cars", href: "/vehicles" },
      secondary: { label: "Ask about loan assistance", href: "/contact#services" }
    },
    zh: {
      title: "居銮二手车贷款协助 | YS Heng Cars",
      description: "向 YS Heng Automotive 了解居銮二手车贷款步骤、所需文件与月供估算。",
      kicker: "贷款流程协助",
      heading: "居銮二手车贷款协助",
      answer: `${businessName} 可协助买家了解一般二手车贷款步骤、月供估算及申请可能需要的文件。最终条件与批准结果由贷款机构决定。`,
      sections: [
        { title: "先选择车辆", text: "先选择可售车辆并查看公开售价，再讨论首期、贷款年限或月供估算。" },
        { title: "准备个人资料", text: "不同贷款机构和申请人情况会有不同要求。请向销售团队确认你的申请目前需要哪些文件。" },
        { title: "正确理解估算", text: "网站计算与销售说明仅供估算，不代表贷款机构的正式报价、批准或保证利率。" }
      ],
      primary: { label: "浏览车源", href: "/vehicles" },
      secondary: { label: "询问贷款协助", href: "/contact#services" }
    }
  },
  "/trade-in-car-kluang": {
    en: {
      title: "Trade in a car in Kluang | YS Heng Cars",
      description: "Contact YS Heng Automotive in Kluang to discuss trading in your current car when buying a used vehicle.",
      kicker: "Trade-in discussion",
      heading: "Discuss a vehicle trade-in in Kluang",
      answer: `${businessName} accepts enquiries from buyers who want to discuss trading in a current vehicle. The team can review the basic vehicle details and explain the next inspection and buying steps; no value is promised before assessment.`,
      sections: [
        { title: "Share accurate details", text: "Prepare the make, model, year, registration details, current condition, and any relevant ownership or financing information." },
        { title: "Arrange an assessment", text: "A meaningful trade-in discussion may require the vehicle to be viewed. Contact the Kluang showroom to arrange the next step." },
        { title: "Compare the full purchase", text: "Consider the selected replacement vehicle, trade-in assessment, financing, transfer, and handover together before deciding." }
      ],
      primary: { label: "Contact the team", href: "/contact#contact" },
      secondary: { label: "Browse replacement cars", href: "/vehicles" }
    },
    zh: {
      title: "居銮汽车 Trade-in 咨询 | YS Heng Cars",
      description: "联络 YS Heng Automotive，了解在居銮购买二手车时如何讨论现有车辆 trade-in。",
      kicker: "Trade-in 咨询",
      heading: "在居銮讨论车辆 trade-in",
      answer: `${businessName} 接受买家询问现有车辆 trade-in。团队可先了解基本车辆资料，并说明检查及买车的下一步；车辆未评估前不会保证价值。`,
      sections: [
        { title: "提供准确资料", text: "准备品牌、车型、年份、注册资料、目前车况，以及相关车主或贷款资料。" },
        { title: "安排车辆评估", text: "准确讨论 trade-in 可能需要查看车辆。请联络居銮展厅安排下一步。" },
        { title: "一起比较完整交易", text: "决定前，应同时考虑替换车辆、trade-in 评估、贷款、转名与交车安排。" }
      ],
      primary: { label: "联络团队", href: "/contact#contact" },
      secondary: { label: "浏览替换车源", href: "/vehicles" }
    }
  }
};

export function localGuideMetadata(path: LocalGuidePath, language: Language): Metadata {
  const copy = guideCopy[path][language];
  return pageMetadata({ title: copy.title, description: copy.description, path, language });
}

export function resolveGuideLanguage(searchParams?: SearchParams): Language {
  return process.env.NEXT_STATIC_EXPORT === "true" ? "en" : languageFromSearchParams(searchParams);
}

export function LocalGuidePage({ path, language }: { path: LocalGuidePath; language: Language }) {
  const copy = guideCopy[path][language];
  const related = localGuidePaths.filter((entry) => entry !== path);
  const relatedTitle = language === "zh" ? "相关买车指南" : "Related buyer guides";
  const locationLabel = language === "zh" ? "居銮，柔佛" : "Kluang, Johor";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.title,
    description: copy.description,
    url: canonicalUrl(path),
    inLanguage: language === "zh" ? "zh-Hans-MY" : "en-MY",
    about: { "@id": canonicalUrl("/#business") }
  };

  return (
    <main className="atelierSubPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="vehicles" />

      <header className="atelierSubHero inventoryAtelierHero">
        <div className="atelierSubHeroInner">
          <p className="atelierKicker">{copy.kicker}</p>
          <h1>{copy.heading}</h1>
          <p>{copy.answer}</p>
          <div className="contactQuickActions">
            <Link className="primaryAction" href={hrefWithLanguage(copy.primary.href, language)}>{copy.primary.label} <ArrowRight size={16} /></Link>
            <Link className="secondaryAction" href={hrefWithLanguage(copy.secondary.href, language)}>{copy.secondary.label}</Link>
          </div>
        </div>
      </header>

      <section className="ecosystemSection" aria-label={copy.kicker}>
        <div className="centerHeading">
          <p className="atelierKicker"><MapPin size={15} /> {locationLabel}</p>
          <h2>{copy.heading}</h2>
          <p>{showroomAddress}</p>
        </div>
        <div className="solutionGrid">
          {copy.sections.map((section) => (
            <article key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="featuredInventorySection" aria-labelledby="related-guide-title">
        <div className="sectionHeading">
          <div>
            <p className="atelierKicker">{language === "zh" ? "继续了解" : "Keep researching"}</p>
            <h2 id="related-guide-title">{relatedTitle}</h2>
          </div>
        </div>
        <div className="contactGrid">
          {related.map((relatedPath) => {
            const relatedCopy = guideCopy[relatedPath][language];
            return (
              <Link className="contactCard" href={hrefWithLanguage(relatedPath, language)} key={relatedPath}>
                <h3>{relatedCopy.heading}</h3>
                <p>{relatedCopy.description}</p>
                <span>{language === "zh" ? "阅读指南" : "Read guide"} <ArrowRight size={14} /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(structuredData) }} />
      <PublicFooter language={language} />
      <PublicMobileNav language={language} active="vehicles" />
    </main>
  );
}

export function guideCopyForTest(path: LocalGuidePath, language: Language) {
  return guideCopy[path][language];
}
