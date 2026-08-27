export function showroomEnquiryUrl(frontofficeOrigin = import.meta.env.VITE_FRONTOFFICE_ORIGIN ?? "http://localhost:3000") {
  return `${frontofficeOrigin.trim().replace(/\/+$/, "")}/showroom-enquiry`;
}
