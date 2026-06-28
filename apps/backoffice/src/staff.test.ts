import { describe, expect, it } from "vitest";
import type { CreateStaffUserRequest, StaffUser } from "./api";
import { filterStaffUsers, staffCreateBlockReason, staffPasswordResetBlockReason, staffUpdateBlockReason } from "./staff";

const baseStaffRequest: CreateStaffUserRequest = {
  email: "sales@ysheng.local",
  displayName: "Sales User",
  password: "ChangeMe123!",
  role: "Sales"
};

const existingStaff: StaffUser[] = [
  {
    id: "staff-1",
    email: "sales@ysheng.local",
    displayName: "Sales User",
    roles: ["Sales"],
    isActive: true
  }
];

const staffDirectory: StaffUser[] = [
  existingStaff[0],
  {
    id: "staff-2",
    email: "finance@ysheng.local",
    displayName: "Finance Lead",
    roles: ["Finance", "HrSalary"],
    isActive: true
  },
  {
    id: "staff-3",
    email: "disabled@ysheng.local",
    displayName: "Disabled Admin",
    roles: ["BossAdmin"],
    isActive: false
  }
];

describe("staff creation helpers", () => {
  it("blocks staff creation with missing required fields or invalid roles", () => {
    expect(staffCreateBlockReason({ ...baseStaffRequest, email: " " })).toBe("Staff email is required.");
    expect(staffCreateBlockReason({ ...baseStaffRequest, displayName: " " })).toBe("Staff display name is required.");
    expect(staffCreateBlockReason({ ...baseStaffRequest, password: " " })).toBe("Initial password is required.");
    expect(staffCreateBlockReason({ ...baseStaffRequest, role: "Unknown" as CreateStaffUserRequest["role"] })).toBe("Staff role must be one of the configured department roles.");
    expect(staffCreateBlockReason(baseStaffRequest)).toBeUndefined();
  });

  it("blocks staff creation with duplicate emails", () => {
    expect(staffCreateBlockReason({
      ...baseStaffRequest,
      email: " SALES@ysheng.local "
    }, existingStaff)).toBe("Staff email already exists.");
  });

  it("blocks staff profile updates with a blank display name", () => {
    expect(staffUpdateBlockReason({ displayName: " " })).toBe("Staff display name is required.");
    expect(staffUpdateBlockReason({ displayName: "Sales Lead" })).toBeUndefined();
  });

  it("blocks staff password resets with blank or short passwords", () => {
    expect(staffPasswordResetBlockReason({ password: " " })).toBe("New password is required.");
    expect(staffPasswordResetBlockReason({ password: "short" })).toBe("New password must be at least 8 characters.");
    expect(staffPasswordResetBlockReason({ password: "NewPass123!" })).toBeUndefined();
  });

  it("filters staff by keyword, status, and role", () => {
    expect(filterStaffUsers(staffDirectory, { keyword: "finance" }).map((staff) => staff.id)).toEqual(["staff-2"]);
    expect(filterStaffUsers(staffDirectory, { status: "Disabled" }).map((staff) => staff.id)).toEqual(["staff-3"]);
    expect(filterStaffUsers(staffDirectory, { role: "HrSalary" }).map((staff) => staff.id)).toEqual(["staff-2"]);
    expect(filterStaffUsers(staffDirectory, { keyword: "admin", status: "Disabled", role: "BossAdmin" }).map((staff) => staff.id)).toEqual(["staff-3"]);
  });
});
