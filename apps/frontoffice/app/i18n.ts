export type Language = "en" | "zh";

export type SearchParams = Record<string, string | string[] | undefined>;

export const languages: Record<Language, { label: string; shortLabel: string }> = {
  en: { label: "English", shortLabel: "EN" },
  zh: { label: "中文", shortLabel: "中" }
};

export function languageFromSearchParams(params?: SearchParams): Language {
  const value = Array.isArray(params?.lang) ? params?.lang[0] : params?.lang;
  return value === "zh" ? "zh" : "en";
}

export function hrefWithLanguage(path: string, language: Language) {
  const [pathAndQuery, hash] = path.split("#");
  const [basePath, query] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  if (language === "zh") params.set("lang", "zh");
  else params.delete("lang");
  const search = params.toString();
  return `${basePath}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

export function languageSwitchHref(pathname: string | null, search: string, language: Language, hash = "") {
  const params = new URLSearchParams(search);
  if (language === "zh") params.set("lang", "zh");
  else params.delete("lang");
  const query = params.toString();
  return `${pathname ?? "/"}${query ? `?${query}` : ""}${hash}`;
}

export const frontofficeCopy = {
  en: {
    nav: {
      home: "Home",
      buyCar: "Buy Car",
      services: "Services",
      workshop: "Location",
      contact: "Contact",
      searchPlaceholder: "Search used cars...",
      mobileCars: "Cars",
      mobileSell: "Sell",
      mobileFinance: "Finance",
      mobileProfile: "Contact"
    },
    footer: {
      description: "Second-hand car sales, loan assistance, trade-in discussion, and handover support in Malaysia.",
      quickLinks: "Quick Links",
      quickItems: [
        { label: "Used Cars Under 30k", href: "/vehicles?maxPrice=30000" },
        { label: "Sell Your Car", href: "/contact#contact" },
        { label: "Loan Help", href: "/contact#services" }
      ],
      services: "Services",
      serviceItems: [
        { label: "Loan Assistance", href: "/contact#services" },
        { label: "Trade-in", href: "/contact#services" },
        { label: "Insurance", href: "/contact#services" },
        { label: "JPJ & Puspakom", href: "/contact#services" },
        { label: "Workshop Support", href: "/contact#workshop" }
      ],
      company: "Company",
      companyItems: [
        { label: "Showroom", href: "/contact#workshop" },
        { label: "Facebook Page", href: "https://www.facebook.com/p/Ys-Heng-Automotive-Sdn-Bhd-100065128765841/" },
        { label: "TikTok Feature", href: "https://www.tiktok.com/@ifyandyfaathir/video/7637074774526577940" },
        { label: "Contact Us", href: "/contact#contact" }
      ]
    },
    vehicleCard: {
      readyStock: "Ready stock",
      sellingPrice: "Selling price",
      viewDetails: "View details",
      viewAria: "View"
    },
    home: {
      kicker: "Malaysia Used Car Dealer",
      titleLineOne: "Compare clear prices.",
      titleAccent: "Find your car.",
      heroIntro: "Ready-to-view used cars with clear pricing at YS Heng Auto in Kluang.",
      browseCars: "Browse cars",
      heroLocation: "Kluang, Johor",
      make: "Make",
      anyBrand: "Any Make",
      model: "Model",
      anyModel: "Any Model",
      modelPlaceholder: "e.g. Alphard",
      budget: "Budget",
      anyBudget: "Any Budget",
      priceFrom: "Price From",
      priceTo: "Price To",
      minPrice: "Min RM",
      maxPrice: "Max RM",
      yearFrom: "Year From",
      anyYear: "Any Year",
      find: "Find cars",
      readyCars: "ready cars",
      updatedDaily: "Updated daily",
      searchHint: "Choose a price card or refine the search.",
      popularMakes: "Popular Makes in Malaysia",
      shopKicker: "Shop by Need",
      shopTitle: "Find the right second-hand car",
      supportKicker: "Buyer Support",
      supportTitle: "Used-car help from search to handover",
      conciergeKicker: "After-Sales Help",
      conciergeTitle: "Practical services for Malaysian car buyers",
      conciergeText: "Buying a used car involves more than choosing a model. Our team can help with loan follow-up, trade-in discussion, viewing, insurance, transfer, and delivery.",
      buyerHelp: "Buyer Help",
      workshopKicker: "Showroom & Workshop Support",
      workshopTitle: "One location for viewing and handover support",
      workshopText: "Viewing, inspection follow-up, preparation, light repair coordination, body and paint follow-up, and handover readiness are coordinated through YS Heng Automotive in Kluang.",
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
        { region: "YS Heng Automotive", description: "Kluang showroom, viewing, preparation, and delivery coordination", pinLabel: "Kluang" }
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
      showingVehicles: "Showing {visible} of {total} cars",
      loadMore: "Load more cars",
      allLoaded: "All matching cars loaded",
      emptyKicker: "Search update",
      emptyTitle: "No vehicles match those filters",
      emptyText: "Clear a filter to see the full selection, or send us an enquiry and the team will help shortlist suitable cars.",
      emptyInventoryTitle: "No vehicles are available right now",
      emptyInventoryText: "Please check back shortly or message Sales for current availability.",
      activeFilters: "Current filters",
      clearFilters: "Clear all filters",
      invalidYear: "Enter a four-digit year between 1886 and next year's model year.",
      invalidPrice: "Enter a whole price of RM 1 or more.",
      invalidYearRange: "Year from cannot be later than year to.",
      invalidPriceRange: "Price from cannot be higher than price to.",
      unavailableTitle: "The showroom is temporarily unavailable",
      unavailableText: "Live vehicle inventory could not be loaded. Please try again shortly or message Sales for current availability.",
      contactSales: "Message Sales"
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
      helpKicker: "Services",
      helpTitle: "What the team helps with",
      helpText: "Use Services when you want help after finding a car: viewing, loan and trade-in discussion, preparation updates, documents, and handover.",
      tiles: ["Viewing appointment", "Loan & trade-in guidance", "Vehicle preparation updates", "Delivery handover"],
      workshopKicker: "Kluang Location",
      workshopTitle: "Visit the Kluang showroom",
      workshopText: "Use Location when you need the address, map, or directions to the YS Heng Automotive showroom for viewing, preparation follow-up, and handover.",
      workshopTiles: ["Showroom viewing", "Vehicle preparation", "JPJ & Puspakom steps", "Handover coordination"],
      salesIntro: "Nak jual atau beli kereta? Contact Ah Boon at 010-828 1218.",
      reviewSnippet: "Not yet rated (4 reviews)",
      callNow: "Call now",
      openMap: "Open map",
      facebook: "Facebook",
      formKicker: "Message YS Heng",
      formTitle: "Tell us how we can help.",
      formIntro: "Ask about buying, selling, trade-in, financing, viewing, or after-sales support. Sales will receive your enquiry in the portal.",
      formName: "Name",
      formPhone: "Phone",
      formMessage: "Message",
      formNamePlaceholder: "Your name",
      formMessagePlaceholder: "Tell us what you need help with...",
      formSubmitting: "Sending...",
      formSubmit: "Send message",
      formPrivacy: "Submitted only to YS Heng Automotive for sales follow-up.",
      formSuccess: "Received. Our sales team will follow up shortly.",
      formDefaultError: "Could not send your message. Please try again.",
      formErrors: {
        customer_name_required: "Name is required.",
        phone_required: "Phone is required.",
        message_required: "Message is required.",
        message_too_long: "Please keep your message to 2,000 characters or fewer.",
        submit_failed: "Could not send your message. Please try again.",
        validation_failed: "Could not send your message. Please check the form and try again."
      }
    }
  },
  zh: {
    nav: {
      home: "首页",
      buyCar: "买车",
      services: "服务",
      workshop: "地点",
      contact: "联络",
      searchPlaceholder: "搜寻二手车...",
      mobileCars: "车源",
      mobileSell: "卖车",
      mobileFinance: "贷款",
      mobileProfile: "\u8054\u7cfb"
    },
    footer: {
      description: "马来西亚二手车销售、贷款协助、Trade-in 咨询与交车跟进。",
      quickLinks: "快捷链接",
      quickItems: [
        { label: "RM30k 以下车源", href: "/vehicles?maxPrice=30000" },
        { label: "卖车咨询", href: "/contact#contact" },
        { label: "贷款协助", href: "/contact#services" }
      ],
      services: "服务",
      serviceItems: [
        { label: "贷款协助", href: "/contact#services" },
        { label: "Trade-in", href: "/contact#services" },
        { label: "保险", href: "/contact#services" },
        { label: "JPJ 与 Puspakom", href: "/contact#services" },
        { label: "维修厂支援", href: "/contact#workshop" }
      ],
      company: "公司",
      companyItems: [
        { label: "YS Heng 展厅", href: "/contact#workshop" },
        { label: "Facebook", href: "https://www.facebook.com/p/Ys-Heng-Automotive-Sdn-Bhd-100065128765841/" },
        { label: "TikTok 介绍", href: "https://www.tiktok.com/@ifyandyfaathir/video/7637074774526577940" },
        { label: "联络我们", href: "/contact#contact" }
      ]
    },
    vehicleCard: {
      readyStock: "现货车源",
      sellingPrice: "销售价",
      viewDetails: "查看详情",
      viewAria: "查看"
    },
    home: {
      kicker: "马来西亚二手车商",
      titleLineOne: "透明比价，",
      titleAccent: "找到你的车。",
      heroIntro: "YS Heng Auto 居銮现车，价格清楚，可直接预约看车。",
      browseCars: "浏览车源",
      heroLocation: "居銮，柔佛",
      make: "品牌",
      anyBrand: "任何品牌",
      model: "车型",
      anyModel: "任何车型",
      modelPlaceholder: "例如 Alphard",
      budget: "预算",
      anyBudget: "任何预算",
      priceFrom: "最低价",
      priceTo: "最高价",
      minPrice: "最低 RM",
      maxPrice: "最高 RM",
      yearFrom: "年份起",
      anyYear: "任何年份",
      find: "找车",
      readyCars: "辆可看车",
      updatedDaily: "每日更新",
      searchHint: "选择价格卡，或继续筛选车源。",
      popularMakes: "马来西亚热门品牌",
      shopKicker: "按需求选车",
      shopTitle: "找到适合你的二手车",
      supportKicker: "买家支援",
      supportTitle: "看车、贷款到交车，我们一路跟进",
      conciergeKicker: "售后协助",
      conciergeTitle: "为马来西亚买家准备的实用服务",
      conciergeText: "买二手车不只是选择车型。我们的团队可协助贷款跟进、Trade-in 咨询、看车安排、保险、转名与交车。",
      buyerHelp: "买家协助",
      workshopKicker: "展厅与维修支援",
      workshopTitle: "一个地点统筹看车与交车支援",
      workshopText: "看车、检查跟进、整备、钣喷跟进与交车准备都由居銮 YS Heng Automotive 统筹。",
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
        { region: "YS Heng Automotive", description: "居銮展厅、看车、整备与交车协调", pinLabel: "居銮" }
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
      showingVehicles: "已显示 {visible} / {total} 辆车",
      loadMore: "加载更多车辆",
      allLoaded: "已显示所有符合条件的车辆",
      emptyKicker: "搜寻结果",
      emptyTitle: "没有符合筛选的车辆",
      emptyText: "清除部分筛选以查看全部车源，或发送询问让团队协助筛选合适车辆。",
      emptyInventoryTitle: "目前没有可售车辆",
      emptyInventoryText: "请稍后再试，或直接联络销售团队查询现车。",
      activeFilters: "目前筛选条件",
      clearFilters: "清除所有筛选",
      invalidYear: "请输入 1886 至明年之间的四位年份。",
      invalidPrice: "请输入 RM 1 或以上的整数价格。",
      invalidYearRange: "年份起不能晚于年份至。",
      invalidPriceRange: "最低价不能高于最高价。",
      unavailableTitle: "展厅资料暂时无法显示",
      unavailableText: "暂时无法载入实时车源。请稍后再试，或直接留言向销售团队查询现车。",
      contactSales: "联络销售团队"
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
      title: "看车、贷款到交车，我们一路跟进。",
      intro: "想买车、卖车或 Trade-in？我们可协助安排看车、贷款咨询、车辆整备、保险与交车流程。",
      browse: "浏览车源",
      whatsapp: "WhatsApp 联络",
      showroom: "YS Heng 展厅",
      salesLine: "销售热线",
      email: "电邮",
      helpKicker: "服务",
      helpTitle: "团队可以协助的事项",
      helpText: "找到合适车辆后，可通过服务区了解看车、贷款与 Trade-in 咨询、整备更新、文件流程与交车安排。",
      tiles: ["看车预约", "贷款与 Trade-in 咨询", "车辆整备更新", "交车安排"],
      workshopKicker: "居銮地点",
      workshopTitle: "前往居銮展厅",
      workshopText: "地点区块提供 YS Heng Automotive 展厅地址、地图与导航，方便安排看车、整备跟进与交车。",
      workshopTiles: ["展厅看车", "车辆整备", "JPJ 与 Puspakom 流程", "交车协调"],
      salesIntro: "要买车、卖车或 Trade-in？请联系 Ah Boon：010-828 1218。",
      reviewSnippet: "\u5c1a\u672a\u8a55\u5206\uff084 \u689d\u8a55\u8a9e\uff09",
      callNow: "\u7acb\u5373\u81f4\u96fb",
      openMap: "\u6253\u958b\u5730\u5716",
      facebook: "Facebook",
      formKicker: "\u7559\u8a00\u7d66 YS Heng",
      formTitle: "\u544a\u8bc9\u6211\u4eec\u5982\u4f55\u534f\u52a9\u4f60\u3002",
      formIntro: "\u8d2d\u8f66\u3001\u5356\u8f66\u3001Trade-in\u3001\u8d37\u6b3e\u3001\u770b\u8f66\u6216\u552e\u540e\u95ee\u9898\u90fd\u53ef\u4ee5\u7559\u8a00\u3002\u9500\u552e\u56e2\u961f\u4f1a\u5728\u7cfb\u7edf\u5185\u8ddf\u8fdb\u3002",
      formName: "\u59d3\u540d",
      formPhone: "\u7535\u8bdd",
      formMessage: "\u7559\u8a00",
      formNamePlaceholder: "\u60a8\u7684\u59d3\u540d",
      formMessagePlaceholder: "\u8bf7\u544a\u8bc9\u6211\u4eec\u60a8\u9700\u8981\u4ec0\u4e48\u534f\u52a9...",
      formSubmitting: "\u6b63\u5728\u53d1\u9001...",
      formSubmit: "\u53d1\u9001\u7559\u8a00",
      formPrivacy: "\u4ec5\u63d0\u4ea4\u7ed9 YS Heng Automotive \u4f5c\u9500\u552e\u8ddf\u8fdb\u3002",
      formSuccess: "\u5df2\u6536\u5230\u3002\u9500\u552e\u56e2\u961f\u4f1a\u5c3d\u5feb\u4e0e\u60a8\u8054\u7cfb\u3002",
      formDefaultError: "\u65e0\u6cd5\u53d1\u9001\u7559\u8a00\u3002\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",
      formErrors: {
        customer_name_required: "\u8bf7\u586b\u5199\u59d3\u540d\u3002",
        phone_required: "\u8bf7\u586b\u5199\u7535\u8bdd\u3002",
        message_required: "\u8bf7\u586b\u5199\u7559\u8a00\u3002",
        message_too_long: "\u8bf7\u5c06\u7559\u8a00\u63a7\u5236\u5728 2,000 \u5b57\u4ee5\u5185\u3002",
        submit_failed: "\u65e0\u6cd5\u53d1\u9001\u7559\u8a00\u3002\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",
        validation_failed: "\u8bf7\u68c0\u67e5\u7559\u8a00\u5185\u5bb9\u540e\u518d\u8bd5\u3002"
      }
    }
  }
} as const;
