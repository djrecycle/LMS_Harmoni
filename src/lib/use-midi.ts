"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MidiStatus = "pending" | "not-supported" | "meminta" | "connected" | "ditolak";

/**
 * Web MIDI: connect a physical MIDI keyboard. Permission is only requested when `connect()` is called (a user click).
 *  Web MIDI is not available on Safari/iOS; the UI must still work with the on-screen piano.
 */
export function useMidi(onNoteOn: (midi: number, velocity: number) => void, onNoteOff: (midi: number) => void) {
  const [status, setStatus] = useState<MidiStatus>("pending");
  const [device, setDevice] = useState<string[]>([]);
  const cbOn = useRef(onNoteOn);
  const cbOff = useRef(onNoteOff);
  cbOn.current = onNoteOn;
  cbOff.current = onNoteOff;
  const accessRef = useRef<MIDIAccess | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !("requestMIDIAccess" in navigator)) setStatus("not-supported");
    return () => {
      accessRef.current?.inputs.forEach((i) => (i.onmidimessage = null));
    };
  }, []);

  const attach = useCallback((access: MIDIAccess) => {
    const list: string[] = [];
    access.inputs.forEach((input) => {
      list.push(input.name ?? "MIDI keyboard");
      input.onmidimessage = (e) => {
        const [cmd, note, velocity] = e.data ?? [];
        const kind = cmd & 0xf0;
        if (kind === 0x90 && velocity > 0) cbOn.current(note, velocity / 127);
        else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) cbOff.current(note);
      };
    });
    setDevice(list);
  }, []);

  const connect = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) return setStatus("not-supported");
    setStatus("meminta");
    try {
      const access = await navigator.requestMIDIAccess();
      accessRef.current = access;
      attach(access);
      access.onstatechange = () => attach(access);
      setStatus("connected");
    } catch {
      setStatus("ditolak");
    }
  }, [attach]);

  return { status, device, connect };
}
