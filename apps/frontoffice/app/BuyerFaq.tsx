"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Languages, MessageCircle, X } from "lucide-react";
import { whatsappNumber } from "./business";
import { buyerFaq, faqLanguages, type FaqLanguage } from "./buyer-faq";
import { hrefWithLanguage } from "./i18n";
import styles from "./BuyerFaq.module.css";

const BuyerHelpContext = createContext<{ open: boolean; show: (trigger: HTMLButtonElement) => void } | null>(null);

export function BuyerHelpButton({ label }: { label: string }) {
  const help = useContext(BuyerHelpContext);
  return <button type="button" aria-haspopup="dialog" aria-expanded={help?.open ?? false} aria-controls="buyer-faq" onClick={(event) => help?.show(event.currentTarget)}><MessageCircle size={18} aria-hidden="true" />{label}</button>;
}

export function BuyerFaq({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const questionButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const returnToQuestion = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<FaqLanguage | null>(null);
  const [question, setQuestion] = useState<number | null>(null);
  const t = language ? buyerFaq[language] : null;
  const selectedQuestion = t && question !== null ? t.questions[question] : null;
  const languageLabel = language ? faqLanguages.find((entry) => entry.code === language)?.label : null;
  const whatsappMessage = t && languageLabel
    ? `${t.whatsappTopic}: ${selectedQuestion?.question ?? t.title}\n${t.whatsappLanguage}: ${languageLabel}`
    : "";

  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      heading.current?.focus();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previousOverflow; };
    }
    dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (question !== null) {
      answerHeading.current?.focus();
      return;
    }
    if (returnToQuestion.current !== null) {
      const questionIndex = returnToQuestion.current;
      returnToQuestion.current = null;
      questionButtons.current[questionIndex]?.focus();
      return;
    }
    heading.current?.focus();
  }, [language, question, open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    launcher.current?.focus();
  }

  function show(trigger: HTMLButtonElement) {
    launcher.current = trigger;
    setOpen(true);
  }

  return (
    <BuyerHelpContext.Provider value={{ open, show }}>
      {children}
      <button type="button" className={styles.launcher} aria-haspopup="dialog" aria-expanded={open} aria-controls="buyer-faq" onClick={(event) => show(event.currentTarget)}>
        <MessageCircle size={20} aria-hidden="true" />
        <span>{t?.title ?? <><span lang="ms">Bantuan</span><span aria-hidden="true"> / </span><span lang="en">Help</span><span aria-hidden="true"> / </span><span lang="zh-Hans">帮助</span></>}</span>
      </button>
      <dialog ref={dialog} id="buyer-faq" className={styles.dialog} lang={language ?? undefined} aria-labelledby="buyer-faq-heading" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpen(false)} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button, a[href]");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
          event.preventDefault();
          last?.focus();
        }
      }}>
        <div className={styles.header}>
          <span>YS HENG</span>
          <button type="button" className={styles.iconButton} aria-label={t?.close} onClick={close}>
            {!t && <span className={styles.srOnly}><span lang="ms">Tutup</span><span aria-hidden="true"> / </span><span lang="en">Close</span><span aria-hidden="true"> / </span><span lang="zh-Hans">关闭</span></span>}
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.content}>
          <h2 id="buyer-faq-heading" ref={heading} tabIndex={-1}>{t?.title ?? <><span lang="ms">Pilih bahasa</span><span aria-hidden="true"> / </span><span lang="en">Choose language</span><span aria-hidden="true"> / </span><span lang="zh-Hans">选择语言</span></>}</h2>
          {t && language ? (
            <>
              <button type="button" className={styles.textButton} onClick={() => { returnToQuestion.current = null; setLanguage(null); setQuestion(null); }}><Languages size={16} aria-hidden="true" />{t.changeLanguage}</button>
              {question === null ? (
                <>
                  <p className={styles.welcome}>{t.welcome}</p>
                  <div className={styles.options}>
                    {t.questions.map((entry, index) => <button type="button" ref={(button) => { questionButtons.current[index] = button; }} key={entry.question} onClick={() => setQuestion(index)}>{entry.question}<ArrowRight size={18} aria-hidden="true" /></button>)}
                  </div>
                </>
              ) : (
                <div className={styles.answer}>
                  <h3 ref={answerHeading} tabIndex={-1}>{selectedQuestion?.question}</h3>
                  <p>{selectedQuestion?.answer}</p>
                  {selectedQuestion?.guide && <Link className={styles.guideLink} href={hrefWithLanguage(selectedQuestion.guide.href, language === "zh" ? "zh" : "en")} onClick={close}>{selectedQuestion.guide.label}<ArrowRight size={16} aria-hidden="true" /></Link>}
                  <button type="button" className={styles.textButton} onClick={() => { returnToQuestion.current = question; setQuestion(null); }}><ArrowLeft size={16} aria-hidden="true" />{t.back}</button>
                </div>
              )}
              <div className={styles.actions}>
                <Link href={hrefWithLanguage("/vehicles", language === "zh" ? "zh" : "en")} onClick={close}>{t.browse}<ArrowRight size={16} aria-hidden="true" /></Link>
                <Link href={hrefWithLanguage("/contact#enquiry", language === "zh" ? "zh" : "en")} onClick={close}>{t.enquiry}<ArrowRight size={16} aria-hidden="true" /></Link>
                {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`} onClick={close}>{t.contact}<MessageCircle size={16} aria-hidden="true" /></a>}
              </div>
              {whatsappNumber && <p className={styles.privacyNotice}>{t.whatsappNotice}</p>}
            </>
          ) : (
            <div className={styles.options}>
              {faqLanguages.map((entry) => <button type="button" lang={entry.code} key={entry.code} onClick={() => setLanguage(entry.code)}>{entry.label}<ArrowRight size={18} aria-hidden="true" /></button>)}
            </div>
          )}
        </div>
      </dialog>
    </BuyerHelpContext.Provider>
  );
}
