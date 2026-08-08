"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { frontofficeCopy, type Language } from "../i18n";
import { submitPublicContact } from "../vehicles/service";

export function ContactEnquiryForm({ language }: { language: Language }) {
  const t = frontofficeCopy[language].contact;
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>(t.formDefaultError);
  const attribution = useMemo(() => {
    if (typeof window === "undefined") return { sourcePage: "/contact" };
    const sourcePage = `${window.location.pathname}${window.location.search}`.slice(0, 500);
    const params = new URLSearchParams(window.location.search);
    const sourceCampaign = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
      .map((key) => [key, params.get(key)] as const)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    return {
      sourcePage,
      sourceReferrer: document.referrer.slice(0, 500),
      sourceCampaign: sourceCampaign.slice(0, 500)
    };
  }, []);

  async function submitEnquiry(formData: FormData) {
    setStatus("sending");
    setErrorMessage(t.formDefaultError);
    const result = await submitPublicContact({
      customerName: String(formData.get("customerName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      message: String(formData.get("message") ?? ""),
      ...attribution
    });

    if (result.ok) {
      setStatus("sent");
      return;
    }

    setErrorMessage(t.formErrors[result.code as keyof typeof t.formErrors] ?? result.message);
    setStatus("error");
  }

  return (
    <form action={submitEnquiry} className="leadForm contactEnquiryForm">
      <div className="leadFormHeader">
        <p className="atelierKicker">{t.formKicker}</p>
        <h2>{t.formTitle}</h2>
        <p>{t.formIntro}</p>
      </div>
      <label>
        {t.formName}
        <input name="customerName" required placeholder={t.formNamePlaceholder} />
      </label>
      <label>
        {t.formPhone}
        <input name="phone" required inputMode="tel" placeholder="012-3456789" />
      </label>
      <label>
        {t.formMessage}
        <textarea name="message" required rows={4} maxLength={2000} placeholder={t.formMessagePlaceholder} />
      </label>
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.formSubmitting : t.formSubmit}
      </button>
      <p className="leadFormFooter"><CheckCircle2 size={16} /> {t.formPrivacy}</p>
      {status === "sent" && <p className="success">{t.formSuccess}</p>}
      {status === "error" && <p className="error">{errorMessage}</p>}
    </form>
  );
}
