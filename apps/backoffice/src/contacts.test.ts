import { describe, expect, it } from "vitest";
import type { Customer, Owner } from "./api";
import { customerCreateBlockReason, ownerCreateBlockReason } from "./contacts";

const baseCustomer: Customer = {
  id: "customer-1",
  name: "Ali Tan",
  phone: "012-345 6789",
  icNumber: "900101-10-1234",
  email: "ali@example.com",
  address: "123 Jalan Demo",
  notes: "Prefers delivery after loan approval"
};

const baseOwner: Owner = {
  id: "owner-1",
  name: "Lim Owner",
  phone: "019-888 7777"
};

describe("contact creation helpers", () => {
  it("blocks customers with blank names, blank phones, or duplicate normalized phones", () => {
    expect(customerCreateBlockReason({ ...baseCustomer, name: " " })).toBe("Customer name is required.");
    expect(customerCreateBlockReason({ ...baseCustomer, phone: " " })).toBe("Customer phone is required.");
    expect(customerCreateBlockReason({
      ...baseCustomer,
      id: "customer-new",
      phone: "0123456789"
    }, [baseCustomer])).toBe("Customer phone already exists.");
    expect(customerCreateBlockReason(baseCustomer)).toBeUndefined();
  });

  it("blocks owners with blank names, blank phones, or duplicate normalized phones", () => {
    expect(ownerCreateBlockReason({ ...baseOwner, name: " " })).toBe("Owner name is required.");
    expect(ownerCreateBlockReason({ ...baseOwner, phone: " " })).toBe("Owner phone is required.");
    expect(ownerCreateBlockReason({
      ...baseOwner,
      id: "owner-new",
      phone: "0198887777"
    }, [baseOwner])).toBe("Owner phone already exists.");
    expect(ownerCreateBlockReason(baseOwner)).toBeUndefined();
  });
});
