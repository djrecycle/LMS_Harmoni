import type { Metadata } from "next";
import { Clock, Sparkles } from "lucide-react";
import { AiDemoAdmin } from "@/components/ai-demo-admin";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { getDemoConfigView, listDemoRequests } from "@/lib/ai-demo";
import { requireAdmin } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("AI Demo Requests") };
}

/** Super Admin: teachers ask for a trial of the server's Claude AI; approve, reject or end it here. */
export default async function AiDemoAdminPage() {
  const t = await getT();
  await requireAdmin();
  const [config, requests] = await Promise.all([getDemoConfigView(), listDemoRequests()]);
  const pending = requests.filter((r) => r.status === "pending").length;
  const active = requests.filter((r) => r.status === "approved").length;

  return (
    <>
      <PageHeader
        title={t("AI Demo Requests")}
        description={t("Teachers without their own API key can ask for a trial of your Claude AI. On approval the demo token is created and put in their AI Settings automatically. Only you (Super Admin) can see this page.")}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatCard label={t("Waiting for approval")} value={pending} icon={<Clock />} />
        <StatCard label={t("Active demos")} value={active} icon={<Sparkles />} />
      </div>
      <AiDemoAdmin config={config} requests={requests} />
    </>
  );
}
