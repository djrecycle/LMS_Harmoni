"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { autoFillQuestionMeta, bulkSetQuestionMeta } from "@/app/actions/question";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useT } from "@/i18n/client";

type Ctx = { selected: Set<string>; toggle: (id: string) => void };
const BulkContext = createContext<Ctx>({ selected: new Set(), toggle: () => {} });

const KEEP = "__keep";
const CLEAR = "__clear";

/**
 * Wraps the question bank list: question cards render a <BulkCheckbox>, and once something is checked a
 * floating bar lets the teacher set the class and/or semester of every checked question at once.
 */
export function QuestionBulkEditor({ ids, kelasOptions, children }: { ids: string[]; kelasOptions: string[]; children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kelas, setKelas] = useState(KEEP);
  const [semester, setSemester] = useState(KEEP);
  const [busy, start] = useTransition();

  // Only count questions that are still on the page (filters may have hidden some).
  const visible = ids.filter((id) => selected.has(id));
  const allChecked = ids.length > 0 && visible.length === ids.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function apply() {
    const data: { ids: string[]; kelas?: string | null; semester?: number | null } = { ids: visible };
    if (kelas !== KEEP) data.kelas = kelas === CLEAR ? null : kelas;
    if (semester !== KEEP) data.semester = semester === CLEAR ? null : Number(semester);
    start(async () => {
      const r = await bulkSetQuestionMeta(data);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setSelected(new Set());
      setKelas(KEEP);
      setSemester(KEEP);
      router.refresh();
    });
  }

  const allKelas = [...new Set(["VII", "VIII", "IX", ...kelasOptions])];

  return (
    <BulkContext.Provider value={{ selected, toggle }}>
      {ids.length > 0 && (
        <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(ids))} />
          {t("Select all shown ({0})", ids.length)}
        </label>
      )}
      {children}
      {visible.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card/95 p-3 shadow-lg backdrop-blur">
          <span className="w-full text-sm font-bold sm:w-auto">{t("{0} questions selected", visible.length)}</span>
          <Select value={kelas} onChange={(e) => setKelas(e.target.value)} className="h-9 w-auto min-w-0 flex-1 sm:flex-none" aria-label={t("Class level")}>
            <option value={KEEP}>{t("Class: keep as is")}</option>
            {allKelas.map((k) => (
              <option key={k} value={k}>
                {t("Class {0}", k)}
              </option>
            ))}
            <option value={CLEAR}>{t("Clear class")}</option>
          </Select>
          <Select value={semester} onChange={(e) => setSemester(e.target.value)} className="h-9 w-auto min-w-0 flex-1 sm:flex-none" aria-label={t("Semester")}>
            <option value={KEEP}>{t("Semester: keep as is")}</option>
            <option value="1">{t("Semester 1 (odd)")}</option>
            <option value="2">{t("Semester 2 (even)")}</option>
            <option value={CLEAR}>{t("Clear semester")}</option>
          </Select>
          <Button size="sm" className="h-9" disabled={busy || (kelas === KEEP && semester === KEEP)} onClick={apply}>
            {busy ? t("Saving…") : t("Apply")}
          </Button>
          <Button variant="ghost" size="sm" className="h-9" disabled={busy} onClick={() => setSelected(new Set())}>
            <X /> {t("Cancel")}
          </Button>
        </div>
      )}
    </BulkContext.Provider>
  );
}

/** Checkbox on one question card. */
export function BulkCheckbox({ id }: { id: string }) {
  const t = useT();
  const { selected, toggle } = useContext(BulkContext);
  return <input type="checkbox" className="mt-1 size-4 shrink-0 cursor-pointer accent-primary" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={t("Select question")} />;
}

/** Notice + button that fills empty class/semester of existing questions from their topic. */
export function AutoFillMetaNotice({ missing }: { missing: number }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-3.5">
      <p className="min-w-0 flex-[1_1_16rem] text-sm">
        {t("{0} questions have no class or semester yet. They can be filled from the learning objective (TP) in Perangkat Ajar or from the lesson's class.", missing)}
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await autoFillQuestionMeta();
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
          })
        }
      >
        <WandSparkles /> {busy ? t("Filling…") : t("Fill automatically from TP / topic")}
      </Button>
    </div>
  );
}
