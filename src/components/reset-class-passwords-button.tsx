"use client";

import { useState, useTransition } from "react";
import { Download, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { resetClassPasswords, type ResetPasswordRow } from "@/app/actions/roster";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { downloadCsv, fileSafe } from "@/lib/csv-download";
import { useT } from "@/i18n/client";

type Student = { id: string; name: string; username: string };

/**
 * Resets the passwords of the ticked students (teacher-created accounts only) to one new shared password,
 * shown once together with a CSV of name / username / password to hand out.
 */
export function ResetClassPasswordsButton({ classroomId, className, students }: { classroomId: string; className: string; students: Student[] }) {
  const t = useT();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ password: string; students: ResetPasswordRow[] } | null>(null);
  const [error, setError] = useState("");

  const chosen = students.filter((s) => !skip.has(s.id));

  function reset() {
    setError("");
    start(async () => {
      const r = await resetClassPasswords(
        classroomId,
        chosen.map((s) => s.id),
      );
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not reset the password."));
      toast.success(r.message);
      setOpen(false);
      setDone(r.data);
    });
  }

  const download = (d: { password: string; students: ResetPasswordRow[] }) =>
    downloadCsv(`password-baru-${fileSafe(className)}.csv`, [[t("Name"), t("Username"), t("Password")], ...d.students.map((s) => [s.name, s.username, d.password])]);

  if (done) {
    return (
      <Alert kind="success" title={t("{0} passwords reset", done.students.length)}>
        <p>
          {t("New password for all of them:")} <b className="font-mono text-base tracking-wider">{done.password}</b>
        </p>
        <p className="mt-1 text-xs">{t("Write this down or download the list now — the password is not saved anywhere and cannot be shown again.")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => download(done)}>
            <Download /> {t("Download the list (CSV)")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDone(null)}>
            {t("Close")}
          </Button>
        </div>
      </Alert>
    );
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setSkip(new Set());
          setError("");
          setOpen(true);
        }}
      >
        <KeyRound /> {t("Reset all passwords")}
      </Button>
    );
  }

  return (
    <div className="grid w-full gap-3 rounded-lg border bg-muted/40 p-3.5">
      <div>
        <p className="font-bold">{t("Reset all passwords")}</p>
        <p className="text-sm text-muted-foreground">
          {t("The ticked students get one new shared password. Their old password stops working right away. Students who signed up with their own email aren't listed.")}
        </p>
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={skip.size === 0}
                  aria-label={t("Select all")}
                  onChange={() => setSkip(skip.size === 0 ? new Set(students.map((s) => s.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 font-semibold">{t("Name")}</th>
              <th className="px-3 py-2 font-semibold">{t("Username")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s) => {
              const on = !skip.has(s.id);
              return (
                <tr key={s.id} className={on ? "" : "opacity-50"}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={on}
                      aria-label={s.name}
                      onChange={() =>
                        setSkip((prev) => {
                          const next = new Set(prev);
                          if (on) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 font-mono">{s.username}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={reset} disabled={busy || chosen.length === 0}>
          {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />} {t("Reset {0} passwords", chosen.length)}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          {t("Cancel")}
        </Button>
      </div>
    </div>
  );
}
