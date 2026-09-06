import { describe, expect, it, vi } from "vitest";
import {
  normalizeBusinessTextFields,
  normalizeBusinessTextFormChange,
  normalizeBusinessTextValue
} from "./BusinessTextFormProvider";

describe("business text normalization", () => {
  it("uppercases allowlisted business identifiers while preserving punctuation", () => {
    expect(normalizeBusinessTextValue("name", "aisha tan")).toBe("AISHA TAN");
    expect(normalizeBusinessTextValue("address", "12 jalan utama")).toBe("12 JALAN UTAMA");
    expect(normalizeBusinessTextValue("notes", "follow up next week")).toBe("FOLLOW UP NEXT WEEK");
    expect(normalizeBusinessTextValue("make", "toyota")).toBe("TOYOTA");
    expect(normalizeBusinessTextValue("model", "cr-v")).toBe("CR-V");
    expect(normalizeBusinessTextValue("chassisNumber", "Aa-01")).toBe("AA-01");
    expect(normalizeBusinessTextValue("engineNumber", "e-42")).toBe("E-42");
    expect(normalizeBusinessTextValue("invoiceNumber", " pi-1001 ")).toBe(" PI-1001 ");
  });

  it("normalizes entered document party fields and business descriptions", () => {
    for (const name of ["customerName", "ownerName", "sellerName", "sellerAddress", "deliveryAddress", "transportMethod", "inspectionBookingReference", "sellerTinNumber"]) {
      expect(normalizeBusinessTextValue(name, "a-b mixed")).toBe("A-B MIXED");
    }
    expect(normalizeBusinessTextValue("description", "electric bill")).toBe("ELECTRIC BILL");
    expect(normalizeBusinessTextValue(["lines", 0, "description"], "service fee")).toBe("SERVICE FEE");
  });

  it("does not rewrite sensitive, authored, or technical fields", () => {
    expect(normalizeBusinessTextValue("password", "KeepCase")).toBe("KeepCase");
    expect(normalizeBusinessTextValue("email", "Staff@Example.com")).toBe("Staff@Example.com");
    expect(normalizeBusinessTextValue("publicDescriptionMarkdown", "## Keep this copy")).toBe("## Keep this copy");
    expect(normalizeBusinessTextValue("sourceUrl", "https://example.test/a")).toBe("https://example.test/a");
    expect(normalizeBusinessTextValue("vehicleId", "OpaqueId")).toBe("OpaqueId");
  });

  it("returns only changed field values for Form.Provider updates", () => {
    expect(normalizeBusinessTextFields([
      { name: "make", value: "honda" },
      { name: "email", value: "Staff@Example.com" },
      { name: "model", value: "CR-V" }
    ])).toEqual([{ name: "make", value: "HONDA" }]);
  });

  it("writes normalized changed values back through the registered Form store callback", () => {
    const setFields = vi.fn();

    normalizeBusinessTextFormChange("customerCreate", {
      changedFields: [
        { name: "name", value: "aisha tan" },
        { name: "email", value: "Staff@Example.com" },
        { name: ["customer", "notes"], value: "call after lunch" }
      ],
      forms: { customerCreate: { setFields } }
    });

    expect(setFields).toHaveBeenCalledWith([
      { name: "name", value: "AISHA TAN" },
      { name: ["customer", "notes"], value: "CALL AFTER LUNCH" }
    ]);
  });
});
