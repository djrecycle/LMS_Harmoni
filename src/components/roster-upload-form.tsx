"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Download, FileUp, LoaderCircle } from "lucide-react";
import { uploadRoster, type UploadResult } from "@/app/actions/roster";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

export function RosterUploadForm() {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [message, setMessage] = useState("");

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const r = await uploadRoster(fd);
      if (!r.ok) return setError(r.error ?? t("Could not import the file."));
      setResult(r.data ?? null);
      setMessage(r.message ?? "");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <a href="/api/roster/template">
            <Download /> {t("Download template (.xlsx)")}
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileUp /> {t("Choose file")}
        </Button>
        <span className="text-sm text-muted-foreground">{fileName || t("No file chosen")}</span>
        <Button onClick={upload} disabled={busy || !fileName}>
          {busy ? <LoaderCircle className="animate-spin" /> : <FileUp />} {t("Upload")}
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {result && (
        <div className="grid gap-3">
          <Alert kind={result.students.some((s) => !s.ok) ? "warning" : "success"}>{message}</Alert>
          {(result.classesCreated.length > 0 || result.classesReused.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              {result.classesCreated.map((c) => (
                <Badge key={`n-${c}`} tone="success">
                  {t("New:")} {c}
                </Badge>
              ))}
              {result.classesReused.map((c) => (
                <Badge key={`e-${c}`}>
                  {t("Existing:")} {c}
                </Badge>
              ))}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("Row")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Class")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Name")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Username")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Password")}</th>
                  <th className="px-3 py-2 font-semibold">{t("Result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.students.map((s) => (
                  <tr key={s.row}>
                    <td className="px-3 py-2 text-muted-foreground">{s.row}</td>
                    <td className="px-3 py-2">{s.className}</td>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2 font-mono">{s.username}</td>
                    <td className="px-3 py-2 font-mono">{s.password ?? "—"}</td>
                    <td className="px-3 py-2">
                      {s.ok ? (
                        <Badge tone="success">
                          <CircleCheck className="size-3" /> {t("Created")}
                        </Badge>
                      ) : (
                        <Badge tone="danger">
                          <CircleX className="size-3" /> {s.error}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("Write down the passwords shown above now — they are not saved anywhere and cannot be shown again. Reset a student's password from their class page.")}</p>
        </div>
      )}
    </div>
  );
}
