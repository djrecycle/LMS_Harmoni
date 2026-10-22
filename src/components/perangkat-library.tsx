"use client";

import { useMemo, useState, useTransition } from "react";
import { BookOpenCheck, Download, Eye, FilePlus2, Library, LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { deleteDoc, importQuestionsToBank, saveMaterialFromDoc, setDocKelas, startDerived } from "@/app/actions/perangkat";
import { DeleteButton } from "@/components/delete-button";
import { KelasBadge } from "@/components/kelas-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import type { ProviderPick } from "@/components/provider-select";
import { PROVIDER_LABEL, type CpGroup, type LibraryRow, type TemplateOption } from "@/lib/perangkat/view";
import { useT } from "@/i18n/client";

const KIND_LABEL = {
  cp_tp_atp: "CP – TP – ATP",
  modul_ajar: "Modul Ajar",
  materi_guru: "Teacher material",
  materi_siswa: "Student material",
} as const;

const KIND_TONE = { cp_tp_atp: "primary", modul_ajar: "warning", materi_guru: "success", materi_siswa: "neutral" } as const;

export function PerangkatLibrary({
  provider,
  rows,
  templates,
  cpGroups,
  busy,
  onStarted,
  onView,
  onUseCp,
}: {
  provider: ProviderPick;
  rows: LibraryRow[];
  templates: TemplateOption[];
  cpGroups: CpGroup[];
  busy: boolean;
  onStarted: (id: string) => void;
  onView: (id: string) => void;
  onUseCp: (cpId: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"" | LibraryRow["kind"]>("");
  const [kelas, setKelas] = useState("");
  const [tplFor, setTplFor] = useState<Record<string, string>>({});
  const [working, startWork] = useTransition();
  const [workingId, setWorkingId] = useState("");

  const kelasOptions = useMemo(() => [...new Set(rows.map((r) => r.kelas).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!kind || r.kind === kind) && (!kelas || r.kelas === kelas) && (!q || r.title.toLowerCase().includes(q)));
  }, [rows, query, kind, kelas]);

  const hasCp = (id: string) => cpGroups.some((g) => g.cpId === id);

  function derive(sourceId: string, to: "materi_guru" | "materi_siswa") {
    setWorkingId(sourceId + to);
    startWork(async () => {
      const r = await startDerived({ sourceId, kind: to, provider });
      if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not start the generation."));
      onStarted(r.data.id);
    });
  }

  function toBank(id: string) {
    setWorkingId(id + "bank");
    startWork(async () => {
      const r = await importQuestionsToBank(id);
      if (!r.ok) return void toast.error(r.error ?? t("Could not save the questions."));
      toast.success(r.message ?? t("Saved."));
    });
  }

  function toLessons(id: string) {
    setWorkingId(id + "lessons");
    startWork(async () => {
      const r = await saveMaterialFromDoc(id);
      if (!r.ok) return void toast.error(r.error ?? t("Could not add to Lessons."));
      toast.success(r.message ?? t("Added to Lessons."));
    });
  }

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{t("Library")}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search title")} className="h-10 w-48 pl-9" aria-label={t("Search title")} />
          </div>
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 w-48" aria-label={t("Filter by type")}>
            <option value="">{t("All types")}</option>
            {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
              <option key={k} value={k}>
                {t(KIND_LABEL[k])}
              </option>
            ))}
          </Select>
          {kelasOptions.length > 0 && (
            <Select value={kelas} onChange={(e) => setKelas(e.target.value)} className="h-10 w-40" aria-label={t("Filter by class")}>
              <option value="">{t("All classes")}</option>
              {kelasOptions.map((k) => (
                <option key={k} value={k}>
                  {t("Class {0}", k)}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">{t("Nothing here yet. Create your first CP – TP – ATP above.")}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">{t("No document matches your search.")}</p>
      ) : (
        <ul className="grid gap-3">
          {shown.map((r) => {
            const done = r.status === "done";
            const isWorking = (suffix: string) => working && workingId === r.id + suffix;
            return (
              <li key={r.id} className="grid gap-2.5 rounded-lg border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={KIND_TONE[r.kind]}>{t(KIND_LABEL[r.kind])}</Badge>
                  <KelasBadge id={r.id} value={r.kelas} action={setDocKelas} />
                  {r.status === "pending" && (
                    <Badge tone="warning">
                      <LoaderCircle className="size-3 animate-spin" /> {t("Writing…")}
                    </Badge>
                  )}
                  {r.status === "error" && <Badge tone="danger">{t("Failed")}</Badge>}
                  {r.kind === "modul_ajar" && r.templateName && <Badge>{t("Template:")} {r.templateName}</Badge>}
                  {r.provider && <Badge>{PROVIDER_LABEL[r.provider] ?? r.provider}</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="font-semibold leading-snug">{r.title}</p>
                {r.status === "error" && r.error && <p className="text-sm text-danger">{t(r.error)}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onView(r.id)}>
                    <Eye /> {t("View")}
                  </Button>
                  {done && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/perangkat/${r.id}/download${r.kind === "modul_ajar" && tplFor[r.id] ? `?template=${encodeURIComponent(tplFor[r.id])}` : ""}`}>
                        <Download /> {t("Download .docx")}
                      </a>
                    </Button>
                  )}
                  {done && r.kind === "modul_ajar" && templates.length > 1 && (
                    <Select
                      value={tplFor[r.id] ?? r.templateId}
                      onChange={(e) => setTplFor((a) => ({ ...a, [r.id]: e.target.value }))}
                      className="h-9 w-52 text-sm"
                      aria-label={t("Template for the download")}
                    >
                      {templates.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {done && r.kind === "cp_tp_atp" && hasCp(r.id) && (
                    <Button variant="secondary" size="sm" onClick={() => onUseCp(r.id)}>
                      {t("Use its TPs")}
                    </Button>
                  )}
                  {done && r.kind === "modul_ajar" && (
                    <Button variant="secondary" size="sm" disabled={busy || working} onClick={() => derive(r.id, "materi_guru")}>
                      {isWorking("materi_guru") ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />} {t("Create teacher material")}
                    </Button>
                  )}
                  {done && r.kind === "materi_guru" && (
                    <Button variant="secondary" size="sm" disabled={busy || working} onClick={() => derive(r.id, "materi_siswa")}>
                      {isWorking("materi_siswa") ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />} {t("Create student material")}
                    </Button>
                  )}
                  {done && (r.kind === "modul_ajar" || r.kind === "materi_guru") && (
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => toBank(r.id)}>
                      {isWorking("bank") ? <LoaderCircle className="animate-spin" /> : <BookOpenCheck />} {t("Save questions to the question bank")}
                    </Button>
                  )}
                  {done && (r.kind === "materi_guru" || r.kind === "materi_siswa") && (
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => toLessons(r.id)}>
                      {isWorking("lessons") ? <LoaderCircle className="animate-spin" /> : <Library />} {t("Add to Lessons library")}
                    </Button>
                  )}
                  <span className="ml-auto">
                    <DeleteButton action={deleteDoc} id={r.id} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
