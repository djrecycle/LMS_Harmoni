"use client";

import { useEffect, useId, useState } from "react";
import { CircleHelp, Usb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useMidi } from "@/lib/use-midi";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Midi = ReturnType<typeof useMidi>;
type Platform = "android" | "ios" | "windows" | "mac" | "linux";

/** Best guess of the viewer's device, only to put its instructions first. */
function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return null;
}

const PLATFORMS: { id: Platform; title: string; body: string }[] = [
  {
    id: "android",
    title: "Android",
    body: "Use Chrome. Pairing in the normal Bluetooth menu is not enough: connect the keyboard with an app such as MIDI BLE Connect first, then come back to this page.",
  },
  {
    id: "windows",
    title: "Windows",
    body: "Use Chrome or Edge. A USB cable always works. For Bluetooth, Windows 11 with the new Windows MIDI Services usually works; on older Windows install the keyboard maker's Bluetooth MIDI driver, or a bridge such as MIDIberry with loopMIDI.",
  },
  {
    id: "mac",
    title: "Mac",
    body: "Use Chrome or Edge. For Bluetooth, open Audio MIDI Setup → Window → Show MIDI Studio → the Bluetooth icon, then press Connect next to the keyboard.",
  },
  {
    id: "linux",
    title: "Linux / Chromebook",
    body: "Use Chrome. Pair the keyboard in the Bluetooth settings; it then shows up as a MIDI port.",
  },
  {
    id: "ios",
    title: "iPhone / iPad",
    body: "No browser on iPhone or iPad can use a MIDI keyboard, by cable or Bluetooth (Apple does not allow it). Use the on-screen piano.",
  },
];

/**
 * The MIDI keyboard control above a piano: the connect button (or the connected keyboard's name and the pedal),
 *  plus a help button with setup steps for each kind of device.
 *  `compact`: when MIDI is unavailable or denied, show only the help button (the reason is inside it).
 */
export function MidiConnect({ midi, compact = false, buttonSize }: { midi: Midi; compact?: boolean; buttonSize?: "sm" | "md" }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {midi.status === "connected" ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 font-semibold text-success">
          <Usb className="size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{midi.device.length ? midi.device.join(", ") : t("MIDI active, plug in a keyboard")}</span>
          {midi.pedal && <span className="shrink-0 rounded-full bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{t("Pedal")}</span>}
        </span>
      ) : midi.status === "pending" || midi.status === "meminta" ? (
        <Button variant="outline" size={buttonSize} aria-label={t("Connect MIDI keyboard")} onClick={midi.connect} disabled={midi.status === "meminta"}>
          <Usb /> <span className="hidden sm:tall:inline">{t("Connect MIDI keyboard")}</span>
        </Button>
      ) : compact ? null : midi.status === "not-supported" ? (
        <span className="text-muted-foreground">{t("MIDI keyboards are not supported in this browser")}</span>
      ) : (
        <span className="text-danger">{t("MIDI permission was denied. Change it in the site settings.")}</span>
      )}
      <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={t("How to connect a MIDI keyboard")} onClick={() => setOpen(true)}>
        <CircleHelp />
      </Button>
      {open && <MidiHelp status={midi.status} onClose={() => setOpen(false)} />}
    </div>
  );
}

function MidiHelp({ status, onClose }: { status: Midi["status"]; onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const [platform] = useState(detectPlatform);
  const firefox = typeof navigator !== "undefined" && /Firefox\//.test(navigator.userAgent);
  const list = platform ? [...PLATFORMS].sort((a, b) => Number(b.id === platform) - Number(a.id === platform)) : PLATFORMS;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // Not portalled: inside the browser's full screen only the full-screen element is visible.
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="grid max-h-[calc(100dvh-1.5rem)] w-full max-w-lg gap-3 overflow-y-auto rounded-2xl border bg-card p-4 text-sm shadow-lg sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-base font-bold">
            {t("Connecting a MIDI keyboard")}
          </h2>
          <Button autoFocus variant="ghost" size="icon" className="-mr-2 -mt-2 size-9" aria-label={t("Close")} onClick={onClose}>
            <X />
          </Button>
        </div>

        {status === "not-supported" && <p className="rounded-lg bg-muted p-3 font-semibold">{t("MIDI keyboards are not supported in this browser")}</p>}
        {status === "ditolak" && <p className="rounded-lg bg-danger-soft p-3 font-semibold text-danger">{t("MIDI permission was denied. Change it in the site settings.")}</p>}

        <p className="text-muted-foreground">
          {t("A USB cable works straight away. A Bluetooth keyboard must first be paired as a MIDI device on this phone or computer; then press Connect MIDI keyboard.")}
        </p>

        <ul className="grid gap-2">
          {list.map((p) => (
            <li key={p.id} className={cn("rounded-xl border p-3", p.id === platform && "border-primary bg-primary-soft/40")}>
              <p className="flex flex-wrap items-center gap-2 font-bold">
                {t(p.title)}
                {p.id === platform && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">{t("This device")}</span>}
              </p>
              <p className="mt-1 text-muted-foreground">{t(p.body)}</p>
            </li>
          ))}
        </ul>

        <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
          {firefox && <li>{t("Firefox asks to install a small permission add-on for this site. Chrome or Edge is simpler.")}</li>}
          <li>{t("Sustain pedal: plug it into the keyboard. It works here too, and a \"Pedal\" label lights up while it is pressed.")}</li>
          <li>{t("Keyboard not showing up? Turn it off and on, then reload this page.")}</li>
          <li>{t("Sound through Bluetooth headphones or speakers arrives late. When playing along, use wired headphones or the device's own speaker.")}</li>
        </ul>
      </div>
    </div>
  );
}
