export const faqLanguages = [
  { code: "ms", label: "Bahasa Melayu" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" }
] as const;

export type FaqLanguage = (typeof faqLanguages)[number]["code"];
type FaqCopy = {
  title: string;
  welcome: string;
  close: string;
  changeLanguage: string;
  back: string;
  browse: string;
  enquiry: string;
  contact: string;
  whatsappTopic: string;
  whatsappLanguage: string;
  whatsappNotice: string;
  questions: readonly {
    question: string;
    answer: string;
    guide?: { href: "/car-loan-kluang" | "/trade-in-car-kluang"; label: string };
  }[];
};

// Keep these answers aligned with the public buyer guides and confirmed sales information.
export const buyerFaq: Record<FaqLanguage, FaqCopy> = {
  ms: {
    title: "Panduan membeli kereta",
    welcome: "Selamat datang! Pilih soalan untuk panduan ringkas. Sahkan butiran kereta pilihan anda dengan pasukan jualan.",
    close: "Tutup panduan",
    changeLanguage: "Tukar bahasa",
    back: "Kembali ke soalan",
    browse: "Lihat kereta (Bahasa Inggeris)",
    enquiry: "Hantar pertanyaan di laman web (Bahasa Inggeris)",
    contact: "Hubungi jualan di WhatsApp",
    whatsappTopic: "Topik",
    whatsappLanguage: "Bahasa",
    whatsappNotice: "WhatsApp ialah perkhidmatan luar. Jangan hantar kad pengenalan, penyata bank atau dokumen kewangan sehingga jualan mengesahkan saluran yang sesuai.",
    questions: [
      { question: "Kereta apa yang sesuai dengan bajet saya?", answer: "Lihat stok semasa dan gunakan penapis harga di halaman kereta. Anda juga boleh beritahu pasukan jualan bajet dan model pilihan anda melalui WhatsApp. Pilihan bergantung pada stok semasa; sahkan harga dan ketersediaan dengan jualan." },
      { question: "Bolehkah saya memohon pinjaman kereta?", answer: "Tanya pasukan jualan tentang urusan pembiayaan untuk kereta pilihan anda. Jumlah pinjaman, kadar dan tempoh bergantung pada profil pemohon serta penilaian dan kelulusan bank. Anggaran bukan tawaran atau jaminan kelulusan.", guide: { href: "/car-loan-kluang", label: "Baca panduan pinjaman kereta (Bahasa Inggeris)" } },
      { question: "Apakah dokumen untuk permohonan pinjaman?", answer: "Secara umum, bank mungkin meminta dokumen pengenalan, bukti pendapatan dan penyata bank. Keperluan pekerja bergaji dan bekerja sendiri boleh berbeza. Sahkan senarai terkini dengan jualan sebelum menyediakan dokumen; jangan hantar dokumen peribadi melalui panduan ini.", guide: { href: "/car-loan-kluang", label: "Baca panduan pinjaman kereta (Bahasa Inggeris)" } },
      { question: "Bolehkah saya tukar beli kereta lama?", answer: "Hubungi jualan untuk membincangkan tukar beli. Berikan jenama, model, tahun, perbatuan dan gambar kereta melalui saluran jualan. Sebarang penerimaan dan nilai akhir perlu disahkan selepas pemeriksaan kereta; tiada nilai dijamin dalam talian.", guide: { href: "/trade-in-car-kluang", label: "Baca panduan tukar beli (Bahasa Inggeris)" } },
      { question: "Bagaimana hendak melihat atau memandu uji kereta?", answer: "Hubungi jualan dengan kereta pilihan dan masa yang sesuai. Minta mereka mengesahkan stok, waktu lawatan dan sama ada pandu uji boleh diatur. Pertanyaan ini tidak membuat tempahan secara automatik; tunggu pengesahan sebelum datang." },
      { question: "Adakah waranti dan kos lain termasuk?", answer: "Tanya jualan sama ada kereta tersebut mempunyai waranti, serta skop, tempoh dan pengecualiannya. Minta sebut harga bertulis yang menyenaraikan harga kereta, insurans, fi tukar milik dan caj lain, dengan jelas apa yang termasuk atau berasingan. Jangan anggap semua kos atau waranti sudah termasuk." }
    ]
  },
  en: {
    title: "Car buying help",
    welcome: "Welcome! Choose a question for a quick guide. Confirm details for your chosen car with our sales team.",
    close: "Close buying help",
    changeLanguage: "Change language",
    back: "Back to questions",
    browse: "Browse cars",
    enquiry: "Send an enquiry on this website",
    contact: "Contact sales on WhatsApp",
    whatsappTopic: "Topic",
    whatsappLanguage: "Language",
    whatsappNotice: "WhatsApp is an external service. Do not send ID, bank statements or financial documents until sales confirms the appropriate channel.",
    questions: [
      { question: "Which cars fit my budget?", answer: "Browse current stock and use the price filters on the cars page. You can also tell sales your budget and preferred model on WhatsApp. Options depend on current stock; confirm price and availability with sales." },
      { question: "Can I apply for a car loan?", answer: "Ask sales about financing arrangements for your chosen car. Loan amount, rate and term depend on your applicant profile and the bank’s assessment and approval. An estimate is not an offer or a guarantee of approval.", guide: { href: "/car-loan-kluang", label: "Read the car loan guide" } },
      { question: "What documents might a loan need?", answer: "Generally, a bank may ask for identification, proof of income and bank statements. Requirements can differ for employed and self-employed buyers. Confirm the current checklist with sales before preparing documents; do not send personal documents through this guide.", guide: { href: "/car-loan-kluang", label: "Read the car loan guide" } },
      { question: "Can I trade in my current car?", answer: "Contact sales to discuss a trade-in. Share the make, model, year, mileage and photos through the sales contact. Any acceptance and final valuation must be confirmed after inspecting the car; no value is guaranteed online.", guide: { href: "/trade-in-car-kluang", label: "Read the trade-in guide" } },
      { question: "How do I arrange a viewing or test drive?", answer: "Contact sales with your chosen car and preferred time. Ask them to confirm stock, viewing availability and whether a test drive can be arranged. An enquiry does not automatically book an appointment; wait for confirmation before visiting." },
      { question: "Are warranty and other costs included?", answer: "Ask sales whether that specific car has a warranty, including its coverage, duration and exclusions. Request an itemized written quote showing the car price, insurance, transfer fees and other charges, with what is included or separate clearly stated. Do not assume all costs or warranty are included." }
    ]
  },
  zh: {
    title: "买车小帮手",
    welcome: "欢迎！请选择问题，查看简要指南。具体车辆的详情请向销售团队确认。",
    close: "关闭买车指南",
    changeLanguage: "切换语言",
    back: "返回问题列表",
    browse: "浏览车辆",
    enquiry: "在网站发送询问",
    contact: "通过 WhatsApp 联系销售",
    whatsappTopic: "咨询主题",
    whatsappLanguage: "语言",
    whatsappNotice: "WhatsApp 是外部服务。在销售确认合适的提交渠道前，请勿发送身份证件、银行结单或财务文件。",
    questions: [
      { question: "哪些车符合我的预算？", answer: "您可以浏览现有车源，并在车辆页面使用价格筛选。也可以通过 WhatsApp 告诉销售您的预算和心仪车型。选择取决于当前车源；价格及车辆是否仍可售，请向销售确认。" },
      { question: "可以买车申请贷款吗？", answer: "请向销售咨询心仪车辆的贷款安排。贷款金额、利率和期限取决于申请人的资料，以及银行的评估和批准。估算不代表正式贷款方案，也不保证获批。", guide: { href: "/car-loan-kluang", label: "阅读汽车贷款指南" } },
      { question: "申请贷款可能需要哪些文件？", answer: "一般而言，银行可能要求身份证明、收入证明和银行结单。受薪人士与自雇人士的要求可能不同。准备文件前，请向销售确认最新清单；请勿通过此指南发送个人文件。", guide: { href: "/car-loan-kluang", label: "阅读汽车贷款指南" } },
      { question: "可以用现有车辆以旧换新吗？", answer: "请联系销售讨论以旧换新，并通过销售联系渠道提供品牌、车型、年份、里程及照片。是否接受及最终估价须在检查车辆后确认；线上不保证任何估值。", guide: { href: "/trade-in-car-kluang", label: "阅读 Trade-in 指南" } },
      { question: "如何安排看车或试驾？", answer: "请告诉销售您想看的车辆和方便的时间，并请他们确认车源、看车时段，以及是否可以安排试驾。发送询问不会自动完成预约；请收到确认后再到访。" },
      { question: "是否包含保修和其他费用？", answer: "请向销售确认该车辆是否提供保修，以及保障范围、期限和不保事项。请索取逐项列明车价、保险、转名费及其他收费的书面报价，并注明哪些已包含、哪些另计。请勿假设所有费用或保修均已包含。" }
    ]
  }
};
