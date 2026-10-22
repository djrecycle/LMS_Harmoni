import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CircleX, LoaderCircle } from "lucide-react";
import { CalendarUploadForm } from "@/components/calendar-upload-form";
import { DeleteButton } from "@/components/delete-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { deleteCalendar } from "@/app/actions/calendar";
import { providerOptions } from "@/lib/ai";
import { listCalendars } from "@/lib/calendar-data";
import { requireTeacher } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Academic Calendar") };
}

export default async function CalendarListPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const calendars = await listCalendars(teacher.id);

  return (
    <>
      <PageHeader title={t("Academic Calendar")} description={t("Upload your school's official Kalender Pendidikan and browse it here.")} />
      <div className="grid gap-5">
        <CalendarUploadForm providers={await providerOptions()} />

        {calendars.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title={t("No calendar yet")}>
            {t("Upload a file above to get started.")}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5">
            {calendars.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
                <Link href={c.status === "done" ? `/teacher/calendar/${c.id}` : "#"} className={c.status === "done" ? "min-w-0 flex-[1_1_12rem] hover:text-primary" : "min-w-0 flex-[1_1_12rem] cursor-default"}>
                  <p className="break-words font-semibold">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</p>
                </Link>
                {c.status === "pending" && (
                  <Badge tone="warning">
                    <LoaderCircle className="size-3 animate-spin" /> {t("Reading…")}
                  </Badge>
                )}
                {c.status === "error" && (
                  <Badge tone="danger">
                    <CircleX className="size-3" /> {c.error ? t(c.error) : t("Failed")}
                  </Badge>
                )}
                <DeleteButton action={deleteCalendar} id={c.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
