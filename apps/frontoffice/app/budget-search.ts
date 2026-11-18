export const budgetEnquiryKey = "faq-budget-enquiry";
export const maximumVehicleBudget = 2_000_000;

export const budgetSearchCopy = {
  en: {
    searching: "Checking stock…",
    failure: "We couldn’t check stock. Please try again.",
    noMatch: (budget: string) => `We found no cars within your estimated RM ${budget} budget. Leave your details and we’ll help you find one.`,
    budget: "Share your vehicle budget with sales (RM)",
    expired: "Run the budget search again to refresh your enquiry."
  },
  zh: {
    searching: "正在查看库存…",
    failure: "暂时无法查看库存，请重试。",
    noMatch: (budget: string) => `目前没有符合 RM ${budget} 估算预算的车辆。请留下联系方式，我们会帮您寻找合适的车辆。`,
    budget: "提供给销售的购车预算（RM）",
    expired: "请重新查询预算以更新您的询问。"
  },
  ms: {
    searching: "Menyemak stok…",
    failure: "Stok tidak dapat disemak. Sila cuba lagi.",
    noMatch: (budget: string) => `Tiada kereta dalam anggaran bajet RM ${budget}. Tinggalkan butiran anda dan kami akan bantu mencari kereta yang sesuai.`,
    budget: "Kongsi bajet kereta dengan jualan (RM)",
    expired: "Cari semula mengikut bajet untuk mengemas kini pertanyaan anda."
  }
};
