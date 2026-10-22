import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RosterUploadForm } from "@/components/roster-upload-form";
import { PageHeader } from "@/components/ui/misc";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Upload classes & students") };
}

export default async function RosterUploadPage() {
  const t = await getT();
  await requireTeacher();
  return (
    <>
      <Link href="/teacher/classes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="size-4" /> {t("Classes & Students")}
      </Link>
      <PageHeader
        title={t("Upload classes & students")}
        description={t("Fill in the template and upload it. Classes that do not exist yet are created automatically; each student gets a ready-to-use username and password.")}
      />
      <div className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <RosterUploadForm />
      </div>
    </>
  );
}
