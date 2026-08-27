import { describe, expect, it } from "vitest";
import { showroomEnquiryUrl } from "./ShowroomEnquiryQr";

describe("showroom enquiry QR settings", () => {
  it("uses one stable public showroom-enquiry destination", () => {
    expect(showroomEnquiryUrl("https://ysheng.com.my/")).toBe("https://ysheng.com.my/showroom-enquiry");
  });
});
