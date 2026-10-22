import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { PageHeader } from "@/components/ui/misc";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Profile") };
}

export default async function ProfilePage() {
  const t = await getT();
  const p = await requireTeacher();
  return (
    <>
      <PageHeader title={t("Profile")} description={t("Change your name and password.")} />
      <ProfileForm name={p.name} email={p.email} />
    </>
  );
}
