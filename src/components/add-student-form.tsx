"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, UserPlus } from "lucide-react";
import { addStudentManually } from "@/app/actions/roster";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { firstNameBase } from "@/lib/username";
import { useT } from "@/i18n/client";

/** Add one student by hand: they get a username + password instead of registering themselves. */
export function AddStudentForm({ classroomId }: { classroomId: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  // The username follows the name ("rizky_27") until the teacher types one themselves.
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [suffix, setSuffix] = useState(randomSuffix);
  const [password, setPassword] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ username: string; password?: string } | null>(null);

  function onName(value: string) {
    setName(value);
    if (!usernameEdited) setUsername(value.trim() ? `${firstNameBase(value)}_${suffix}` : "");
  }

  function submit() {
    setError("");
    start(async () => {
      const r = await addStudentManually({ classroomId, name, username, password: password || undefined });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the account."));
      setCreated(r.data);
      setName("");
      setUsername("");
      setUsernameEdited(false);
      setSuffix(randomSuffix());
      setPassword("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus /> {t("Add a student by hand")}
      </Button>
    );
  }

  return (
    <div className="grid w-full gap-3 rounded-lg border bg-muted/40 p-3.5">
      {created ? (
        <Alert kind="success" title={t("Student account created")}>
          <p>
            {t("Username:")} <b className="font-mono">{created.username}</b>
          </p>
          {created.password && (
            <p>
              {t("Password:")} <b className="font-mono">{created.password}</b>
            </p>
          )}
          <p className="mt-1 text-xs">{t("Write this down now — the password is not saved anywhere and cannot be shown again.")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setCreated(null)}>
            {t("Add another")}
          </Button>
        </Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("Full name")} htmlFor="as-name">
              <Input id="as-name" value={name} onChange={(e) => onName(e.target.value)} maxLength={80} />
            </Field>
            <Field label={t("Username")} htmlFor="as-username" hint={t("Filled in from the first name — you can change it")}>
              <Input
                id="as-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase());
                  setUsernameEdited(true);
                }}
                maxLength={24}
              />
            </Field>
            <Field label={t("Password (optional)")} htmlFor="as-password" hint={t("Empty = generated automatically")}>
              <Input id="as-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
            </Field>
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={busy || name.trim().length < 2 || username.trim().length < 3}>
              {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />} {t("Create account")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t("Cancel")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const randomSuffix = () => 10 + Math.floor(Math.random() * 90);
