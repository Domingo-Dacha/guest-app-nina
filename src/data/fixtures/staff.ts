import type { StaffProfile } from "../contracts/staff";

// These are shared demonstration identities, not employee accounts.
export const staffProfiles: StaffProfile[] = [
  { id: "demo-manager", name: "Управляющий · демо", role: "manager" },
  { id: "demo-kitchen", name: "Кухня · демо", role: "kitchen" },
  { id: "demo-bath", name: "Баня · демо", role: "bath" },
  { id: "demo-other", name: "Сервис · демо", role: "other" },
];
