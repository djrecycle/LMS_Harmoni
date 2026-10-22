"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Mic, RotateCcw, Save, Square, Trash } from "lucide-react";
import { toast } from "sonner";
import { deleteRecording, saveRecording } from "@/app/actions/practice";
import { DeleteButton } from "@/components/delete-button";
import { Piano } from "@/components/piano";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { Translate } from "@/i18n";

const MIME_CANDIDATE = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const SECONDS_LIMIT = 180;

type Status = "idle" | "meminta" | "merekam" | "completed";
export type SavedRecording = { id: string; title: string; fileKey: string; durationSeconds: number | null; createdAt: string | Date };

function microphoneErrorMessage(e: unknown, t: Translate): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return t("Microphone permission was denied. Open the site settings in your browser (the padlock icon next to the address), allow the microphone, then reload the page.");
  if (name === "NotFoundError" || name === "OverconstrainedError") return t("No microphone found. Make sure your device has an active microphone.");
  if (name === "NotReadableError") return t("The microphone is being used by another app. Close that app, then try again.");
  return t("Could not access the microphone. Try reloading the page.");
}

const format = (d: number) => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;

export function Recorder({ list }: { list: SavedRecording[] }) {
  const t = useT();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [urlLokal, setUrlLokal] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunk = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedSeconds = useRef(0);

  const stopMicrophone = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
  }, []);

  useEffect(
    () => () => {
      stopMicrophone();
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    },
    [stopMicrophone],
  );
  useEffect(() => () => void (urlLokal && URL.revokeObjectURL(urlLokal)), [urlLokal]);

  const supported = typeof window === "undefined" ? true : Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  async function start() {
    setError("");
    if (!supported) {
      setError(window.isSecureContext ? t("This browser does not support audio recording.") : t("Recording needs a secure connection (HTTPS). Open the app through an https:// address."));
      return;
    }
    setStatus("meminta");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = MIME_CANDIDATE.find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunk.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunk.current.push(e.data);
      rec.onstop = () => {
        stopMicrophone();
        const b = new Blob(chunk.current, { type: rec.mimeType || mime || "audio/webm" });
        setBlob(b);
        setUrlLokal(URL.createObjectURL(b));
        setStatus("completed");
      };
      rec.onerror = () => {
        stopMicrophone();
        setError(t("Recording stopped because of an error. Try again."));
        setStatus("idle");
      };
      recorder.current = rec;
      rec.start(1000);
      elapsedSeconds.current = 0;
      setSeconds(0);
      setStatus("merekam");
      timer.current = setInterval(() => {
        elapsedSeconds.current += 1;
        setSeconds(elapsedSeconds.current);
        if (elapsedSeconds.current >= SECONDS_LIMIT) stop();
      }, 1000);
    } catch (e) {
      stopMicrophone();
      setError(microphoneErrorMessage(e, t));
      setStatus("idle");
    }
  }

  function repeat() {
    setBlob(null);
    setUrlLokal(null);
    setTitle("");
    setSeconds(0);
    setStatus("idle");
  }

  async function save() {
    if (!blob) return;
    if (!title.trim()) return void toast.error(t("Give the recording a title first."));
    setMenyimpan(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "recording", { type: blob.type }));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("Could not upload the recording."));
      const r = await saveRecording({ fileKey: data.key, title, mimeType: data.mime, durationSeconds: elapsedSeconds.current });
      if (!r.ok) throw new Error(r.error);
      toast.success(t("Recording saved. Your teacher can listen to it."));
      repeat();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Could not save the recording."));
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        {error && (
          <Alert kind="error" className="mb-4" title={t("Recording could not start")}>
            {error}
          </Alert>
        )}
        <div className="grid justify-items-center gap-4 text-center">
          {status !== "completed" ? (
            <>
              <button
                type="button"
                onClick={status === "merekam" ? stop : start}
                disabled={status === "meminta"}
                aria-label={status === "merekam" ? t("Stop recording") : t("Start recording")}
                className={`relative grid size-28 place-items-center rounded-full text-white shadow-lg transition-transform active:scale-95 ${status === "merekam" ? "bg-danger" : "bg-gradient-to-br from-rose-500 to-pink-600"}`}
              >
                {status === "merekam" && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" />}
                {status === "meminta" ? <LoaderCircle className="size-10 animate-spin" /> : status === "merekam" ? <Square className="relative size-10" /> : <Mic className="size-12" />}
              </button>
              <p className="text-3xl font-extrabold tabular-nums" role="timer">
                {format(seconds)}
              </p>
              <p className="text-sm text-muted-foreground">
                {status === "merekam" ? t("Recording… press the square to stop.") : status === "meminta" ? t("Allow microphone access in your browser…") : t("Press the microphone to start (max {0} minutes).", SECONDS_LIMIT / 60)}
              </p>
            </>
          ) : (
            <div className="grid w-full max-w-md gap-4 text-left">
              <p className="text-center text-sm font-semibold text-muted-foreground">{t("Listen to your recording (")}{format(seconds)})</p>
              {urlLokal && <audio controls src={urlLokal} className="w-full" />}
              <label className="text-sm font-semibold">
                {t("Recording title")}
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder={t("e.g. C scale practice")} className="mt-1.5" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={save} disabled={menyimpan}>
                  {menyimpan ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save")}
                </Button>
                <Button size="lg" variant="outline" onClick={repeat} disabled={menyimpan}>
                  <RotateCcw /> {t("Record again")}
                </Button>
                <Button size="lg" variant="ghost" onClick={repeat} disabled={menyimpan}>
                  <Trash /> {t("Discard")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <details className="rounded-2xl border bg-card p-4 shadow-xs">
        <summary className="cursor-pointer font-bold">{t("🎹 Play piano while recording")}</summary>
        <p className="mt-2 mb-3 text-sm text-muted-foreground">{t("The microphone records sound from the speakers. For best results, play your own instrument near the microphone, or turn up this piano's volume.")}</p>
        <Piano />
      </details>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t("Saved recordings (")}{list.length})</h2>
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No recordings yet.")}</p>
        ) : (
          <div className="grid gap-3">
            {list.map((r) => (
              <div key={r.id} className="grid gap-2 rounded-xl border bg-card p-3.5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(new Date(r.createdAt))}
                      {r.durationSeconds ? ` · ${format(r.durationSeconds)}` : ""}
                    </p>
                  </div>
                  <DeleteButton action={deleteRecording} id={r.id} onDone={() => router.refresh()} />
                </div>
                <audio controls preload="none" src={`/api/files/${r.fileKey}`} className="w-full" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
