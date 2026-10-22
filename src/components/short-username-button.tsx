"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, UserPen } from "lucide-react";
import { toast } from "sonner";
import { applyShortUsernames, previewShortUsernames, type UsernameChange } from "@/app/actions/roster";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { downloadCsv, fileSafe } from "@/lib/csv-download";
import { useT } from "@/i18n/client";

/**
 * Switches the class's teacher-created accounts to short usernames ("rizky_27"): shows the proposed
 * old → new list first, saves only the ticked rows, then offers the result as a CSV to hand out to students.
 */
export function ShortUsernameButton({ classroomId, className }: { classroomId: string; className: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [changes, setChanges] = useState<UsernameChange[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<UsernameChange[] | null>(null);
  const [error, setError] = useState("");

  function preview() {
    setError("");
    setDone(null);
    start(async () => {
      const r = await previewShortUsernames(classroomId);
      if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not change the usernames."));
      if (r.data.changes.length === 0) return void toast.info(t("Every username in this class is already short."));
      setSkip(new Set());
      setChanges(r.data.changes);
    });
  }

  function apply() {
    if (!changes) return;
    const chosen = changes.filter((c) => !skip.has(c.studentId));
    setError("");
    start(async () => {
      const r = await applyShortUsernames(
        classroomId,
        chosen.map((c) => ({ studentId: c.studentId, username: c.newUsername })),
      );
      if (!r.ok) return setError(r.error ?? t("Could not change the usernames."));
      toast.success(r.message);
      setChanges(null);
      setDone(chosen);
      router.refresh();
    });
  }

  const download = (rows: UsernameChange[]) =>
    downloadCsv(`username-baru-${fileSafe(className)}.csv`, [[t("Name"), t("Old username"), t("New username")], ...rows.map((r) => [r.name, r.oldUsername, r.newUsername])]);

  if (done) {
    return (
      <Alert kind="success" title={t("{0} usernames changed", done.length)}>
        <p>{t("Passwords stay the same. Give each student their new username before they log in again.")}</p>
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

  if (!changes) {
    return (
      <Button variant="secondary" size="sm" onClick={preview} disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <UserPen />} {t("Switch to short usernames")}
      </Button>
    );
  }

  const count = changes.length - skip.size;
  return (
    <div className="grid w-full gap-3 rounded-lg border bg-muted/40 p-3.5">
      <div>
        <p className="font-bold">{t("Switch to short usernames")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Check the new usernames below. Passwords, grades and progress don't change — but students must log in with the new username from now on.")}
        </p>
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-semibold">{t("Name")}</th>
              <th className="px-3 py-2 font-semibold">{t("Username: old → new")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {changes.map((c) => {
              const on = !skip.has(c.studentId);
              return (
                <tr key={c.studentId} className={on ? "" : "opacity-50"}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={on}
                      aria-label={c.name}
                      onChange={() =>
                        setSkip((s) => {
                          const next = new Set(s);
                          if (on) next.add(c.studentId);
                          else next.delete(c.studentId);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{c.name}</td>
                  {/* Old and new stacked in one cell: as two columns the new one was pushed off a phone screen. */}
                  <td className="px-3 py-2 font-mono">
                    <span className="block text-xs break-all text-muted-foreground line-through">{c.oldUsername}</span>
                    <span className="block font-semibold break-all">→ {c.newUsername}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={apply} disabled={busy || count === 0}>
          {busy ? <LoaderCircle className="animate-spin" /> : <UserPen />} {t("Change {0} usernames", count)}
        </Button>
        <Button size="sm" variant="outline" onClick={() => download(changes.filter((c) => !skip.has(c.studentId)))} disabled={busy || count === 0}>
          <Download /> {t("Download the list (CSV)")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setChanges(null)} disabled={busy}>
          {t("Cancel")}
        </Button>
      </div>
    </div>
  );
}
