"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Languages, MessageCircle, X } from "lucide-react";
import { whatsappNumber } from "./business";
import { buyerFaq, faqLanguages, type FaqLanguage } from "./buyer-faq";
import { hrefWithLanguage } from "./i18n";
import styles from "./BuyerFaq.module.css";

export function BuyerFaq() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<FaqLanguage | null>(null);
  const [question, setQuestion] = useState<number | null>(null);
  const t = language ? buyerFaq[language] : null;

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
    if (open) heading.current?.focus();
  }, [language, question, open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    launcher.current?.focus();
  }

  return (
    <>
      <button ref={launcher} type="button" className={styles.launcher} aria-haspopup="dialog" aria-expanded={open} aria-controls="buyer-faq" onClick={() => setOpen(true)}>
        <MessageCircle size={20} aria-hidden="true" />
        <span>{t?.title ?? "Bantuan / Help / 帮助"}</span>
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
          <button type="button" className={styles.iconButton} aria-label={t?.close ?? "Tutup / Close / 关闭"} onClick={close}><X size={22} aria-hidden="true" /></button>
        </div>
        <div className={styles.content}>
          <h2 id="buyer-faq-heading" ref={heading} tabIndex={-1}>{t?.title ?? "Pilih bahasa / Choose language / 选择语言"}</h2>
          {t && language ? (
            <>
              <button type="button" className={styles.textButton} onClick={() => { setLanguage(null); setQuestion(null); }}><Languages size={16} aria-hidden="true" />{t.changeLanguage}</button>
              {question === null ? (
                <>
                  <p className={styles.welcome}>{t.welcome}</p>
                  <div className={styles.options}>
                    {t.questions.map((entry, index) => <button type="button" key={entry.question} onClick={() => setQuestion(index)}>{entry.question}<ArrowRight size={18} aria-hidden="true" /></button>)}
                  </div>
                </>
              ) : (
                <div className={styles.answer}>
                  <h3>{t.questions[question].question}</h3>
                  <p>{t.questions[question].answer}</p>
                  <button type="button" className={styles.textButton} onClick={() => setQuestion(null)}><ArrowLeft size={16} aria-hidden="true" />{t.back}</button>
                </div>
              )}
              <div className={styles.actions}>
                <Link href={hrefWithLanguage("/vehicles", language === "zh" ? "zh" : "en")} onClick={close}>{t.browse}<ArrowRight size={16} aria-hidden="true" /></Link>
                {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}`} onClick={close}>{t.contact}<MessageCircle size={16} aria-hidden="true" /></a>}
              </div>
            </>
          ) : (
            <div className={styles.options}>
              {faqLanguages.map((entry) => <button type="button" lang={entry.code} key={entry.code} onClick={() => setLanguage(entry.code)}>{entry.label}<ArrowRight size={18} aria-hidden="true" /></button>)}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
