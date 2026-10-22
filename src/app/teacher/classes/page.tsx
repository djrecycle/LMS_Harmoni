import type { Metadata } from "next";
import Link from "next/link";
import { Plus, School, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { teacherSummary } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Classes & Students") };
}

export default async function ClassroomList() {
  const t = await getT();
  const teacher = await requireTeacher();
  const { classroom } = await teacherSummary(teacher.id);
  return (
    <>
      <PageHeader
        title={t("Classes & Students")}
        description={t("Manage classes, invite students with a class code, and track their progress.")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/classes/upload">
                <Upload /> {t("Upload classes & students")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/teacher/classes/new">
                <Plus /> {t("New class")}
              </Link>
            </Button>
          </div>
        }
      />
      {classroom.length === 0 ? (
        <EmptyState icon={<School />} title={t("No classes yet")}>
          {t("Create a class to start inviting students.")}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classroom.map((k) => (
            <Link key={k.id} href={`/teacher/classes/${k.id}`} className="group rounded-xl border bg-card p-5 shadow-xs transition hover:border-primary hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold group-hover:text-primary">{k.name}</h2>
                <Badge tone="primary">
                  <Users className="size-3" /> {k.stat.member.length}
                </Badge>
              </div>
              {k.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{k.description}</p>}
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("Invite code")}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-bold tracking-widest">{k.inviteCode}</span>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{t("Lesson progress")}</span>
                  <span>{k.stat.averageProgress}%</span>
                </div>
                <Progress value={k.stat.averageProgress} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
