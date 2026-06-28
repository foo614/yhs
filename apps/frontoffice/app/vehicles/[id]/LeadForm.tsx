"use client";

import { useMemo, useState } from "react";
import { frontofficeCopy, type Language } from "../../i18n";
import { submitPublicLead } from "../service";

export function LeadForm({ vehicleId, language = "en" }: { vehicleId: string; language?: Language }) {
  const t = frontofficeCopy[language].leadForm;
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
      <h2>{t.title}</h2>
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
      {status === "sent" && <p className="success">{t.success}</p>}
      {status === "error" && <p className="error">{errorMessage}</p>}
    </form>
  );
}
