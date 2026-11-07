/**
 * Who may see and change what. One table, used by the menu, the screens and (for read-only) the server.
 * Roles come from the sign-in (TFL_USERS on the server). Unknown or missing roles can look but never change.
 */
export type RoleName = "administrator" | "management" | "commercial" | "sales" | "finance" | "operations" | "readonly";

const ALL_TFL = ["locations", "owners", "productions", "enquiries", "scouting", "bookings", "quotes", "invoices", "contracts", "permits", "assessments", "shortlists", "insurance", "payments", "registrations", "incidents", "neighbours", "tasks"];
const FIELD = ["locations", "owners", "productions", "enquiries", "scouting", "bookings", "contracts", "permits", "assessments", "shortlists", "insurance", "registrations", "incidents", "neighbours", "tasks"];

/** Modules each role can open and edit. "*" = everything. */
const EDIT: Record<RoleName, string[] | "*"> = {
  administrator: "*",
  management: "*",
  commercial: [...FIELD, "quotes"],
  sales: ["locations", "owners", "productions", "enquiries", "bookings", "quotes", "shortlists", "registrations", "tasks"],
  finance: ["productions", "bookings", "quotes", "invoices", "contracts", "insurance", "payments", "incidents", "tasks"],
  operations: FIELD,
  readonly: [],
};
/** Modules a role can open without editing (on top of EDIT). */
const VIEW_EXTRA: Record<RoleName, string[]> = {
  administrator: [], management: [],
  commercial: ["invoices", "payments"],
  sales: ["scouting", "contracts", "permits", "invoices", "assessments", "insurance", "incidents", "neighbours"],
  finance: ["locations", "owners", "enquiries", "scouting", "permits", "assessments", "shortlists", "registrations", "neighbours"],
  operations: ["quotes", "payments"],
  readonly: ALL_TFL,
};

const known = (r?: string): r is RoleName => !!r && r in EDIT;

/** Can this role open the TFL module? (No role = not signed in properly: show, never edit.) */
export function canViewTfl(role: string | undefined, key: string): boolean {
  if (!role) return true;
  if (!known(role)) return true;
  const e = EDIT[role];
  return e === "*" || e.includes(key) || VIEW_EXTRA[role].includes(key);
}

/** Can this role create, edit, import or delete in the TFL module? */
export function canEditTfl(role: string | undefined, key: string): boolean {
  if (!known(role)) return false;
  const e = EDIT[role];
  return e === "*" || e.includes(key);
}

/** Settings, backups and user admin. */
export function canAdminister(role: string | undefined): boolean {
  return role === "administrator" || role === "management";
}

/** Every module with what a role may do in it, for the Roles & Permissions screen. */
export const ROLE_LABEL: Record<RoleName, string> = {
  administrator: "Administrator", management: "Management", commercial: "Commercial", sales: "Sales",
  finance: "Finance", operations: "Operations", readonly: "Read only",
};
export const ROLE_ORDER = Object.keys(ROLE_LABEL) as RoleName[];
export function roleMatrix(keys: string[]): { role: RoleName; label: string; cells: Record<string, "edit" | "view" | "none"> }[] {
  return ROLE_ORDER.map((role) => ({
    role, label: ROLE_LABEL[role],
    cells: Object.fromEntries(keys.map((k) => [k, canEditTfl(role, k) ? "edit" : canViewTfl(role, k) ? "view" : "none"])) as Record<string, "edit" | "view" | "none">,
  }));
}

/** Menu ids ("tfl-locations", "settings", "email"…) a role may open. */
export function canViewSection(role: string | undefined, sectionId: string): boolean {
  if (sectionId.startsWith("tfl-")) return canViewTfl(role, sectionId.slice(4));
  // Settings holds users, backups and the server database: administrators and management only.
  // (No role at all = local demo mode, which keeps working.)
  if (sectionId === "settings") return !role || !known(role) ? !role : canAdminister(role);
  return true;
}
