"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileUp, LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { duplicateTemplate, deleteTemplate, importTemplate } from "@/app/actions/perangkat-template";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

export type TemplateRow = { id: string; name: string; description: string; summary: string; builtin: boolean };

export function TemplateManager({ templates }: { templates: TemplateRow[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState("");
  const [report, setReport] = useState<string[]>([]);
  const [error, setError] = useState("");

  function duplicate(id: string) {
    start(async () => {
      const r = await duplicateTemplate(id);
      if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not duplicate."));
      toast.success(r.message ?? t("Template duplicated."));
      router.push(`/teacher/perangkat-ajar/templates/${r.data.id}`);
    });
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setReport([]);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", name);
    start(async () => {
      const r = await importTemplate(fd);
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not import the file."));
      toast.success(r.message ?? t("Template created."));
      setReport(r.data.report);
      setName("");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 className="text-lg font-bold">{t("Create a template from your own file")}</h2>
          <p className="text-sm text-muted-foreground">{t("Upload a Modul Ajar or RPM you like. From a .docx the app detects the sections, numbering, and font; from a .pdf or .txt it only learns the writing style.")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={t("Template name (optional)")} htmlFor="tpl-name">
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".docx,.pdf,.txt" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <FileUp /> {t("Choose file")}
            </Button>
            <Button onClick={upload} disabled={busy || !fileName}>
              {busy ? <LoaderCircle className="animate-spin" /> : <FileUp />} {t("Create template")}
            </Button>
          </div>
        </div>
        {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
        {error && <Alert kind="error">{error}</Alert>}
        {report.length > 0 && (
          <Alert kind="success" title={t("What was detected")}>
            <ul className="list-disc pl-5">
              {report.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Alert>
        )}
      </section>

      <section className="grid gap-3">
        {templates.map((x) => (
          <div key={x.id} className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">{x.name}</h3>
              {x.builtin && <Badge tone="primary">{t("Built-in")}</Badge>}
              <span className="text-xs text-muted-foreground">{x.summary}</span>
            </div>
            {x.description && <p className="text-sm text-muted-foreground">{x.description}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/teacher/perangkat-ajar/templates/${x.id}`}>
                  <Pencil /> {x.builtin ? t("View") : t("Edit")}
                </Link>
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => duplicate(x.id)}>
                <Copy /> {t("Duplicate")}
              </Button>
              {!x.builtin && (
                <span className="ml-auto">
                  <DeleteButton action={deleteTemplate} id={x.id} onDone={() => router.refresh()} />
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
