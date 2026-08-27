import type { Metadata } from "next";
import { ShowroomEnquiryFlow } from "./ShowroomEnquiryFlow";

export const metadata: Metadata = {
  title: "Showroom enquiry | YS Heng Auto",
  description: "Tell YS Heng what you are looking for while visiting the showroom."
};

export default function ShowroomEnquiryPage() {
  return <ShowroomEnquiryFlow />;
}
