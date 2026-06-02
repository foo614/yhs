import { Suspense } from "react";
import ContactPageClient from "./ContactPageClient";

export default function ContactPage() {
  return (
    <Suspense fallback={<main className="atelierSubPage">Loading...</main>}>
      <ContactPageClient />
    </Suspense>
  );
}
