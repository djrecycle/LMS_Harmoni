import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CalendarMonth, KIND_DOT, KIND_LABEL } from "@/components/calendar-month";
import { PageHeader } from "@/components/ui/misc";
import { getOwnedCalendar } from "@/lib/access";
import { flattenEvents, type KaldikData } from "@/lib/calendar-data";
import { requireTeacher } from "@/lib/session";
import { cn, formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Academic Calendar") };
}

/** Every (year, month) between two ISO dates, inclusive. */
function monthsBetween(startIso: string, endIso: string): { year: number; month: number }[] {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out: { year: number; month: number }[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const stopY = end.getUTCFullYear();
  const stopM = end.getUTCMonth();
  let guard = 0;
  while ((y < stopY || (y === stopY && m <= stopM)) && guard++ < 24) {
    out.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export default async function CalendarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const doc = await getOwnedCalendar(teacher.id, id);
  if (!doc || doc.status !== "done" || !doc.data) notFound();

  const data = doc.data as unknown as KaldikData;
  const events = flattenEvents(data);
  const allDates = events.flatMap((e) => [e.start, e.end]).filter(Boolean).sort();
  const semesterMonths = (data.semester ?? [])
    .filter((s) => s.mulai && s.selesai)
    .flatMap((s) => monthsBetween(s.mulai, s.selesai));
  const months = semesterMonths.length > 0 ? semesterMonths : allDates.length > 0 ? monthsBetween(allDates[0], allDates[allDates.length - 1]) : [];
  const uniqueMonths = [...new Map(months.map((m) => [`${m.year}-${m.month}`, m])).values()];

  return (
    <>
      <Link href="/teacher/calendar" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="size-4" /> {t("Academic Calendar")}
      </Link>
      <PageHeader title={doc.title} description={data.catatan || undefined} />

      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", KIND_DOT[k])} />
            {t(label)}
          </span>
        ))}
      </div>

      {uniqueMonths.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">{t("No dates could be read from the source file.")}</p>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {uniqueMonths.map((m) => (
            <CalendarMonth key={`${m.year}-${m.month}`} year={m.year} month={m.month} events={events} />
          ))}
        </div>
      )}

      {(data.semester ?? []).map((s) => (
        <section key={s.nama} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{s.nama}</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            {[s.mulai && s.selesai ? `${formatDate(s.mulai)} – ${formatDate(s.selesai)}` : "", s.minggu_efektif ? t("{0} effective weeks", s.minggu_efektif) : "", s.hari_efektif ? t("{0} effective days", s.hari_efektif) : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {s.kegiatan.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No events listed.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{t("Date")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Event")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Kind")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.kegiatan.map((k, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{k.tanggal_mulai === k.tanggal_selesai ? formatDate(k.tanggal_mulai) : `${formatDate(k.tanggal_mulai)} – ${formatDate(k.tanggal_selesai)}`}</td>
                      <td className="px-4 py-2.5">{k.keterangan}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("size-2 rounded-full", KIND_DOT[k.jenis])} /> {t(KIND_LABEL[k.jenis] ?? k.jenis)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {(data.libur_nasional ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">{t("National holidays")}</h2>
          <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            {data.libur_nasional.map((l, i) => (
              <li key={i} className="flex items-baseline gap-2 rounded-lg border px-3 py-2">
                <span className={cn("size-2 shrink-0 self-center rounded-full", KIND_DOT.nasional)} />
                <span className="shrink-0 font-semibold">{formatDate(l.tanggal)}</span>
                <span className="min-w-0 break-words text-muted-foreground">{l.keterangan}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
