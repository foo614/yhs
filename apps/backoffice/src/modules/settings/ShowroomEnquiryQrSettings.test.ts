import { describe, expect, it, vi } from "vitest";
import { printShowroomEnquiryQr, showroomEnquiryPrintHtml, showroomEnquiryQrBranding, showroomEnquiryUrl } from "./ShowroomEnquiryQr";

describe("showroom enquiry QR settings", () => {
  it("uses one stable public showroom-enquiry destination", () => {
    expect(showroomEnquiryUrl("https://ysheng.com.my/")).toBe("https://ysheng.com.my/showroom-enquiry");
  });

  it("uses the YS Heng logo with high QR error correction", () => {
    expect(showroomEnquiryQrBranding).toEqual({
      icon: "/ys-heng-logo.png",
      iconSize: { width: 60, height: 26 },
      errorLevel: "H"
    });
  });

  it("builds a self-contained QR print document without opening a blank tab", () => {
    const html = showroomEnquiryPrintHtml("https://ysheng.com.my/showroom-enquiry?a=1&b=2", '<svg aria-label="QR"></svg>');

    expect(html).toContain('<svg aria-label="QR"></svg>');
    expect(html).toContain("https://ysheng.com.my/showroom-enquiry?a=1&amp;b=2");
    expect(html).toContain("YS Heng showroom enquiry QR");
  });

  it("loads the QR document in an in-page frame and invokes printing", () => {
    const printWindow = {
      addEventListener: vi.fn(),
      focus: vi.fn(),
      print: vi.fn()
    };
    const frame = {
      title: "",
      style: {},
      onload: null as null | (() => void),
      srcdoc: "",
      contentWindow: printWindow,
      remove: vi.fn()
    };
    const hostDocument = {
      createElement: vi.fn(() => frame),
      body: { append: vi.fn(() => frame.onload?.()) }
    } as unknown as Document;
    const hostWindow = { setTimeout: vi.fn() } as unknown as Pick<Window, "setTimeout">;

    printShowroomEnquiryQr("https://ysheng.com.my/showroom-enquiry", "<svg></svg>", hostDocument, hostWindow);

    expect(frame.srcdoc).toContain("<svg></svg>");
    expect(hostDocument.body.append).toHaveBeenCalledWith(frame);
    expect(printWindow.focus).toHaveBeenCalledOnce();
    expect(printWindow.print).toHaveBeenCalledOnce();
  });
});
