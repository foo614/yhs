"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import formStyles from "../EnquiryForm.module.css";
import { frontofficeCopy, type Language } from "../i18n";
import { submitPublicContact } from "../vehicles/service";

type EnquiryIntent = "" | "viewing" | "loan" | "trade-in";

const customerNameMaxLength = 120;
const phoneMaxLength = 64;
const messageMaxLength = 2000;

export function ContactEnquiryForm({ language }: { language: Language }) {
  const t = frontofficeCopy[language].contact;
  const formCopy = language === "zh"
    ? {
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
  const [errorMessage, setErrorMessage] = useState<string>(t.formDefaultError);
  const submissionLockedRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
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

  async function submitEnquiry() {
    if (submissionLockedRef.current || status === "sent" || messageTooLong) return;
    submissionLockedRef.current = true;
    setStatus("sending");
    setErrorMessage(t.formDefaultError);
    try {
      const result = await submitPublicContact({
        customerName,
        phone,
        message: messageWithIntent(),
        ...attribution
      });

      if (result.ok) {
        setStatus("sent");
        return;
      }

      setErrorMessage(t.formErrors[result.code as keyof typeof t.formErrors] ?? result.message);
      setStatus("error");
      submissionLockedRef.current = false;
    } catch {
      setErrorMessage(t.formDefaultError);
      setStatus("error");
      submissionLockedRef.current = false;
    }
  }

  function startNewEnquiry() {
    setCustomerName("");
    setPhone("");
    setMessage("");
    setIntent("");
    setErrorMessage(t.formDefaultError);
    setStatus("idle");
    submissionLockedRef.current = false;
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }

  return (
    <form
      action={submitEnquiry}
      className="leadForm contactEnquiryForm"
      aria-labelledby="contact-enquiry-title"
      aria-busy={status === "sending"}
    >
      {status === "sent" ? (
        <div ref={confirmationRef} className={formStyles.submitted} role="status" tabIndex={-1}>
          <p className="success">{t.formSuccess}</p>
          <button type="button" onClick={startNewEnquiry}>{formCopy.newEnquiry}</button>
        </div>
      ) : (
        <>
          <label>
            {t.formName}
            <input
              ref={nameInputRef}
              name="customerName"
              required
              autoComplete="name"
              maxLength={customerNameMaxLength}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder={t.formNamePlaceholder}
            />
          </label>
          <label>
            {t.formPhone}
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
            {t.formMessage}
            <textarea
              name="message"
              required
              rows={4}
              maxLength={messageLimit}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t.formMessagePlaceholder}
              aria-invalid={messageTooLong || undefined}
              aria-describedby={messageTooLong ? "contact-enquiry-message-length" : undefined}
            />
          </label>
          {messageTooLong && (
            <p id="contact-enquiry-message-length" className={formStyles.lengthError} role="alert">
              {formCopy.messageTooLong}
            </p>
          )}
          <button type="submit" disabled={status === "sending" || messageTooLong}>
            {status === "sending" ? t.formSubmitting : t.formSubmit}
          </button>
          <p className="leadFormFooter"><CheckCircle2 size={16} /> {t.formPrivacy}</p>
          {status === "sending" && <p className={formStyles.statusMessage} role="status">{t.formSubmitting}</p>}
          {status === "error" && <p className="error" role="alert">{errorMessage}</p>}
        </>
      )}
    </form>
  );
}
