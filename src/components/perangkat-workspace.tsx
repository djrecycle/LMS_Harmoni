"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Download, FileUp, Library, LoaderCircle, Sparkles, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { importQuestionsToBank, saveMaterialFromDoc, startCpFromOfficial, startGeneration, startImportCp, suggestTopik } from "@/app/actions/perangkat";
import { PerangkatLibrary } from "@/components/perangkat-library";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import type { PerangkatSetting } from "@/lib/perangkat/store";
import { PROVIDER_LABEL, type CpGroup, type LibraryRow, type TemplateOption } from "@/lib/perangkat/view";
import { useT } from "@/i18n/client";

type Form = PerangkatSetting & { topik: string; tujuan_pembelajaran: string; catatan: string; jumlah_tp: string };

type Active = { id: string; kind: string; title: string; status: "pending" | "done" | "error"; error: string | null; provider: string | null; summary: string };

const POLL_MS = 2000;

export function PerangkatWorkspace({
  setting,
  templates,
  cpGroups,
  rows,
  remaining,
  limit,
  providers,
}: {
  setting: PerangkatSetting;
  templates: TemplateOption[];
  cpGroups: CpGroup[];
  rows: LibraryRow[];
  remaining: number;
  limit: number;
  providers: ProviderOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const [f, setF] = useState<Form>({ ...setting, topik: "", tujuan_pembelajaran: "", catatan: "", jumlah_tp: "" });
  const set = (p: Partial<Form>) => setF((a) => ({ ...a, ...p }));
  const [showIdentity, setShowIdentity] = useState(!setting.nama_guru || !setting.nama_sekolah);
  const [busy, startBusy] = useTransition();
  const [importText, setImportText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [officialText, setOfficialText] = useState("");
  const officialRef = useRef<HTMLInputElement>(null);
  const [officialName, setOfficialName] = useState("");
  const [error, setError] = useState("");
  const [modulKelas, setModulKelas] = useState("");
  const [suggesting, startSuggest] = useTransition();
  const [source, setSource] = useState<"cp" | "topik">("cp");

  /* -------- active generation (polled) -------- */
  const pendingRow = rows.find((r) => r.status === "pending");
  const [activeId, setActiveId] = useState<string | null>(pendingRow?.id ?? null);
  const [active, setActive] = useState<Active | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setElapsed(0);
    async function tick() {
      try {
        const res = await fetch(`/api/perangkat/${activeId}/status`, { cache: "no-store" });
        const json = (await res.json()) as Active & { error?: string };
        if (stopped) return;
        if (!res.ok) {
          setActive(null);
          setError(json.error ?? t("Document not found."));
          return;
        }
        setActive(json);
        if (json.status === "pending") timer = setTimeout(tick, POLL_MS);
        else {
          if (json.status === "done") toast.success(t("Document ready."));
          router.refresh();
        }
      } catch {
        if (!stopped) timer = setTimeout(tick, POLL_MS * 2);
      }
    }
    tick();
    const clock = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
    };
    // t and router are stable enough for this effect; re-running on them would restart the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const generating = active?.status === "pending" || (activeId !== null && active === null && !error);

  function started(id: string) {
    setError("");
    setActive(null);
    setActiveId(id);
    router.refresh();
  }

  function createModul() {
    setError("");
    startBusy(async () => {
      const r = await startGeneration({ kind: "modul_ajar", provider: pick, ...f });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not start the generation."));
      started(r.data.id);
    });
  }

  /** Form data with the context, the chosen provider, and a source document (uploaded file or pasted text). */
  function sourceForm(text: string, input: HTMLInputElement | null) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    fd.set("provider", pick);
    fd.set("source_text", text);
    const file = input?.files?.[0];
    if (file) fd.set("file", file);
    return fd;
  }

  function importCp() {
    setError("");
    const fd = sourceForm(importText, fileRef.current);
    startBusy(async () => {
      const r = await startImportCp(fd);
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not start the import."));
      setImportText("");
      if (fileRef.current) fileRef.current.value = "";
      setFileName("");
      started(r.data.id);
    });
  }

  function createCpFromOfficial() {
    setError("");
    const fd = sourceForm(officialText, officialRef.current);
    startBusy(async () => {
      const r = await startCpFromOfficial(fd);
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not start the generation."));
      setOfficialText("");
      if (officialRef.current) officialRef.current.value = "";
      setOfficialName("");
      started(r.data.id);
    });
  }

  /**
   * Choosing a TP fills the context from the CP-TP-ATP that holds it (subject, class, phase, school year, number of TP),
   * and the semester and time allocation from the ATP row of that TP.
   */
  function chooseTp(tp: string) {
    if (!tp) return set({ tujuan_pembelajaran: "" });
    const group = cpGroups.find((g) => g.tps.some((x) => x.tp === tp));
    const item = group?.tps.find((x) => x.tp === tp);
    setF((a) => ({
      ...a,
      ...(group?.context ?? {}),
      tujuan_pembelajaran: tp,
      ...(item?.semester ? { semester: item.semester } : {}),
      ...(item?.alokasi ? { alokasi_waktu: item.alokasi } : {}),
    }));
  }

  /** "Use its TPs" from the library: prefill what can be read from that CP-TP-ATP. */
  function useCp(cpId: string) {
    const g = cpGroups.find((x) => x.cpId === cpId);
    if (!g) return;
    setF((a) => ({ ...a, ...g.context }));
    toast.success(t("Context filled from this CP-TP-ATP. Now choose a TP for the Modul Ajar."));
    document.getElementById("perangkat-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Which classes the saved CP-TP-ATP documents cover, so "Pilih TP" can be narrowed to just one. */
  const modulKelasOptions = [...new Set(cpGroups.map((g) => g.context.kelas).filter((v): v is string => Boolean(v)))].sort();
  const tpGroups = modulKelas ? cpGroups.filter((g) => g.context.kelas === modulKelas) : cpGroups;

  function chooseModulKelas(kelas: string) {
    setModulKelas(kelas);
    set({ tujuan_pembelajaran: "" }); // the previous TP may not belong to the newly chosen class
  }

  /** Switching to "own topic" drops the chosen TP, so the Modul Ajar is built from the typed topic only. */
  function chooseSource(next: "cp" | "topik") {
    setSource(next);
    if (next === "topik") set({ tujuan_pembelajaran: "" });
  }

  /** Ask the AI for a short topic title summarizing the chosen TP, instead of typing one by hand. */
  function suggestTopic() {
    setError("");
    startSuggest(async () => {
      const r = await suggestTopik({ tujuan_pembelajaran: f.tujuan_pembelajaran, mata_pelajaran: f.mata_pelajaran, provider: pick });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not suggest a topic."));
      set({ topik: r.data.topik });
    });
  }

  const noProvider = !providerReady(providers, pick);
  const busyOrGenerating = busy || generating;
  const canModul = !noProvider && !busyOrGenerating && (f.topik.trim() !== "" || (source === "cp" && f.tujuan_pembelajaran.trim() !== ""));

  return (
    <div className="grid gap-5">
      {!anyProvider && (
        <Alert kind="warning" title={t("AI is not enabled yet")}>
          {t("Install Claude Code on the server and log in, or set")} <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> {t("or")} <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> {t("in the server settings (see the README), then restart the app.")}
        </Alert>
      )}

      {anyProvider && noProvider && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <ProviderSelect options={providers} value={pick} onChange={setPick} />
        <Badge tone={remaining > 0 ? "primary" : "danger"}>
          {t("Remaining today:")} {remaining}/{limit}
        </Badge>
        <Link href="/teacher/perangkat-ajar/templates" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <Settings2 className="size-4" /> {t("Manage Modul Ajar templates")}
        </Link>
      </div>

      {/* ---------------- 1. source: CP-TP-ATP or own topic ---------------- */}
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 className="text-lg font-bold">{t("1. CP – TP – ATP or Topic")}</h2>
          <p className="text-sm text-muted-foreground">{t("Use a CP-TP-ATP (upload your own or create one with AI), or type a topic outside the CP-TP-ATP.")}</p>
        </div>
        <div role="tablist" aria-label={t("Source of the Modul Ajar")} className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["cp", t("Use a CP – TP – ATP"), t("Upload, paste, or create one with AI, then choose a TP.")],
              ["topik", t("Use my own topic"), t("Without a CP-TP-ATP. Just type the topic.")],
            ] as const
          ).map(([value, label, desc]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={source === value}
              onClick={() => chooseSource(value)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${source === value ? "border-primary bg-primary-soft" : "border-border hover:bg-muted/50"}`}
            >
              <span className="block font-bold">{label}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>

        {source === "cp" && (
          <>
            <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:p-4">
              <div>
                <h3 className="font-bold">{t("Upload your CP – TP – ATP")}</h3>
                <p className="text-sm text-muted-foreground">{t("Upload it (.docx, .pdf, .txt) or paste the text. The AI only tidies it into the app's format, without inventing new content.")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} id="pa-file" type="file" accept=".docx,.pdf,.txt" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busyOrGenerating}>
                  <FileUp /> {t("Choose file")}
                </Button>
                <span className="text-sm text-muted-foreground">{fileName || t("No file chosen")}</span>
              </div>
              <Textarea rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={t("…or paste the text of your CP-TP-ATP here")} maxLength={200_000} aria-label={t("Text of your CP-TP-ATP")} />
              <div>
                <Button variant="secondary" onClick={importCp} disabled={noProvider || busyOrGenerating || (!fileName && importText.trim().length < 50)}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <FileUp />} {t("Tidy up and save")}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:p-4">
              <div>
                <h3 className="font-bold">{t("Don't have a CP – TP – ATP yet? Create one with AI from the official CP")}</h3>
                <p className="text-sm text-muted-foreground">{t("Upload the official CP document from the government (.docx, .pdf, .txt), only the part for your subject. The AI copies the CP exactly as written and only drafts the TP and ATP from it.")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={officialRef} id="pa-cp-resmi" type="file" accept=".docx,.pdf,.txt" className="sr-only" onChange={(e) => setOfficialName(e.target.files?.[0]?.name ?? "")} />
                <Button variant="outline" onClick={() => officialRef.current?.click()} disabled={busyOrGenerating}>
                  <FileUp /> {t("Choose official CP file")}
                </Button>
                <span className="text-sm text-muted-foreground">{officialName || t("No file chosen")}</span>
              </div>
              <Textarea rows={3} value={officialText} onChange={(e) => setOfficialText(e.target.value)} placeholder={t("…or paste the text of the official CP here")} maxLength={200_000} aria-label={t("Text of the official CP")} />
              {(!f.mata_pelajaran.trim() || !f.kelas.trim()) && <p className="text-sm text-muted-foreground">{t("Fill in Subject and Class in Identity (step 2) first.")}</p>}
              <p className="text-sm text-muted-foreground">{t("The TP and ATP are an AI draft. Check them before use.")}</p>
              <div>
                <Button onClick={createCpFromOfficial} disabled={noProvider || busyOrGenerating || !f.mata_pelajaran.trim() || !f.kelas.trim() || (!officialName && officialText.trim().length < 50)}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {t("Create CP – TP – ATP")}
                </Button>
              </div>
            </div>

            {cpGroups.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                {modulKelasOptions.length > 0 && (
                  <Field label={t("Choose a class")} htmlFor="pa-modul-kelas">
                    <Select id="pa-modul-kelas" value={modulKelas} onChange={(e) => chooseModulKelas(e.target.value)}>
                      <option value="">{t("All classes")}</option>
                      {modulKelasOptions.map((k) => (
                        <option key={k} value={k}>
                          {t("Class {0}", k)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label={t("Choose a TP from your CP-TP-ATP")} htmlFor="pa-tp" hint={t("The BAB, semester, and time allocation follow the ATP.")}>
                  <Select id="pa-tp" value={tpGroups.flatMap((g) => g.tps).some((x) => x.tp === f.tujuan_pembelajaran) ? f.tujuan_pembelajaran : ""} onChange={(e) => chooseTp(e.target.value)}>
                    <option value="">{t("— choose a TP —")}</option>
                    {tpGroups.length === 0 && <option disabled>{t("No TP for this class yet")}</option>}
                    {tpGroups.map((g) => {
                      const byBab = new Map<string, typeof g.tps>();
                      for (const x of g.tps) {
                        const semester = x.semester ? `${t("Semester")} ${x.semester}` : "";
                        const bab = x.babNomor ? `BAB ${x.babNomor}${x.babJudul ? ` — ${x.babJudul}` : ""}` : t("Other");
                        const key = semester ? `${semester} · ${bab}` : bab;
                        byBab.set(key, [...(byBab.get(key) ?? []), x]);
                      }
                      return [...byBab.entries()].map(([bab, items]) => (
                        <optgroup key={`${g.cpId}:${bab}`} label={tpGroups.length > 1 ? `${g.cpTitle} · ${bab}` : bab}>
                          {items.map((x) => (
                            <option key={x.tp} value={x.tp}>
                              {x.tp.length > 110 ? x.tp.slice(0, 110) + "…" : x.tp}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })}
                  </Select>
                </Field>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("After your CP-TP-ATP is saved, choose a TP from it here.")}</p>
            )}
            <Field label={t("Learning objective (TP)")} htmlFor="pa-tp-text" hint={t("Optional. Filled when you choose a TP above.")}>
              <Textarea id="pa-tp-text" rows={2} value={f.tujuan_pembelajaran} onChange={(e) => set({ tujuan_pembelajaran: e.target.value })} maxLength={600} />
            </Field>
          </>
        )}

        <Field label={t("Topic")} htmlFor="pa-topik" hint={source === "cp" ? t("Example: Simple rhythm patterns") : `${t("Example: Simple rhythm patterns")}. ${t("Required when not using a CP-TP-ATP.")}`}>
          <div className="flex gap-2">
            <Input id="pa-topik" value={f.topik} onChange={(e) => set({ topik: e.target.value })} maxLength={300} />
            {source === "cp" && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={!f.tujuan_pembelajaran.trim() || suggesting || noProvider}
                onClick={suggestTopic}
                aria-label={t("Suggest a topic from the TP")}
                title={f.tujuan_pembelajaran.trim() ? t("Suggest a topic from the TP") : t("Choose a TP first")}
              >
                {suggesting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              </Button>
            )}
          </div>
        </Field>
      </section>

      {/* ---------------- 2. identity (optional) ---------------- */}
      <section id="perangkat-form" className="grid scroll-mt-20 gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 className="text-lg font-bold">{t("2. Identity (optional)")}</h2>
          <p className="text-sm text-muted-foreground">{t("Filled automatically when you choose a TP. Leave it empty if not needed.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("Subject")} htmlFor="pa-mapel">
            <Input id="pa-mapel" value={f.mata_pelajaran} onChange={(e) => set({ mata_pelajaran: e.target.value })} maxLength={120} />
          </Field>
          <Field label={t("Class")} htmlFor="pa-kelas" hint={t("Example: VII")}>
            <Input id="pa-kelas" value={f.kelas} onChange={(e) => set({ kelas: e.target.value })} maxLength={40} />
          </Field>
          <Field label={t("Phase")} htmlFor="pa-fase" hint={t("Example: D")}>
            <Input id="pa-fase" value={f.fase} onChange={(e) => set({ fase: e.target.value })} maxLength={20} />
          </Field>
          <Field label={t("Semester")} htmlFor="pa-semester">
            <Input id="pa-semester" value={f.semester} onChange={(e) => set({ semester: e.target.value })} maxLength={40} />
          </Field>
          <Field label={t("School year")} htmlFor="pa-tahun" hint={t("Example: 2026/2027")}>
            <Input id="pa-tahun" value={f.tahun_ajaran} onChange={(e) => set({ tahun_ajaran: e.target.value })} maxLength={20} />
          </Field>
          <Field label={t("Time allocation")} htmlFor="pa-alokasi" hint={t("Example: 2 JP")}>
            <Input id="pa-alokasi" value={f.alokasi_waktu} onChange={(e) => set({ alokasi_waktu: e.target.value })} maxLength={80} />
          </Field>
          <Field label={t("Estimated number of TP in a year")} htmlFor="pa-jumlah" hint={t("Optional, for CP-TP-ATP")}>
            <Input id="pa-jumlah" inputMode="numeric" value={f.jumlah_tp} onChange={(e) => set({ jumlah_tp: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
          </Field>
        </div>

        <button type="button" onClick={() => setShowIdentity((v) => !v)} className="w-fit text-sm font-semibold text-primary hover:underline" aria-expanded={showIdentity}>
          {showIdentity ? t("Hide identity for the signature block") : t("Identity for the signature block")}
        </button>
        {showIdentity && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("School name")} htmlFor="pa-sekolah">
              <Input id="pa-sekolah" value={f.nama_sekolah} onChange={(e) => set({ nama_sekolah: e.target.value })} maxLength={160} />
            </Field>
            <Field label={t("Teacher name")} htmlFor="pa-guru">
              <Input id="pa-guru" value={f.nama_guru} onChange={(e) => set({ nama_guru: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t("Teacher NIP")} htmlFor="pa-nipguru">
              <Input id="pa-nipguru" value={f.nip_guru} onChange={(e) => set({ nip_guru: e.target.value })} maxLength={40} />
            </Field>
            <Field label={t("Headmaster name")} htmlFor="pa-kepala">
              <Input id="pa-kepala" value={f.nama_kepala} onChange={(e) => set({ nama_kepala: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t("Headmaster NIP")} htmlFor="pa-nipkepala">
              <Input id="pa-nipkepala" value={f.nip_kepala} onChange={(e) => set({ nip_kepala: e.target.value })} maxLength={40} />
            </Field>
            <Field label={t("City")} htmlFor="pa-kota">
              <Input id="pa-kota" value={f.kota} onChange={(e) => set({ kota: e.target.value })} maxLength={80} />
            </Field>
          </div>
        )}
      </section>

      {/* ---------------- 3. create the Modul Ajar ---------------- */}
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 className="text-lg font-bold">{t("3. Create Modul Ajar")}</h2>
          <p className="text-sm text-muted-foreground">{t("A teaching module for one objective (one BAB). Then make the teacher material and the student material from it in the library below.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Modul Ajar template")} htmlFor="pa-template">
            <Select id="pa-template" value={f.template_id} onChange={(e) => set({ template_id: e.target.value })}>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("Extra notes (optional)")} htmlFor="pa-catatan">
          <Textarea id="pa-catatan" rows={2} value={f.catatan} onChange={(e) => set({ catatan: e.target.value })} maxLength={1000} />
        </Field>
        {source === "cp" && f.tujuan_pembelajaran.trim() === "" && cpGroups.length > 0 && <p className="text-sm text-muted-foreground">{t("Without a TP, the BAB number will not follow the UNIT of your ATP.")}</p>}
        {!canModul && !busyOrGenerating && !noProvider && <p className="text-sm text-muted-foreground">{source === "cp" ? t("Choose a TP or type a topic in step 1 first.") : t("Type a topic in step 1 first.")}</p>}
        <div>
          <Button onClick={createModul} disabled={!canModul}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {t("Create Modul Ajar")}
          </Button>
        </div>

        {error && <Alert kind="error">{error}</Alert>}
      </section>

      {/* ---------------- result ---------------- */}
      {(activeId || active) && <ResultPanel active={active} generating={generating} elapsed={elapsed} />}

      {/* ---------------- library ---------------- */}
      <PerangkatLibrary provider={pick} rows={rows} templates={templates} cpGroups={cpGroups} busy={busyOrGenerating} onStarted={started} onView={(id) => { setError(""); setActive(null); setActiveId(id); }} onUseCp={useCp} />
    </div>
  );
}

function ResultPanel({ active, generating, elapsed }: { active: Active | null; generating: boolean; elapsed: number }) {
  const t = useT();
  const [saving, startSave] = useTransition();
  const [addingToLessons, startAddToLessons] = useTransition();
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{t("Result")}</h2>
        {active && active.provider && <Badge>{PROVIDER_LABEL[active.provider] ?? active.provider}</Badge>}
      </div>

      {generating && (
        <div className="flex items-center gap-3 rounded-lg bg-primary-soft p-4 text-sm font-semibold text-primary">
          <LoaderCircle className="size-5 animate-spin" />
          <span>{t("The AI is writing… this can take a few minutes. You can leave this page; the result will be in the library.")}</span>
          <span className="ml-auto tabular-nums">
            {mm}:{ss}
          </span>
        </div>
      )}

      {active?.status === "error" && <Alert kind="error">{active.error || t("The generation failed. Try again.")}</Alert>}

      {active?.status === "done" && (
        <>
          <p className="font-semibold">{active.title}</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">{active.summary}</pre>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`/api/perangkat/${active.id}/download`}>
                <Download /> {t("Download .docx")}
              </a>
            </Button>
            {(active.kind === "modul_ajar" || active.kind === "materi_guru") && (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  startSave(async () => {
                    const r = await importQuestionsToBank(active.id);
                    if (!r.ok) return void toast.error(r.error ?? t("Could not save the questions."));
                    toast.success(r.message ?? t("Saved."));
                  })
                }
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <BookOpenCheck />} {t("Save multiple-choice questions to the question bank")}
              </Button>
            )}
            {(active.kind === "materi_guru" || active.kind === "materi_siswa") && (
              <Button
                variant="secondary"
                disabled={addingToLessons}
                onClick={() =>
                  startAddToLessons(async () => {
                    const r = await saveMaterialFromDoc(active.id);
                    if (!r.ok) return void toast.error(r.error ?? t("Could not add to Lessons."));
                    toast.success(r.message ?? t("Added to Lessons."));
                  })
                }
              >
                {addingToLessons ? <LoaderCircle className="animate-spin" /> : <Library />} {t("Add to Lessons library")}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
