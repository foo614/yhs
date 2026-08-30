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
      description: "YS HENG AUTOMOTIVE SDN BHD lists used cars and handles buyer enquiries from Kluang, Johor, Malaysia.",
      quickLinks: "Quick Links",
      quickItems: [
        { label: "Used Cars in Kluang", href: "/used-cars-kluang" },
        { label: "Car Loan Guide for Kluang", href: "/car-loan-kluang" },
        { label: "Trade-In Car Guide for Kluang", href: "/trade-in-car-kluang" },
        { label: "Used Cars Under RM30,000", href: "/vehicles?maxPrice=30000" }
      ],
      services: "Services",
      serviceItems: [
        { label: "Available Inventory", href: "/vehicles" },
        { label: "Viewing Details", href: "/contact#contact" },
        { label: "Loan Process", href: "/car-loan-kluang" },
        { label: "Trade-In Process", href: "/trade-in-car-kluang" },
        { label: "Showroom Location", href: "/contact#workshop" }
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
      sellingPrice: "Selling price",
      viewDetails: "View details",
      viewAria: "View"
    },
    home: {
      kicker: "Used Car Dealer in Kluang",
      titleLineOne: "Compare clear prices.",
      titleAccent: "Find your car.",
      heroIntro: "YS HENG AUTOMOTIVE SDN BHD is a used-car dealership in Kluang, Johor, Malaysia, where buyers can browse currently available vehicles with published prices and confirm viewing details.",
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
      readyCars: "available cars",
      updatedDaily: "Current available inventory",
      searchHint: "Choose a price card or refine the search.",
      popularMakes: "Popular Makes in Malaysia",
      shopKicker: "Shop by Need",
      shopTitle: "Find the right second-hand car",
      supportKicker: "Buyer Support",
      supportTitle: "Used-car help from search to handover",
      conciergeKicker: "Buyer Process",
      conciergeTitle: "Practical next steps for used-car buyers",
      conciergeText: "After comparing the published inventory, buyers can ask the team about a specific vehicle, arrange viewing details, discuss a trade-in, and understand the loan enquiry process.",
      buyerHelp: "Buyer Help",
      workshopKicker: "Kluang Showroom",
      workshopTitle: "One location for viewing and handover support",
      workshopText: "Contact the team to confirm a vehicle, viewing appointment, preparation update, or handover detail at the Kluang showroom.",
      whyKicker: "Check Before You Enquire",
      whyTitle: "Information buyers can verify",
      evidenceKicker: "Evidence, not ratings",
      evidenceTitle: "What you can verify on this site",
      evidenceIntro: "Use the public information below as a starting point, then confirm vehicle-specific details with the team.",
      evidenceAction: "Check current inventory",
      evidenceItems: [
        { title: "Current available inventory", text: "Browse vehicle records currently published as Available on the public inventory page." },
        { title: "Published selling prices", text: "Each available listing displays its published selling price for direct comparison." },
        { title: "Viewing details", text: "Confirm the vehicle and your preferred viewing time with the team before travelling." },
        { title: "Formal lender terms", text: "Loan estimates and assistance are not an approval; the lender's formal offer determines eligibility, rate, repayments, and final terms." }
      ],
      categories: [
        { title: "Under RM30k", label: "Budget Friendly", query: "under 30000" },
        { title: "MPVs", label: "Family & Business", query: "MPV" },
        { title: "SUVs", label: "Daily & Weekend", query: "SUV" },
        { title: "4x4s", label: "Work & Adventure", query: "4x4" }
      ],
      solutions: [
        { title: "Loan Assistance", text: "Buyers can ask about the loan process, estimates, and documents; approval and final terms come from the lender." },
        { title: "Vehicle Questions", text: "Ask whether a specific vehicle has been inspected or prepared, and confirm its current details before viewing or handover." },
        { title: "Handover Information", text: "Ask the team about the documents and handover steps linked to a specific purchase." }
      ],
      conciergeItems: ["Current Vehicle Listings", "Trade-in Discussion", "Viewing Arrangements", "Loan Process Guidance"],
      workshopBranches: [
        { region: "YS HENG AUTOMOTIVE SDN BHD", description: "Kluang showroom for confirmed viewing and handover details", pinLabel: "Kluang" }
      ],
      trustRows: [
        { title: "Available Vehicle Records", text: "The public inventory is limited to vehicle records marked Available." },
        { title: "Published Selling Prices", text: "Available listings show their selling price so buyers can compare before enquiring." },
        { title: "Confirm Before Travelling", text: "Contact the team to confirm the vehicle and viewing details before visiting the showroom." }
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
      intro: "Used-car listing with a published price and an enquiry form for confirming current details.",
      lead: "Review the published vehicle details, then contact the team to confirm availability and viewing information.",
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
      intro: "Contact the team to ask about current inventory, confirm viewing details, and discuss a loan, trade-in, or the next steps for a specific purchase.",
      browse: "Browse cars",
      whatsapp: "WhatsApp us",
      showroom: "YS Heng showroom",
      salesLine: "Sales line",
      email: "Email",
      helpKicker: "Services",
      helpTitle: "What the team helps with",
      helpText: "Use Services to ask about a specific available vehicle, confirm viewing details, discuss loan or trade-in enquiries, and clarify documents or handover steps.",
      tiles: ["Available vehicle enquiry", "Confirm viewing details", "Loan & trade-in questions", "Purchase & handover questions"],
      workshopKicker: "Kluang Location",
      workshopTitle: "Visit the Kluang showroom",
      workshopText: "Use Location for the verified showroom address, map, and directions. Contact the team before travelling to confirm the vehicle and appointment details.",
      workshopTiles: ["Showroom address", "Map and directions", "Confirm vehicle availability", "Confirm appointment details"],
      salesIntro: "Nak jual atau beli kereta? Contact Ah Boon at 010-828 1218.",
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
      description: "YS HENG AUTOMOTIVE SDN BHD 位于马来西亚柔佛州居銮（Kluang, Johor, Malaysia），网站提供当前可售二手车资料与咨询联络。",
      quickLinks: "快捷链接",
      quickItems: [
        { label: "居銮二手车指南", href: "/used-cars-kluang" },
        { label: "居銮汽车贷款指南", href: "/car-loan-kluang" },
        { label: "居銮旧车 Trade-in 指南", href: "/trade-in-car-kluang" },
        { label: "RM30,000 以下可售车源", href: "/vehicles?maxPrice=30000" }
      ],
      services: "服务",
      serviceItems: [
        { label: "目前可售车源", href: "/vehicles" },
        { label: "确认看车详情", href: "/contact#contact" },
        { label: "贷款流程", href: "/car-loan-kluang" },
        { label: "Trade-in 流程", href: "/trade-in-car-kluang" },
        { label: "展厅地点", href: "/contact#workshop" }
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
      sellingPrice: "销售价",
      viewDetails: "查看详情",
      viewAria: "查看"
    },
    home: {
      kicker: "居銮二手车商",
      titleLineOne: "透明比价，",
      titleAccent: "找到你的车。",
      heroIntro: "YS HENG AUTOMOTIVE SDN BHD 是一家位于马来西亚柔佛州居銮（Kluang, Johor, Malaysia）的二手车经销商；买家可浏览目前可售并标明售价的车源，并确认看车详情。",
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
      readyCars: "个可询问车源",
      updatedDaily: "目前可售车源",
      searchHint: "选择价格卡，或继续筛选车源。",
      popularMakes: "马来西亚热门品牌",
      shopKicker: "按需求选车",
      shopTitle: "找到适合你的二手车",
      supportKicker: "买家支援",
      supportTitle: "看车、贷款到交车，我们一路跟进",
      conciergeKicker: "购车流程",
      conciergeTitle: "二手车买家的实用下一步",
      conciergeText: "比较网站上已发布的车源后，买家可向团队询问指定车辆、确认看车详情、讨论 Trade-in，并了解贷款咨询流程。",
      buyerHelp: "买家协助",
      workshopKicker: "居銮展厅",
      workshopTitle: "一个地点统筹看车与交车支援",
      workshopText: "如需确认指定车辆、看车预约、整备进度或交车详情，请先联络居銮展厅团队。",
      whyKicker: "咨询前先核对",
      whyTitle: "买家可核对的资料",
      evidenceKicker: "以资料为准",
      evidenceTitle: "网站上可核对的资料",
      evidenceIntro: "先查看以下公开资料，再向团队确认指定车辆的细节。",
      evidenceAction: "查看目前可售车源",
      evidenceItems: [
        { title: "目前可售车源", text: "公开车源页面显示目前标记为 Available 的车辆记录。" },
        { title: "已发布销售价", text: "每个可售车辆页面都会显示该车辆已发布的销售价，方便直接比较。" },
        { title: "看车详情", text: "出发前，请先向团队确认车辆及你希望的看车时间。" },
        { title: "贷款机构正式条款", text: "贷款估算与协助不等于获批；资格、利率、还款额与最终条款以贷款机构的正式文件为准。" }
      ],
      categories: [
        { title: "RM30k 以下", label: "预算友好", query: "under 30000" },
        { title: "MPV", label: "家庭与商务", query: "MPV" },
        { title: "SUV", label: "日常与周末", query: "SUV" },
        { title: "4x4", label: "工作与户外", query: "4x4" }
      ],
      solutions: [
        { title: "贷款协助", text: "买家可咨询贷款流程、估算与所需文件；是否获批及最终条款由贷款机构决定。" },
        { title: "车辆问题", text: "可询问指定车辆是否已检查或整备，并在看车或交车前确认目前详情。" },
        { title: "交车资料", text: "可向团队了解指定交易所需的文件与交车步骤。" }
      ],
      conciergeItems: ["目前可售车源", "Trade-in 咨询", "确认看车安排", "贷款流程说明"],
      workshopBranches: [
        { region: "YS HENG AUTOMOTIVE SDN BHD", description: "居銮展厅，可先确认看车与交车详情", pinLabel: "居銮" }
      ],
      trustRows: [
        { title: "可售车辆记录", text: "公开车源只显示标记为 Available 的车辆记录。" },
        { title: "已发布销售价", text: "可售车源显示销售价，让买家在咨询前先作比较。" },
        { title: "出发前先确认", text: "前往展厅前，请先联络团队确认车辆与看车详情。" }
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
      intro: "此二手车页面提供已发布售价与询问表格，方便买家确认目前详情。",
      lead: "先查看已发布的车辆资料，再联络团队确认车源与看车详情。",
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
      intro: "联络团队查询目前可售车源、确认看车详情，并咨询贷款、Trade-in 或指定交易的下一步。",
      browse: "浏览车源",
      whatsapp: "WhatsApp 联络",
      showroom: "YS Heng 展厅",
      salesLine: "销售热线",
      email: "电邮",
      helpKicker: "服务",
      helpTitle: "团队可以协助的事项",
      helpText: "可查询指定可售车辆、确认看车详情、提出贷款或 Trade-in 问题，并了解文件或交车步骤。",
      tiles: ["查询可售车辆", "确认看车详情", "贷款与 Trade-in 问题", "购车与交车问题"],
      workshopKicker: "居銮地点",
      workshopTitle: "前往居銮展厅",
      workshopText: "地点区块提供已核实的展厅地址、地图与导航。出发前，请先联络团队确认车辆与预约详情。",
      workshopTiles: ["展厅地址", "地图与导航", "确认车辆是否可售", "确认预约详情"],
      salesIntro: "要买车、卖车或 Trade-in？请联系 Ah Boon：010-828 1218。",
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
