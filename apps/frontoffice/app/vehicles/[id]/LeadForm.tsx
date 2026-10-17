"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import formStyles from "../../EnquiryForm.module.css";
import { frontofficeCopy, type Language } from "../../i18n";
import { submitPublicLead } from "../service";

type EnquiryIntent = "" | "viewing" | "loan" | "trade-in";

const customerNameMaxLength = 120;
const phoneMaxLength = 64;
const messageMaxLength = 2000;

export function LeadForm({ vehicleId, language = "en" }: { vehicleId: string; language?: Language }) {
  const t = frontofficeCopy[language].leadForm;
  const formCopy = language === "zh"
    ? {
        kicker: "YS Heng Concierge",
        intro: "告诉我们你想约看车、贷款估算或 trade-in，团队会用最直接的方式跟进。",
        footer: "只提交给 YS Heng 跟进此车询问。",
        intentLegend: "想了解什么？（选填）",
        intents: {
          viewing: "预约看车",
          loan: "贷款选择",
          "trade-in": "Trade-in 换车"
        },
        intentPrefix: "询问类型",
        messageTooLong: "选择此类型后，留言需要缩短以保持在 2,000 字以内。",
        newEnquiry: "提交另一项询问"
      }
    : {
        kicker: "YS Heng Concierge",
        intro: "Tell us if you want a viewing, loan estimate, or trade-in discussion. The team will follow up with the clearest next step.",
        footer: "Submitted only to YS Heng for this vehicle enquiry.",
        intentLegend: "What can we help with? (optional)",
        intents: {
          viewing: "Book a viewing",
          loan: "Loan options",
          "trade-in": "Trade-in"
        },
        intentPrefix: "Enquiry type",
        messageTooLong: "Shorten your message so the selected enquiry type and message stay within 2,000 characters.",
        newEnquiry: "Send another enquiry"
      };
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<EnquiryIntent>("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const submissionLockedRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
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
  const intentLabel = intent ? formCopy.intents[intent] : "";
  const intentPrefix = intentLabel ? `${formCopy.intentPrefix}: ${intentLabel}` : "";
  const messageLimit = intentPrefix ? messageMaxLength - intentPrefix.length - 2 : messageMaxLength;
  const messageTooLong = message.length > messageLimit;

  useEffect(() => {
    if (status === "sent") confirmationRef.current?.focus();
  }, [status]);

  function messageWithIntent() {
    const buyerMessage = message.trim();
    if (!intentPrefix) return buyerMessage;
    return buyerMessage ? `${intentPrefix}\n\n${buyerMessage}` : intentPrefix;
  }

  async function submitLead() {
    if (submissionLockedRef.current || status === "sent" || messageTooLong) return;
    submissionLockedRef.current = true;
    setStatus("sending");
    setErrorMessage(t.defaultError);
    try {
      const result = await submitPublicLead({
        vehicleId,
        customerName,
        phone,
        message: messageWithIntent(),
        ...attribution
      });

      if (result.ok) {
        setStatus("sent");
        return;
      }

      setErrorMessage(t.errors[result.code as keyof typeof t.errors] ?? result.message);
      setStatus("error");
      submissionLockedRef.current = false;
    } catch {
      setErrorMessage(t.defaultError);
      setStatus("error");
      submissionLockedRef.current = false;
    }
  }

  function startNewEnquiry() {
    setCustomerName("");
    setPhone("");
    setMessage("");
    setIntent("");
    setErrorMessage(t.defaultError);
    setStatus("idle");
    submissionLockedRef.current = false;
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }

  return (
    <form action={submitLead} className="leadForm" aria-busy={status === "sending"}>
      <div className="leadFormHeader">
        <p className="atelierKicker">{formCopy.kicker}</p>
        <h2>{t.title}</h2>
        <p>{formCopy.intro}</p>
      </div>
      {status === "sent" ? (
        <div ref={confirmationRef} className={formStyles.submitted} role="status" tabIndex={-1}>
          <p className="success">{t.success}</p>
          <button type="button" onClick={startNewEnquiry}>{formCopy.newEnquiry}</button>
        </div>
      ) : (
        <>
          <label>
            {t.name}
            <input
              ref={nameInputRef}
              name="customerName"
              required
              autoComplete="name"
              maxLength={customerNameMaxLength}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder={t.namePlaceholder}
            />
          </label>
          <label>
            {t.phone}
            <input
              name="phone"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={phoneMaxLength}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="012-3456789"
            />
          </label>
          <fieldset className={formStyles.intentFieldset}>
            <legend>{formCopy.intentLegend}</legend>
            <div className={formStyles.intentOptions}>
              {(Object.keys(formCopy.intents) as Exclude<EnquiryIntent, "">[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={formStyles.intentButton}
                  aria-pressed={intent === value}
                  onClick={() => setIntent((current) => current === value ? "" : value)}
                >
                  {formCopy.intents[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            {t.message}
            <textarea
              name="message"
              rows={4}
              maxLength={messageLimit}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t.messagePlaceholder}
              aria-invalid={messageTooLong || undefined}
              aria-describedby={messageTooLong ? "vehicle-enquiry-message-length" : undefined}
            />
          </label>
          {messageTooLong && (
            <p id="vehicle-enquiry-message-length" className={formStyles.lengthError} role="alert">
              {formCopy.messageTooLong}
            </p>
          )}
          <button type="submit" disabled={status === "sending" || messageTooLong}>
            {status === "sending" ? t.sending : t.send}
          </button>
          <p className="leadFormFooter"><CheckCircle2 size={16} /> {formCopy.footer}</p>
          {status === "sending" && <p className={formStyles.statusMessage} role="status">{t.sending}</p>}
          {status === "error" && <p className="error" role="alert">{errorMessage}</p>}
        </>
      )}
    </form>
  );
}
