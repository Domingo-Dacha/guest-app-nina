import { AppShell } from "@/components/domingo/app-shell";
import { StaffDashboard } from "@/components/staff/staff-dashboard";
import { requirePageSession } from "@/lib/auth/server-session";
import { moscowDate } from "@/lib/staff-rules";
import "./staff.css";
export const dynamic = "force-dynamic";
export default async function StaffPage() {
  await requirePageSession();
  return (
    <AppShell>
      <StaffDashboard initialDate={moscowDate(new Date())} />
    </AppShell>
  );
}
