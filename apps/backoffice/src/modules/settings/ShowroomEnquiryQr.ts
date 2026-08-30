export function showroomEnquiryUrl(frontofficeOrigin = import.meta.env.VITE_FRONTOFFICE_ORIGIN ?? "http://localhost:3000") {
  return `${frontofficeOrigin.trim().replace(/\/+$/, "")}/showroom-enquiry`;
}

export const showroomEnquiryQrBranding = {
  icon: "/ys-heng-logo.png",
  iconSize: { width: 60, height: 26 },
  errorLevel: "H" as const
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function showroomEnquiryPrintHtml(url: string, qrSvgMarkup: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>YS Heng showroom enquiry QR</title><style>@page{margin:16mm}body{font-family:Arial,sans-serif;text-align:center;color:#1b1819}svg{width:95mm;height:95mm;max-width:100%}p{font-size:14px;word-break:break-all}</style></head><body><h1>YS Heng Auto</h1><h2>Showroom enquiry</h2>${qrSvgMarkup}<p>${escapeHtml(url)}</p></body></html>`;
}

export function printShowroomEnquiryQr(
  url: string,
  qrSvgMarkup: string,
  hostDocument = document,
  hostWindow: Pick<Window, "setTimeout"> = window
) {
  const frame = hostDocument.createElement("iframe");
  frame.title = "YS Heng showroom enquiry QR print document";
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.onload = () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      frame.remove();
      return;
    }

    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
    hostWindow.setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = showroomEnquiryPrintHtml(url, qrSvgMarkup);
  hostDocument.body.append(frame);
}
