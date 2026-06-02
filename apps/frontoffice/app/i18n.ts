export type Language = "en" | "zh";

type SearchParams = Record<string, string | string[] | undefined>;

export const languages: Record<Language, { label: string; shortLabel: string }> = {
  en: { label: "English", shortLabel: "EN" },
  zh: { label: "中文", shortLabel: "中" }
};

export function languageFromSearchParams(params?: SearchParams): Language {
  const value = Array.isArray(params?.lang) ? params?.lang[0] : params?.lang;
  return value === "zh" ? "zh" : "en";
}

export function languageQuery(language: Language) {
  return language === "zh" ? "?lang=zh" : "";
}

export function hrefWithLanguage(path: string, language: Language) {
  const [basePath, hash] = path.split("#");
  return `${basePath}${languageQuery(language)}${hash ? `#${hash}` : ""}`;
}

export const frontofficeCopy = {
  en: {
    nav: {
      home: "Home",
      buyCar: "Buy Car",
      services: "Services",
      workshop: "Panel Workshop",
      contact: "Contact",
      searchPlaceholder: "Search used cars...",
      mobileCars: "Cars",
      mobileSell: "Sell",
      mobileFinance: "Finance",
      mobileProfile: "Profile"
    },
    footer: {
      description: "Second-hand car sales, loan assistance, trade-in discussion, and handover support in Malaysia.",
      quickLinks: "Quick Links",
      quickItems: ["Used Cars Under 30k", "New Arrivals", "Sell Your Car", "Popular Cars", "Loan Help"],
      services: "Services",
      serviceItems: ["Loan Assistance", "Trade-in", "Insurance", "JPJ & Puspakom", "Workshop Support"],
      company: "Company",
      companyItems: ["About Us", "Our Showrooms", "Panel Workshops", "Facebook Page", "Contact Us"],
      support: "Support",
      supportItems: ["Privacy Policy", "Terms of Service", "Buying Guide", "FAQ", "Loan Calculator"]
    },
    vehicleCard: {
      readyStock: "Ready stock",
      sellingPrice: "Selling price",
      viewDetails: "View details",
      viewAria: "View"
    },
    home: {
      kicker: "Malaysia Used Car Dealer",
      titleLineOne: "Find Your Next",
      titleAccent: "Used Car",
      make: "Make",
      anyBrand: "Any Brand",
      model: "Model",
      modelPlaceholder: "e.g. Alphard",
      priceFrom: "Price From",
      priceTo: "Price To",
      minPrice: "Min RM",
      maxPrice: "Max RM",
      yearFrom: "Year From",
      find: "Find",
      popularMakes: "Popular Makes in Malaysia",
      shopKicker: "Shop by Need",
      shopTitle: "Find the right second-hand car",
      supportKicker: "Buyer Support",
      supportTitle: "Used-car help from search to handover",
      conciergeKicker: "After-Sales Help",
      conciergeTitle: "Practical services for Malaysian car buyers",
      conciergeText: "Buying a used car involves more than choosing a model. Our team can help with loan follow-up, trade-in discussion, viewing, insurance, transfer, and delivery.",
      buyerHelp: "Buyer Help",
      workshopKicker: "Panel Workshop Support",
      workshopTitle: "Our Panel Workshop Coverage",
      workshopText: "We coordinate inspection, preparation, light repair, body and paint follow-up, and handover readiness through our workshop support network in Johor.",
      whyKicker: "Why Buy From Us",
      whyTitle: "Why Choose YS HENG AUTO?",
      reviews: "Customer Reviews",
      readReviews: "Read All 500+ Reviews",
      reviewOne: "Good service and fast reply. The team helped explain loan documents and viewing steps clearly.",
      reviewTwo: "Transparent pricing and easy to arrange viewing. The sales team followed up until handover.",
      reviewName: "Customer Review",
      categories: [
        { title: "Under RM30k", label: "Budget Friendly", query: "under 30000" },
        { title: "MPVs", label: "Family & Business", query: "MPV" },
        { title: "SUVs", label: "Daily & Weekend", query: "SUV" },
        { title: "4x4s", label: "Work & Adventure", query: "4x4" }
      ],
      solutions: [
        { title: "Loan Assistance", text: "We help buyers understand loan options, monthly estimates, documents, and approval steps." },
        { title: "Inspection & Preparation", text: "Vehicles can be checked, prepared, and followed up before viewing or delivery." },
        { title: "Transfer Support", text: "Guidance for insurance, JPJ, Puspakom, ownership transfer, and handover paperwork." }
      ],
      conciergeItems: ["Number Plate Bidding", "Trade-in Discussion", "JPJ & Puspakom", "Insurance Agency"],
      workshopBranches: [
        { region: "Kluang HQ", description: "Primary inspection, preparation, and delivery coordination", pinLabel: "Kluang HQ" },
        { region: "Johor Support", description: "Appointment-based workshop, body, and paint follow-up", pinLabel: "Johor Support" }
      ],
      trustRows: [
        { title: "Clear Vehicle Info", text: "We present the car, price, and next steps clearly so buyers can decide with confidence." },
        { title: "Fast Loan Follow-up", text: "Loan and viewing follow-up stays direct, responsive, and easy to understand." },
        { title: "Handover Support", text: "The team can guide document, insurance, transfer, and delivery steps after booking." }
      ]
    },
    inventory: {
      backHome: "Home",
      kicker: "Used Car Inventory",
      title: "Browse available second-hand cars.",
      intro: "Filter by make, model, year, and price. Every listing can be followed up for viewing, loan help, and handover steps.",
      availableVehicles: "available vehicles",
      searchEnabled: "Used car search enabled",
      filterTitle: "Find your next car",
      countOf: "of",
      vehicles: "vehicles",
      search: "Search",
      searchPlaceholder: "Make, model, plate",
      make: "Make",
      anyMake: "Any make",
      yearFrom: "Year from",
      yearTo: "Year to",
      priceFrom: "Price from",
      priceTo: "Price to",
      stockOwner: "Stock owner",
      allStock: "All stock",
      sort: "Sort",
      newestFirst: "Newest first",
      priceLow: "Price low to high",
      priceHigh: "Price high to low",
      emptyTitle: "No vehicles match those filters",
      emptyText: "Adjust the search or send us an enquiry and the team will help shortlist suitable cars."
    },
    detail: {
      back: "Back to showroom",
      kicker: "Used Car Details",
      intro: "Ready-to-view second-hand car with enquiry, loan assistance, and delivery follow-up handled by YS Heng Auto.",
      lead: "A used-car listing prepared for viewing, ownership checks, and financing guidance.",
      sellingPrice: "Selling price",
      loanTitle: "Loan assistance available",
      loanText: "Estimated from RM {amount} / month, subject to approval and final bank terms.",
      enquire: "Enquire now",
      nextTitle: "What happens next",
      nextText: "Sales follows up, confirms viewing, and guides loan, document, payment, insurance, transfer, and delivery steps.",
      highlights: "Vehicle highlights",
      make: "Make",
      model: "Model",
      plate: "Plate",
      similarKicker: "Similar choices",
      similarTitle: "Other cars to compare",
      viewAll: "View all"
    },
    leadForm: {
      title: "Enquire",
      name: "Name",
      phone: "Phone",
      message: "Message",
      namePlaceholder: "Your name",
      messagePlaceholder: "Loan, trade-in, viewing time...",
      sending: "Sending...",
      send: "Send enquiry",
      success: "Received. Our team will follow up from the portal.",
      defaultError: "Could not send enquiry. Please try again.",
      errors: {
        vehicle_required: "Vehicle is required.",
        customer_name_required: "Name is required.",
        phone_required: "Phone is required.",
        submit_failed: "Could not send enquiry. Please try again.",
        validation_failed: "Could not send enquiry. Please check the form and try again."
      }
    },
    contact: {
      kicker: "Services & Contact",
      title: "Used-car support from viewing to handover.",
      intro: "Reach the team for viewing, loan help, trade-in discussion, workshop preparation, insurance, and delivery support.",
      browse: "Browse cars",
      whatsapp: "WhatsApp us",
      showroom: "YS Heng showroom",
      salesLine: "Sales line",
      email: "Email",
      helpKicker: "How we help",
      helpTitle: "From shortlist to handover",
      helpText: "Every enquiry can become a guided used-car sales, loan, document, payment, insurance, and delivery journey.",
      tiles: ["Vehicle viewing", "Financing guidance", "Preparation tracking", "Release readiness"],
      workshopKicker: "Panel Workshop",
      workshopTitle: "Inspection, preparation and handover follow-up",
      workshopText: "Panel workshop support is coordinated from Kluang for vehicle checking, preparation, body and paint follow-up, JPJ or Puspakom steps, and delivery readiness.",
      workshopTiles: ["Pre-delivery inspection", "JPJ & Puspakom", "Body and paint follow-up", "Handover coordination"],
      salesIntro: "Nak jual atau beli kereta? Contact Ah Boon at 010-828 1218.",
      reviewSnippet: "Not yet rated (4 reviews)",
      callNow: "Call now",
      openMap: "Open map",
      facebook: "Facebook"
    }
  },
  zh: {
    nav: {
      home: "首页",
      buyCar: "买车",
      services: "服务",
      workshop: "合作维修厂",
      contact: "联络",
      searchPlaceholder: "搜寻二手车...",
      mobileCars: "车源",
      mobileSell: "卖车",
      mobileFinance: "贷款",
      mobileProfile: "我的"
    },
    footer: {
      description: "马来西亚二手车销售、贷款协助、Trade-in 咨询与交车跟进。",
      quickLinks: "快捷链接",
      quickItems: ["RM30k 以下车源", "最新车源", "卖车咨询", "热门车型", "贷款协助"],
      services: "服务",
      serviceItems: ["贷款协助", "Trade-in", "保险", "JPJ 与 Puspakom", "维修厂支援"],
      company: "公司",
      companyItems: ["关于我们", "展厅", "合作维修厂", "Facebook", "联络我们"],
      support: "支援",
      supportItems: ["隐私政策", "服务条款", "买车指南", "常见问题", "贷款计算"]
    },
    vehicleCard: {
      readyStock: "现货车源",
      sellingPrice: "销售价",
      viewDetails: "查看详情",
      viewAria: "查看"
    },
    home: {
      kicker: "马来西亚二手车商",
      titleLineOne: "寻找你的下一辆",
      titleAccent: "二手车",
      make: "品牌",
      anyBrand: "任何品牌",
      model: "车型",
      modelPlaceholder: "例如 Alphard",
      priceFrom: "最低价",
      priceTo: "最高价",
      minPrice: "最低 RM",
      maxPrice: "最高 RM",
      yearFrom: "年份起",
      find: "搜寻",
      popularMakes: "马来西亚热门品牌",
      shopKicker: "按需求选车",
      shopTitle: "找到适合你的二手车",
      supportKicker: "买家支援",
      supportTitle: "从看车到交车的二手车协助",
      conciergeKicker: "售后协助",
      conciergeTitle: "为马来西亚买家准备的实用服务",
      conciergeText: "买二手车不只是选择车型。我们的团队可协助贷款跟进、Trade-in 咨询、看车安排、保险、转名与交车。",
      buyerHelp: "买家协助",
      workshopKicker: "维修厂网络",
      workshopTitle: "合作维修厂",
      workshopText: "我们配合维修伙伴处理检查、整备、保养、钣喷与维修支援。",
      whyKicker: "为什么选择我们",
      whyTitle: "为什么选择 YS HENG AUTO？",
      reviews: "客户评价",
      readReviews: "查看 500+ 评价",
      reviewOne: "服务好，回复快。团队清楚解释贷款文件与看车流程。",
      reviewTwo: "价格透明，看车安排方便。销售团队一路跟进到交车。",
      reviewName: "客户评价",
      categories: [
        { title: "RM30k 以下", label: "预算友好", query: "under 30000" },
        { title: "MPV", label: "家庭与商务", query: "MPV" },
        { title: "SUV", label: "日常与周末", query: "SUV" },
        { title: "4x4", label: "工作与户外", query: "4x4" }
      ],
      solutions: [
        { title: "贷款协助", text: "协助买家了解贷款选择、月供估算、文件与审批流程。" },
        { title: "检查与整备", text: "车辆可在看车或交车前安排检查、整备与跟进。" },
        { title: "转名支援", text: "协助保险、JPJ、Puspakom、车主转名与交车文件。" }
      ],
      conciergeItems: ["车牌竞标", "Trade-in 咨询", "JPJ 与 Puspakom", "保险代理"],
      workshopBranches: [
        { region: "柔佛（总部）", description: "居銮与新山维修支援", pinLabel: "居銮总部" },
        { region: "吉隆坡", description: "中马检查与保养支援", pinLabel: "KL 合作点" }
      ],
      trustRows: [
        { title: "清楚车况资料", text: "清楚呈现车辆、价格与下一步，让买家更安心决定。" },
        { title: "快速贷款跟进", text: "贷款与看车跟进直接、快速，并保持容易理解。" },
        { title: "交车支援", text: "团队可协助文件、保险、转名与交车步骤。" }
      ]
    },
    inventory: {
      backHome: "返回首页",
      kicker: "二手车库存",
      title: "浏览可售二手车。",
      intro: "可按品牌、车型、年份与价格筛选。每辆车都可安排看车、贷款协助与交车跟进。",
      availableVehicles: "辆可售车辆",
      searchEnabled: "二手车搜寻已启用",
      filterTitle: "寻找你的下一辆车",
      countOf: "/",
      vehicles: "辆车",
      search: "搜寻",
      searchPlaceholder: "品牌、车型、车牌",
      make: "品牌",
      anyMake: "任何品牌",
      yearFrom: "年份起",
      yearTo: "年份至",
      priceFrom: "最低价",
      priceTo: "最高价",
      stockOwner: "库存归属",
      allStock: "全部库存",
      sort: "排序",
      newestFirst: "年份最新",
      priceLow: "价格低至高",
      priceHigh: "价格高至低",
      emptyTitle: "没有符合筛选的车辆",
      emptyText: "调整搜寻条件，或发送询问让团队协助筛选合适车源。"
    },
    detail: {
      back: "返回车源",
      kicker: "二手车详情",
      intro: "可安排看车的二手车，询问、贷款协助与交车跟进由 YS Heng Auto 团队处理。",
      lead: "此二手车资料已准备好供看车、车主资料检查与贷款咨询。",
      sellingPrice: "销售价",
      loanTitle: "可协助贷款",
      loanText: "估算每月 RM {amount} 起，须以银行审批与最终条款为准。",
      enquire: "立即询问",
      nextTitle: "接下来流程",
      nextText: "销售会跟进、确认看车，并引导贷款、文件、付款、保险、转名与交车步骤。",
      highlights: "车辆重点",
      make: "品牌",
      model: "车型",
      plate: "车牌",
      similarKicker: "相似选择",
      similarTitle: "可比较的其他车源",
      viewAll: "查看全部"
    },
    leadForm: {
      title: "询问车辆",
      name: "姓名",
      phone: "电话",
      message: "留言",
      namePlaceholder: "你的姓名",
      messagePlaceholder: "贷款、Trade-in、看车时间...",
      sending: "发送中...",
      send: "发送询问",
      success: "已收到。团队会在系统中跟进。",
      defaultError: "无法发送询问，请再试一次。",
      errors: {
        vehicle_required: "请选择车辆。",
        customer_name_required: "请输入姓名。",
        phone_required: "请输入电话。",
        submit_failed: "无法发送询问，请再试一次。",
        validation_failed: "无法发送询问，请检查表格后再试。"
      }
    },
    contact: {
      kicker: "服务与联络",
      title: "从看车到交车的二手车支援。",
      intro: "联络团队安排看车、贷款协助、Trade-in 咨询、车辆整备、保险与交车支援。",
      browse: "浏览车源",
      whatsapp: "WhatsApp 联络",
      showroom: "YS Heng 展厅",
      salesLine: "销售热线",
      email: "电邮",
      helpKicker: "我们如何协助",
      helpTitle: "从筛选到交车",
      helpText: "每个询问都可以进入清楚的二手车销售、贷款、文件、付款、保险与交车流程。",
      tiles: ["看车安排", "贷款咨询", "整备跟进", "交车准备"],
      workshopKicker: "合作维修厂",
      workshopTitle: "检查、整备与交车前跟进",
      workshopText: "合作维修支援由居朗统筹管理，含车检、整备、车身与油漆跟进、JPJ/Puspakom 流程及交车准备。",
      workshopTiles: ["\u9884\u68c0\u9a8c", "JPJ \u8207 Puspakom", "\u8f66\u8eab/\u6cb9\u6d46\u8ddf\u9032", "\u4ea4\u8eca\u65bd\u7b56"],
      salesIntro: "\u8981\u8ce3\u6216\u8cb7\u8eca\u55ce\uff1f\u8acb\u9023\u7d61 Ah Boon\uff1a010-828 1218\u3002",
      reviewSnippet: "\u5c1a\u672a\u8a55\u5206\uff084 \u689d\u8a55\u8a9e\uff09",
      callNow: "\u7acb\u5373\u81f4\u96fb",
      openMap: "\u6253\u958b\u5730\u5716",
      facebook: "Facebook"
    }
  }
} as const;
