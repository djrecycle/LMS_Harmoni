"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { uploadCalendar } from "@/app/actions/calendar";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

export function CalendarUploadForm({ providers }: { providers: ProviderOption[] }) {
  const t = useT();
  const router = useRouter();
  const [pick, setPick] = useProviderPick();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pendingId) return;
    let stopped = false;
    async function tick() {
      const res = await fetch(`/api/calendar/${pendingId}/status`, { cache: "no-store" }).catch(() => null);
      if (stopped || !res) return;
      const json = await res.json().catch(() => null);
      if (!json || json.status === "pending") {
        if (!stopped) setTimeout(tick, 2500);
        return;
      }
      if (json.status === "done") toast.success(t("Calendar ready."));
      else toast.error(json.error ?? t("The import failed."));
      setPendingId(null);
      router.refresh();
    }
    tick();
    return () => {
      stopped = true;
    };
  }, [pendingId, router, t]);

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("provider", pick);
    uploadCalendar(fd).then((r) => {
      setBusy(false);
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not start the import."));
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      setPendingId(r.data.id);
      router.refresh();
    });
  }

  const noProvider = !providerReady(providers, pick);

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="text-lg font-bold">{t("Upload a Kalender Pendidikan file")}</h2>
      <p className="text-sm text-muted-foreground">{t("The AI reads your official calendar (.docx, .pdf, .xlsx, or .txt) and tidies it into a calendar you can browse here.")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <ProviderSelect options={providers} value={pick} onChange={setPick} />
        <input ref={fileRef} type="file" accept=".docx,.pdf,.xlsx,.txt" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy || !!pendingId}>
          <FileUp /> {t("Choose file")}
        </Button>
        <span className="text-sm text-muted-foreground">{fileName || t("No file chosen")}</span>
        <Button onClick={upload} disabled={busy || !!pendingId || !fileName || noProvider}>
          {busy || pendingId ? <LoaderCircle className="animate-spin" /> : <FileUp />} {pendingId ? t("The AI is reading the calendar…") : t("Upload")}
        </Button>
      </div>
      {noProvider && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
