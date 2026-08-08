"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { frontofficeCopy, type Language } from "../../i18n";
import { submitPublicLead } from "../service";

export function LeadForm({ vehicleId, language = "en" }: { vehicleId: string; language?: Language }) {
  const t = frontofficeCopy[language].leadForm;
  const formCopy = language === "zh"
    ? {
        kicker: "YS Heng Concierge",
        intro: "告诉我们你想约看车、贷款估算或 trade-in，团队会用最直接的方式跟进。",
        footer: "只提交给 YS Heng 跟进此车询问。"
      }
    : {
        kicker: "YS Heng Concierge",
        intro: "Tell us if you want a viewing, loan estimate, or trade-in discussion. The team will follow up with the clearest next step.",
        footer: "Submitted only to YS Heng for this vehicle enquiry."
      };
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const attribution = useMemo(() => {
    if (typeof window === "undefined") return { sourcePage: `/vehicles/${vehicleId}` };
    const sourcePage = `${window.location.pathname}${window.location.search}`.slice(0, 500);
    const params = new URLSearchParams(window.location.search);
    const campaign = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
      .map((key) => [key, params.get(key)] as const)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    return {
      sourcePage,
      sourceReferrer: document.referrer.slice(0, 500),
      sourceCampaign: campaign.slice(0, 500)
    };
  }, [vehicleId]);
  const [errorMessage, setErrorMessage] = useState<string>(t.defaultError);

  async function submitLead(formData: FormData) {
    setStatus("sending");
    setErrorMessage(t.defaultError);
    const result = await submitPublicLead({
      vehicleId,
      customerName: String(formData.get("customerName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      message: String(formData.get("message") ?? ""),
      ...attribution
    });

    if (result.ok) {
      setStatus("sent");
    } else {
      setErrorMessage(t.errors[result.code as keyof typeof t.errors] ?? result.message);
      setStatus("error");
    }
  }

  return (
    <form action={submitLead} className="leadForm">
      <div className="leadFormHeader">
        <p className="atelierKicker">{formCopy.kicker}</p>
        <h2>{t.title}</h2>
        <p>{formCopy.intro}</p>
      </div>
      <label>
        {t.name}
        <input name="customerName" required placeholder={t.namePlaceholder} />
      </label>
      <label>
        {t.phone}
        <input name="phone" required placeholder="012-3456789" />
      </label>
      <label>
        {t.message}
        <textarea name="message" rows={4} placeholder={t.messagePlaceholder} />
      </label>
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.sending : t.send}
      </button>
      <p className="leadFormFooter"><CheckCircle2 size={16} /> {formCopy.footer}</p>
      {status === "sent" && <p className="success">{t.success}</p>}
      {status === "error" && <p className="error">{errorMessage}</p>}
    </form>
  );
}
