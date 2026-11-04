import type { Metadata } from "next";
import { HardDrive, UserCheck, Users } from "lucide-react";
import { TeacherAdmin } from "@/components/teacher-admin";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { adminOverview } from "@/lib/admin-data";
import { formatBytes } from "@/lib/utils";
import { requireAdmin } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Manage Teachers") };
}

/** Super Admin: approve, suspend or delete teachers, cap sign-ups, and keep the upload space in check. */
export default async function ManageTeachersPage() {
  const t = await getT();
  await requireAdmin();
  const o = await adminOverview();
  const pending = o.teachers.filter((x) => x.status === "pending").length;

  return (
    <>
      <PageHeader title={t("Manage Teachers")} description={t("Approve new teachers, limit sign-ups, and keep the server's storage in check. Only you (Super Admin) can see this page.")} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Teachers")} value={`${o.teacherCount} / ${o.settings.maxTeachers}`} icon={<Users />} keterangan={o.settings.registrationOpen ? t("Registration open") : t("Registration closed")} />
        <StatCard label={t("Waiting for approval")} value={pending} icon={<UserCheck />} />
        <StatCard
          label={t("Uploaded files (all teachers)")}
          value={formatBytes(o.totalUsedBytes)}
          icon={<HardDrive />}
          keterangan={o.disk ? t("Server disk: {0} free of {1}", formatBytes(o.disk.free), formatBytes(o.disk.total)) : undefined}
        />
      </div>
      <TeacherAdmin overview={o} />
    </>
  );
}
