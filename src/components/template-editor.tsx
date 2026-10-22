"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { duplicateTemplate, saveTemplate } from "@/app/actions/perangkat-template";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { BENTUK, BENTUK_LABEL, BULLET, FONT_PILIHAN, JENIS_LABEL, PENOMORAN, UKURAN_MAKS, UKURAN_MIN, type BagianTemplate, type Template } from "@/lib/perangkat/template";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm font-semibold", disabled ? "opacity-60" : "cursor-pointer")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--primary)]" />
      {label}
    </label>
  );
}

export function TemplateEditor({ initial }: { initial: Template }) {
  const t = useT();
  const router = useRouter();
  const [tpl, setTpl] = useState<Template>(initial);
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const ro = initial.bawaan; // the built-in template is read-only
  const set = (p: Partial<Template>) => setTpl((a) => ({ ...a, ...p }));
  const setBagian = (i: number, p: Partial<BagianTemplate>) => setTpl((a) => ({ ...a, bagian: a.bagian.map((b, j) => (j === i ? { ...b, ...p } : b)) }));
  const move = (i: number, d: -1 | 1) =>
    setTpl((a) => {
      const j = i + d;
      if (j < 0 || j >= a.bagian.length) return a;
      const list = [...a.bagian];
      [list[i], list[j]] = [list[j], list[i]];
      return { ...a, bagian: list };
    });

  function save() {
    setError("");
    start(async () => {
      const r = await saveTemplate(tpl);
      if (!r.ok) return setError(r.error ?? t("Could not save the template."));
      toast.success(r.message ?? t("Template saved."));
      router.push("/teacher/perangkat-ajar/templates");
      router.refresh();
    });
  }

  function duplicate() {
    start(async () => {
      const r = await duplicateTemplate(tpl.id);
      if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not duplicate."));
      toast.success(r.message ?? t("Template duplicated."));
      router.push(`/teacher/perangkat-ajar/templates/${r.data.id}`);
    });
  }

  const box = "grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5";

  return (
    <div className="grid gap-5">
      {ro && (
        <Alert kind="info" title={t("Built-in template")}>
          {t("This template cannot be changed. Duplicate it to make your own version.")}{" "}
          <Button variant="secondary" size="sm" className="ml-2" onClick={duplicate} disabled={busy}>
            <Copy /> {t("Duplicate")}
          </Button>
        </Alert>
      )}

      <fieldset disabled={ro || busy} className="grid gap-5 disabled:opacity-90">
        <section className={box}>
          <h2 className="text-lg font-bold">{t("General")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Template name")} htmlFor="te-nama">
              <Input id="te-nama" value={tpl.nama} onChange={(e) => set({ nama: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t("Description")} htmlFor="te-desk">
              <Input id="te-desk" value={tpl.deskripsi} onChange={(e) => set({ deskripsi: e.target.value })} maxLength={300} />
            </Field>
            <Field label={t("Font")} htmlFor="te-font">
              <Select id="te-font" value={tpl.font} onChange={(e) => set({ font: e.target.value })}>
                {[...new Set([tpl.font, ...FONT_PILIHAN])].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Font size (pt)")} htmlFor="te-ukuran">
              <Input id="te-ukuran" type="number" min={UKURAN_MIN} max={UKURAN_MAKS} value={tpl.ukuran} onChange={(e) => set({ ukuran: Number(e.target.value) || 11 })} />
            </Field>
            <Field label={t("Numbering of section titles")} htmlFor="te-nom">
              <Select id="te-nom" value={tpl.penomoran} onChange={(e) => set({ penomoran: e.target.value as Template["penomoran"] })}>
                {Object.entries(PENOMORAN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Numbering of top-level titles")} htmlFor="te-nomu">
              <Select id="te-nomu" value={tpl.penomoran_utama} onChange={(e) => set({ penomoran_utama: e.target.value as Template["penomoran_utama"] })}>
                {Object.entries(PENOMORAN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Bullet style")} htmlFor="te-bullet">
              <Select id="te-bullet" value={tpl.bullet} onChange={(e) => set({ bullet: e.target.value as Template["bullet"] })}>
                {Object.entries(BULLET).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Check label={t("Show the cover block")} checked={tpl.tampilkan_sampul} onChange={(v) => set({ tampilkan_sampul: v })} />
            <Check label={t("Signature block at the end")} checked={tpl.tanda_tangan} onChange={(v) => set({ tanda_tangan: v })} />
          </div>
        </section>

        <section className={box}>
          <h2 className="text-lg font-bold">{t("Cover")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("Document title")} htmlFor="te-jd">
              <Input id="te-jd" value={tpl.judul_dokumen} onChange={(e) => set({ judul_dokumen: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t("Subtitle")} htmlFor="te-sj">
              <Input id="te-sj" value={tpl.subjudul} onChange={(e) => set({ subjudul: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t("Cover heading")} htmlFor="te-js">
              <Input id="te-js" value={tpl.judul_sampul} onChange={(e) => set({ judul_sampul: e.target.value })} maxLength={120} />
            </Field>
          </div>
          <Field label={t("Identity rows (one per line)")} htmlFor="te-ident" hint={t("Example: Nama Sekolah, Nama Penyusun, Mata Pelajaran, Fase / Kelas / Semester")}>
            <Textarea id="te-ident" rows={4} value={tpl.identitas_baris.join("\n")} onChange={(e) => set({ identitas_baris: e.target.value.split("\n") })} />
          </Field>
          <Check label={t("Identity table with borders")} checked={tpl.identitas_garis} onChange={(v) => set({ identitas_garis: v })} />
        </section>

        <section className={box}>
          <h2 className="text-lg font-bold">{t("Activity titles")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("Opening")} htmlFor="te-la">
              <Input id="te-la" value={tpl.label_awal} onChange={(e) => set({ label_awal: e.target.value })} maxLength={80} />
            </Field>
            <Field label={t("Main activity")} htmlFor="te-li">
              <Input id="te-li" value={tpl.label_inti} onChange={(e) => set({ label_inti: e.target.value })} maxLength={80} />
            </Field>
            <Field label={t("Closing")} htmlFor="te-lp">
              <Input id="te-lp" value={tpl.label_penutup} onChange={(e) => set({ label_penutup: e.target.value })} maxLength={80} />
            </Field>
          </div>
          <Check label={t("Number the activity titles like section titles")} checked={tpl.kegiatan_bernomor} onChange={(v) => set({ kegiatan_bernomor: v })} />
        </section>

        <section className={box}>
          <div>
            <h2 className="text-lg font-bold">{t("Sections")}</h2>
            <p className="text-sm text-muted-foreground">{t("Choose which sections appear and in what order. A section that is switched off is not written by the AI either.")}</p>
          </div>
          <ol className="grid gap-2">
            {tpl.bagian.map((b, i) => (
              <li key={b.kunci} className={cn("grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_11rem_10rem_auto] sm:items-center", !b.aktif && "bg-muted/40")}>
                <Check label="" checked={b.aktif} onChange={(v) => setBagian(i, { aktif: v })} />
                <Input value={b.judul} onChange={(e) => setBagian(i, { judul: e.target.value })} maxLength={120} aria-label={t("Section title")} />
                <Select value={b.jenis} onChange={(e) => setBagian(i, { jenis: e.target.value as BagianTemplate["jenis"] })} aria-label={t("Title kind")} className="text-sm">
                  {Object.entries(JENIS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                {BENTUK[b.kunci] ? (
                  <Select value={b.bentuk} onChange={(e) => setBagian(i, { bentuk: e.target.value })} aria-label={t("Display form")} className="text-sm">
                    {BENTUK[b.kunci].map((k) => (
                      <option key={k} value={k}>
                        {BENTUK_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span />
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="size-9" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("Move up")}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-9" onClick={() => move(i, 1)} disabled={i === tpl.bagian.length - 1} aria-label={t("Move down")}>
                    <ArrowDown />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={box}>
          <h2 className="text-lg font-bold">{t("Guidance for the AI")}</h2>
          <Field label={t("Extra instructions")} htmlFor="te-ins" hint={t("Followed by the AI when it writes a Modul Ajar with this template.")}>
            <Textarea id="te-ins" rows={4} value={tpl.instruksi} onChange={(e) => set({ instruksi: e.target.value })} maxLength={3000} />
          </Field>
          <Field label={t("Writing style sample")} htmlFor="te-gaya" hint={t("The AI copies only the language style, depth, and length from this text. Empty = the built-in sample.")}>
            <Textarea id="te-gaya" rows={10} value={tpl.gaya_contoh} onChange={(e) => set({ gaya_contoh: e.target.value })} maxLength={30000} />
          </Field>
        </section>
      </fieldset>

      {error && <Alert kind="error">{error}</Alert>}
      {!ro && (
        <div>
          <Button size="lg" onClick={save} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save template")}
          </Button>
        </div>
      )}
    </div>
  );
}
