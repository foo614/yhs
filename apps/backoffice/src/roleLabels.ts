const visibleRoleLabels: Record<string, string> = {
  BossAdmin: "Admin",
  Sales: "Broker / 经纪人",
  HrSalary: "HR Payroll"
};

/**
 * Maps internal RBAC keys to the role names shown to staff.
 * Keep API values and permission checks on the internal keys.
 */
export function displayRoleLabel(role: string) {
  return visibleRoleLabels[role] ?? role;
}

export const roleLabel = displayRoleLabel;
export const staffRoleSearchLabel = displayRoleLabel;
