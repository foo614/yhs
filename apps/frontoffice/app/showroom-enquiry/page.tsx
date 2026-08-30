import type { Metadata } from "next";
import { pageMetadata } from "../seo";
import { ShowroomEnquiryFlow } from "./ShowroomEnquiryFlow";

const publicMetadata = pageMetadata({
  title: "Showroom enquiry | YS Heng Automotive",
  description: "Share vehicle preferences with the YS Heng sales team while visiting the Kluang showroom.",
  path: "/showroom-enquiry"
});

export const metadata: Metadata = {
  ...publicMetadata,
  robots: { index: false, follow: false }
};

export default function ShowroomEnquiryPage() {
  return <ShowroomEnquiryFlow />;
}
