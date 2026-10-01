import { AppShell } from "@/components/domingo/app-shell";
import { ExtrasApp } from "@/components/extras/extras-app";
import { extrasCatalogRepository } from "@/data/repositories/extras-catalog-repository";
import { requirePageSession } from "@/lib/auth/server-session";
import "./extras.css";

export const dynamic = "force-dynamic";
export default async function ExtrasPage() {
  await requirePageSession();
  const [catalog, stay] = await Promise.all([
    extrasCatalogRepository.getCatalog(),
    extrasCatalogRepository.getStay(),
  ]);
  return (
    <AppShell>
      <ExtrasApp
        catalog={catalog}
        stay={stay}
        initialNow={new Date().toISOString()}
      />
    </AppShell>
  );
}
