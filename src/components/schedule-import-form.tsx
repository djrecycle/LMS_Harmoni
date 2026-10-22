"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, LoaderCircle, Sparkles, Trash, X } from "lucide-react";
import { toast } from "sonner";
import { extractScheduleDraft, importScheduleRows, type ScheduleDraftRow } from "@/app/actions/schedule";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { DAYS, DAY_LABEL } from "@/lib/days";
import { useT } from "@/i18n/client";

const IMAGE_EXTS = [".jpg", ".jpeg", ".png"];

export function ScheduleImportForm({ providers }: { providers: ProviderOption[] }) {
  const t = useT();
  const router = useRouter();
  const [pick, setPick] = useProviderPick();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [isImage, setIsImage] = useState(false);
  const [extracting, startExtract] = useTransition();
  const [importing, startImport] = useTransition();
  const [rows, setRows] = useState<ScheduleDraftRow[] | null>(null);
  const [error, setError] = useState("");

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f?.name ?? "");
    setIsImage(!!f && IMAGE_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)));
    setRows(null);
    setError("");
  }

  function extract() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    startExtract(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("provider", pick);
      const r = await extractScheduleDraft(fd);
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not read the file."));
      setRows(r.data.rows);
      if (r.data.discarded) toast.warning(t("{0} entries from the AI were skipped because they were invalid.", r.data.discarded));
    });
  }

  function updateRow(i: number, patch: Partial<ScheduleDraftRow>) {
    setRows((rs) => rs && rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs && rs.filter((_, idx) => idx !== i));
  }

  function doImport() {
    if (!rows || rows.length === 0) return;
    setError("");
    startImport(async () => {
      const r = await importScheduleRows({ rows });
      if (!r.ok) return setError(r.error ?? t("Could not import the entries."));
      toast.success(r.message ?? t("Imported."));
      setRows(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const noProvider = !providerReady(providers, pick);
  const photoNeedsVisionProvider = isImage && pick !== "auto" && pick !== "anthropic" && pick !== "gemini" && pick !== "ollama";
  const busy = extracting || importing;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="text-lg font-bold">{t("Import schedule from a file")}</h2>
      <p className="text-sm text-muted-foreground">{t("The AI reads a timetable file or photo (.xlsx, .pdf, .docx, .jpg, .png) and drafts entries here for you to review before saving.")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <ProviderSelect options={providers} value={pick} onChange={setPick} disabled={busy} />
        <input ref={fileRef} type="file" accept=".xlsx,.pdf,.docx,.txt,.jpg,.jpeg,.png" className="sr-only" onChange={onFileChange} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileUp /> {t("Choose file")}
        </Button>
        <span className="text-sm text-muted-foreground">{fileName || t("No file chosen")}</span>
        <Button onClick={extract} disabled={busy || !fileName || noProvider || photoNeedsVisionProvider}>
          {extracting ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {extracting ? t("Reading…") : t("Read with AI")}
        </Button>
      </div>
      {photoNeedsVisionProvider && <Alert kind="warning">{t("Reading a photo needs the Anthropic API, the Gemini API or an Ollama vision model. Pick one of those, or choose Automatic.")}</Alert>}
      {noProvider && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {rows && (
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("{0} entries found — review before importing", rows.length)}</h3>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setRows(null)} aria-label={t("Close")}>
              <X className="size-4" />
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No entries left.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">{t("Day")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Start time")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("End time")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Subject")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Class")}</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Select value={r.hari} onChange={(e) => updateRow(i, { hari: e.target.value as ScheduleDraftRow["hari"] })} className="h-9 min-w-28 text-sm">
                          {DAYS.map((d) => (
                            <option key={d} value={d}>
                              {t(DAY_LABEL[d])}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="time" value={r.jamMulai} onChange={(e) => updateRow(i, { jamMulai: e.target.value })} className="h-9 w-36 text-sm" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="time" value={r.jamSelesai} onChange={(e) => updateRow(i, { jamSelesai: e.target.value })} className="h-9 w-36 text-sm" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={r.mataPelajaran} onChange={(e) => updateRow(i, { mataPelajaran: e.target.value })} className="h-9 min-w-36 text-sm" maxLength={120} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={r.kelas} onChange={(e) => updateRow(i, { kelas: e.target.value })} className="h-9 min-w-24 text-sm" maxLength={80} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => removeRow(i)} aria-label={t("Remove")}>
                          <Trash className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Button onClick={doImport} disabled={importing || rows.length === 0}>
              {importing ? <LoaderCircle className="animate-spin" /> : <FileUp />} {t("Import {0} entries", rows.length)}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
