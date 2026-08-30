import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { legalBusinessName, showroomAddress } from "./business";
import { hrefWithLanguage, languageFromSearchParams, type Language, type SearchParams } from "./i18n";
import { PublicFooter, PublicHeader, PublicMobileNav } from "./PublicChrome";
import { canonicalUrl, localizedUrl, pageMetadata, structuredDataJson } from "./seo";

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
  sectionHeading: string;
  answer: string;
  sections: readonly { title: string; text: string }[];
  faqs: readonly { question: string; answer: string }[];
  references: readonly { label: string; href: string }[];
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
};

const guideLastUpdated = "2026-08-27";
const jpjOwnershipTransferUrl = "https://www.jpj.gov.my/en/guide-to-voluntary-transfer-of-ownership/";
const puspakomTransferInspectionUrl = "https://www.puspakom.com.my/transfer-of-ownership/";
const bankNegaraHirePurchaseGuideUrl = "https://www.bnm.gov.my/-/consumerguide-hpa2026";

const guideUiCopy = {
  en: {
    breadcrumbLabel: "Breadcrumb",
    homeLabel: "Home",
    lastUpdatedLabel: "Last updated",
    faqKicker: "Buyer questions",
    faqTitle: "Frequently asked questions",
    referencesKicker: "Verified information",
    referencesTitle: "Sources and useful links",
    openReferenceLabel: "Open reference"
  },
  zh: {
    breadcrumbLabel: "面包屑导航",
    homeLabel: "首页",
    lastUpdatedLabel: "最后更新",
    faqKicker: "买家问题",
    faqTitle: "常见问题",
    referencesKicker: "已核对资料",
    referencesTitle: "资料来源与实用链接",
    openReferenceLabel: "打开链接"
  }
} satisfies Record<Language, Record<string, string>>;

const guideCopy: Record<LocalGuidePath, Record<Language, GuideCopy>> = {
  "/used-cars-kluang": {
    en: {
      title: "Used Cars in Kluang, Johor | YS HENG AUTOMOTIVE SDN BHD",
      description: "Browse current used cars from YS HENG AUTOMOTIVE SDN BHD in Kluang, with published prices, viewing enquiries, and buyer guidance.",
      kicker: "Kluang used-car guide",
      heading: "Used cars in Kluang with clear, current details",
      sectionHeading: "How to check current used cars in Kluang",
      answer: `${legalBusinessName} is a used-car dealer in Kluang, Johor. Buyers can browse currently available vehicles, compare published selling prices, and contact the team to arrange a viewing or discuss the next steps.`,
      sections: [
        { title: "Check current stock", text: "The inventory page shows vehicles returned as available by the public system. If stock cannot be loaded, the website shows an unavailable state instead of presenting sample cars as live inventory." },
        { title: "Arrange a viewing", text: "Choose a vehicle and send an enquiry with your name and phone number, or contact the Kluang showroom for a general viewing request." },
        { title: "Ask about the process", text: "The team can explain viewing, financing guidance, trade-in discussion, preparation, and handover steps without presenting an estimate as a guaranteed approval or quote." }
      ],
      faqs: [
        { question: "Where can I see current YS Heng used cars in Kluang?", answer: "Use the live inventory page. It only shows vehicles the public system currently marks as visible and available." },
        { question: "How can I arrange a viewing in Kluang?", answer: "Open a vehicle and send an enquiry, or contact the Kluang showroom. Confirm availability before visiting." }
      ],
      references: [
        { label: "Current available vehicles at YS Heng", href: "/vehicles" },
        { label: "JPJ voluntary ownership transfer guide", href: jpjOwnershipTransferUrl }
      ],
      primary: { label: "Browse available cars", href: "/vehicles" },
      secondary: { label: "Contact the Kluang showroom", href: "/contact#contact" }
    },
    zh: {
      title: "居銮二手车 | YS HENG AUTOMOTIVE SDN BHD",
      description: "浏览 YS HENG AUTOMOTIVE SDN BHD 在居銮的现有二手车、已发布售价、看车咨询与买车指南。",
      kicker: "居銮二手车指南",
      heading: "居銮二手车，资料与价格清楚",
      sectionHeading: "如何查看居銮目前可售二手车",
      answer: `${legalBusinessName} 是位于柔佛居銮的二手车商。买家可浏览目前可售车辆、比较公开售价，并联络团队安排看车或了解下一步。`,
      sections: [
        { title: "查看现有车源", text: "车源页面只显示公开系统所返回的可售车辆。若系统暂时无法读取车源，网站会显示无法载入状态，不会把示范车辆当作现货。" },
        { title: "预约看车", text: "选择车辆后，可留下姓名与电话号码询问，或直接联络居銮展厅安排一般看车。" },
        { title: "了解买车流程", text: "团队可说明看车、贷款协助、trade-in、车辆准备与交车步骤；估算不代表贷款批准或正式报价。" }
      ],
      faqs: [
        { question: "在哪里可以查看 YS Heng 在居銮的现有二手车？", answer: "请查看实时车源页面。页面只显示公开系统目前标记为可见及可售的车辆。" },
        { question: "如何在居銮预约看车？", answer: "打开车辆页面发送询问，或联络居銮展厅。到访前请先确认车源。" }
      ],
      references: [
        { label: "YS Heng 目前可售车辆", href: "/vehicles" },
        { label: "JPJ 自愿转移车辆所有权指南", href: jpjOwnershipTransferUrl }
      ],
      primary: { label: "浏览可售车辆", href: "/vehicles" },
      secondary: { label: "联络居銮展厅", href: "/contact#contact" }
    }
  },
  "/used-cars-under-rm30000": {
    en: {
      title: "Used Cars Under RM30,000 | YS HENG AUTOMOTIVE SDN BHD",
      description: "Check currently available used cars priced at RM30,000 or below from YS HENG AUTOMOTIVE SDN BHD in Kluang, Johor.",
      kicker: "Budget car search",
      heading: "Used cars at RM30,000 or below",
      sectionHeading: "How to compare cars at RM30,000 or below",
      answer: `${legalBusinessName}'s filtered inventory shows currently available vehicles with a published selling price of RM30,000 or below. Results depend on live stock, so the page may be empty when no matching vehicle is available.`,
      sections: [
        { title: "A real price filter", text: "The link applies a maximum selling-price filter of RM30,000. It does not redirect buyers to the unfiltered inventory." },
        { title: "Availability can change", text: "Vehicles are shown only while the public system marks them visible and available. An empty result is more accurate than stale or demo stock." },
        { title: "Confirm before visiting", text: "Open a matching vehicle page for its current published details, then enquire to confirm availability and arrange viewing in Kluang." }
      ],
      faqs: [
        { question: "Are vehicles under RM30,000 always available?", answer: "No. The results use current public inventory and may be empty when no visible, available vehicle matches the price filter." },
        { question: "What does the RM30,000 filter cover?", answer: "It filters the published vehicle selling price only. Ask separately about financing, insurance, transfer, and other ownership costs." }
      ],
      references: [
        { label: "Current vehicles at RM30,000 or below", href: "/vehicles?maxPrice=30000" },
        { label: "All current available vehicles", href: "/vehicles" }
      ],
      primary: { label: "View cars under RM30,000", href: "/vehicles?maxPrice=30000" },
      secondary: { label: "Ask about budget options", href: "/contact#contact" }
    },
    zh: {
      title: "居銮 RM30,000 以下二手车 | YS HENG AUTOMOTIVE SDN BHD",
      description: "查看 YS HENG AUTOMOTIVE SDN BHD 在柔佛居銮目前售价 RM30,000 或以下的可售二手车。",
      kicker: "预算车源搜索",
      heading: "售价 RM30,000 或以下的二手车",
      sectionHeading: "如何比较 RM30,000 或以下车源",
      answer: `${legalBusinessName} 的筛选车源会显示目前可售、公开售价 RM30,000 或以下的车辆。结果以实时车源为准；没有符合车辆时，页面会如实显示空白结果。`,
      sections: [
        { title: "真实价格筛选", text: "链接会使用 RM30,000 最高售价筛选，不会把买家带到没有筛选的全部车源。" },
        { title: "车源会随时变化", text: "只有公开系统标记为可见和可售的车辆才会显示。没有车源时显示空状态，比旧资料或示范车更准确。" },
        { title: "到访前先确认", text: "打开车辆详情查看现有公开资料，再发送询问以确认车源并安排在居銮看车。" }
      ],
      faqs: [
        { question: "RM30,000 以下的车辆是否一直有货？", answer: "不一定。结果来自目前公开车源；没有可见、可售车辆符合价格筛选时，页面可能没有结果。" },
        { question: "RM30,000 筛选包含什么？", answer: "筛选只针对车辆公开售价。贷款、保险、转名及其他拥车成本应另外询问。" }
      ],
      references: [
        { label: "目前 RM30,000 或以下车辆", href: "/vehicles?maxPrice=30000" },
        { label: "全部目前可售车辆", href: "/vehicles" }
      ],
      primary: { label: "查看 RM30,000 以下车源", href: "/vehicles?maxPrice=30000" },
      secondary: { label: "询问预算选择", href: "/contact#contact" }
    }
  },
  "/car-loan-kluang": {
    en: {
      title: "Used-Car Loan Guide | YS HENG AUTOMOTIVE SDN BHD",
      description: "Ask YS HENG AUTOMOTIVE SDN BHD in Kluang about used-car financing steps, documents, and estimate guidance.",
      kicker: "Financing guidance",
      heading: "Used-car loan assistance in Kluang",
      sectionHeading: "What to confirm before a used-car loan enquiry",
      answer: `${legalBusinessName} can help buyers understand common used-car financing steps, monthly-payment estimates, and the documents a financing application may require. Final terms and approval always come from the lender.`,
      sections: [
        { title: "Start with the vehicle", text: "Select an available car and review its published selling price before discussing a down payment, tenure, or monthly estimate." },
        { title: "Prepare your details", text: "Requirements vary by lender and buyer profile. Ask the sales team which current documents are needed for your specific application." },
        { title: "Treat estimates correctly", text: "Website calculations and sales guidance are estimates only. They are not a lender offer, approval, or guaranteed interest rate." }
      ],
      faqs: [
        { question: "Does YS Heng approve the car loan?", answer: "No. YS Heng can explain the application process and estimates, but the lender decides the final approval and terms." },
        { question: "Where can I check current hire-purchase consumer information?", answer: "Use the Bank Negara Malaysia 2026 hire-purchase consumer guide linked below, then confirm current terms with the lender." }
      ],
      references: [
        { label: "Bank Negara Malaysia 2026 hire-purchase consumer guide", href: bankNegaraHirePurchaseGuideUrl },
        { label: "Current available vehicles at YS Heng", href: "/vehicles" }
      ],
      primary: { label: "Browse cars", href: "/vehicles" },
      secondary: { label: "Ask about loan assistance", href: "/contact#services" }
    },
    zh: {
      title: "居銮二手车贷款指南 | YS HENG AUTOMOTIVE SDN BHD",
      description: "向 YS HENG AUTOMOTIVE SDN BHD 了解居銮二手车贷款步骤、所需文件与月供估算。",
      kicker: "贷款流程协助",
      heading: "居銮二手车贷款协助",
      sectionHeading: "咨询二手车贷款前应确认什么",
      answer: `${legalBusinessName} 可协助买家了解一般二手车贷款步骤、月供估算及申请可能需要的文件。最终条件与批准结果由贷款机构决定。`,
      sections: [
        { title: "先选择车辆", text: "先选择可售车辆并查看公开售价，再讨论首期、贷款年限或月供估算。" },
        { title: "准备个人资料", text: "不同贷款机构和申请人情况会有不同要求。请向销售团队确认你的申请目前需要哪些文件。" },
        { title: "正确理解估算", text: "网站计算与销售说明仅供估算，不代表贷款机构的正式报价、批准或保证利率。" }
      ],
      faqs: [
        { question: "YS Heng 是否批准汽车贷款？", answer: "不是。YS Heng 可说明申请流程与估算，最终批准及条件由贷款机构决定。" },
        { question: "在哪里查看目前的租购消费者资料？", answer: "请参考下方的马来西亚国家银行 2026 租购消费者指南，再向贷款机构确认当前条件。" }
      ],
      references: [
        { label: "马来西亚国家银行 2026 租购消费者指南", href: bankNegaraHirePurchaseGuideUrl },
        { label: "YS Heng 目前可售车辆", href: "/vehicles" }
      ],
      primary: { label: "浏览车源", href: "/vehicles" },
      secondary: { label: "询问贷款协助", href: "/contact#services" }
    }
  },
  "/trade-in-car-kluang": {
    en: {
      title: "Trade-In Car Guide | YS HENG AUTOMOTIVE SDN BHD",
      description: "Contact YS HENG AUTOMOTIVE SDN BHD in Kluang to discuss trading in your current car when buying a used vehicle.",
      kicker: "Trade-in discussion",
      heading: "Discuss a vehicle trade-in in Kluang",
      sectionHeading: "What to prepare for a trade-in discussion",
      answer: `${legalBusinessName} accepts enquiries from buyers who want to discuss trading in a current vehicle. The team can review the basic vehicle details and explain the next inspection and buying steps; no value is promised before assessment.`,
      sections: [
        { title: "Share accurate details", text: "Prepare the make, model, year, registration details, current condition, and any relevant ownership or financing information." },
        { title: "Arrange an assessment", text: "A meaningful trade-in discussion may require the vehicle to be viewed. Contact the Kluang showroom to arrange the next step." },
        { title: "Compare the full purchase", text: "Consider the selected replacement vehicle, trade-in assessment, financing, transfer, and handover together before deciding." }
      ],
      faqs: [
        { question: "Can YS Heng guarantee a trade-in value online?", answer: "No. The team needs to assess the vehicle before discussing a meaningful trade-in value." },
        { question: "Where can I check the ownership-transfer process?", answer: "Use the official JPJ ownership-transfer and PUSPAKOM transfer-inspection links below. Confirm which steps apply to your vehicle." }
      ],
      references: [
        { label: "JPJ voluntary ownership transfer guide", href: jpjOwnershipTransferUrl },
        { label: "PUSPAKOM transfer-of-ownership inspection", href: puspakomTransferInspectionUrl },
        { label: "Current replacement vehicles at YS Heng", href: "/vehicles" }
      ],
      primary: { label: "Contact the team", href: "/contact#contact" },
      secondary: { label: "Browse replacement cars", href: "/vehicles" }
    },
    zh: {
      title: "居銮汽车 Trade-in 指南 | YS HENG AUTOMOTIVE SDN BHD",
      description: "联络 YS HENG AUTOMOTIVE SDN BHD，了解在居銮购买二手车时如何讨论现有车辆 Trade-in。",
      kicker: "Trade-in 咨询",
      heading: "在居銮讨论车辆 trade-in",
      sectionHeading: "讨论 Trade-in 前应准备什么",
      answer: `${legalBusinessName} 接受买家询问现有车辆 trade-in。团队可先了解基本车辆资料，并说明检查及买车的下一步；车辆未评估前不会保证价值。`,
      sections: [
        { title: "提供准确资料", text: "准备品牌、车型、年份、注册资料、目前车况，以及相关车主或贷款资料。" },
        { title: "安排车辆评估", text: "准确讨论 trade-in 可能需要查看车辆。请联络居銮展厅安排下一步。" },
        { title: "一起比较完整交易", text: "决定前，应同时考虑替换车辆、trade-in 评估、贷款、转名与交车安排。" }
      ],
      faqs: [
        { question: "YS Heng 可以在线保证 trade-in 价值吗？", answer: "不可以。团队需要先评估车辆，才能讨论有意义的 trade-in 价值。" },
        { question: "在哪里查看车辆转名流程？", answer: "请使用下方 JPJ 车辆所有权转移及 PUSPAKOM 转名检验官方链接，并确认哪些步骤适用于你的车辆。" }
      ],
      references: [
        { label: "JPJ 自愿转移车辆所有权指南", href: jpjOwnershipTransferUrl },
        { label: "PUSPAKOM 车辆转名检验", href: puspakomTransferInspectionUrl },
        { label: "YS Heng 目前替换车源", href: "/vehicles" }
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

function guideBreadcrumbItems(path: LocalGuidePath, language: Language) {
  const copy = guideCopy[path][language];
  const ui = guideUiCopy[language];
  return [
    { name: ui.homeLabel, item: localizedUrl("/", language) },
    { name: copy.kicker, item: localizedUrl(path, language) }
  ];
}

export function localGuideStructuredData(path: LocalGuidePath, language: Language) {
  const copy = guideCopy[path][language];
  const ui = guideUiCopy[language];
  const pageUrl = localizedUrl(path, language);
  const inLanguage = language === "zh" ? "zh-Hans-MY" : "en-MY";
  const webPageId = `${pageUrl}#webpage`;
  const faqPageId = `${pageUrl}#faq`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": webPageId,
        name: copy.heading,
        description: copy.answer,
        url: pageUrl,
        inLanguage,
        dateModified: guideLastUpdated,
        about: { "@id": canonicalUrl("/#business") },
        mainEntity: { "@id": faqPageId },
        breadcrumb: { "@id": breadcrumbId }
      },
      {
        "@type": "FAQPage",
        "@id": faqPageId,
        name: ui.faqTitle,
        url: pageUrl,
        inLanguage,
        dateModified: guideLastUpdated,
        mainEntity: copy.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      },
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        name: ui.breadcrumbLabel,
        inLanguage,
        itemListElement: guideBreadcrumbItems(path, language).map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          ...item
        }))
      }
    ]
  };
}

export function LocalGuidePage({ path, language }: { path: LocalGuidePath; language: Language }) {
  const copy = guideCopy[path][language];
  const ui = guideUiCopy[language];
  const related = localGuidePaths.filter((entry) => entry !== path);
  const relatedTitle = language === "zh" ? "相关买车指南" : "Related buyer guides";
  const locationLabel = language === "zh" ? "居銮，柔佛" : "Kluang, Johor";
  const structuredData = localGuideStructuredData(path, language);

  return (
    <main className="atelierSubPage" lang={language === "zh" ? "zh-Hans-MY" : "en-MY"}>
      <PublicHeader language={language} active="vehicles" />

      <header className="atelierSubHero inventoryAtelierHero">
        <div className="atelierSubHeroInner">
          <nav className="atelierKicker" aria-label={ui.breadcrumbLabel}>
            <Link href={hrefWithLanguage("/", language)}>{ui.homeLabel}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{copy.kicker}</span>
          </nav>
          <p className="atelierKicker">{copy.kicker}</p>
          <h1>{copy.heading}</h1>
          <p>{copy.answer}</p>
          <p className="atelierKicker">{ui.lastUpdatedLabel}: <time dateTime={guideLastUpdated}>{guideLastUpdated}</time></p>
          <div className="contactQuickActions">
            <Link className="primaryAction" href={hrefWithLanguage(copy.primary.href, language)}>{copy.primary.label} <ArrowRight size={16} /></Link>
            <Link className="secondaryAction" href={hrefWithLanguage(copy.secondary.href, language)}>{copy.secondary.label}</Link>
          </div>
        </div>
      </header>

      <section className="ecosystemSection" aria-label={copy.kicker}>
        <div className="centerHeading">
          <p className="atelierKicker"><MapPin size={15} /> {locationLabel}</p>
          <h2>{copy.sectionHeading}</h2>
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

      <section className="ecosystemSection" aria-labelledby="guide-faq-title">
        <div className="sectionHeading">
          <div>
            <p className="atelierKicker">{ui.faqKicker}</p>
            <h2 id="guide-faq-title">{ui.faqTitle}</h2>
          </div>
        </div>
        <div className="solutionGrid">
          {copy.faqs.map((faq) => (
            <article key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="featuredInventorySection" aria-labelledby="guide-references-title">
        <div className="sectionHeading">
          <div>
            <p className="atelierKicker">{ui.referencesKicker}</p>
            <h2 id="guide-references-title">{ui.referencesTitle}</h2>
          </div>
        </div>
        <div className="contactGrid">
          {copy.references.map((reference) => reference.href.startsWith("http") ? (
            <a className="contactCard" href={reference.href} target="_blank" rel="noreferrer" key={reference.href}>
              <h3>{reference.label}</h3>
              <span>{ui.openReferenceLabel} <ArrowRight size={14} /></span>
            </a>
          ) : (
            <Link className="contactCard" href={hrefWithLanguage(reference.href, language)} key={reference.href}>
              <h3>{reference.label}</h3>
              <span>{ui.openReferenceLabel} <ArrowRight size={14} /></span>
            </Link>
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
