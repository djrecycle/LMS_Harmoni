"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setSustain } from "@/lib/audio";

export type MidiStatus = "pending" | "not-supported" | "meminta" | "connected" | "ditolak";

const SUSTAIN_CC = 64;

/**
 * Web MIDI: connect a physical MIDI keyboard (USB, or Bluetooth once the OS has paired it). Permission is only
 *  requested when `connect()` is called (a user click). Web MIDI is not available on Safari/iOS; the UI must still
 *  work with the on-screen piano.
 *
 * The sustain pedal (CC 64) is applied to the sound directly (see `setSustain`); note on/off still follow the keys,
 *  so scoring and the lit keys match what the fingers do.
 */
export function useMidi(onNoteOn: (midi: number, velocity: number) => void, onNoteOff: (midi: number) => void) {
  const [status, setStatus] = useState<MidiStatus>("pending");
  const [device, setDevice] = useState<string[]>([]);
  const [pedal, setPedal] = useState(false);
  const cbOn = useRef(onNoteOn);
  const cbOff = useRef(onNoteOff);
  cbOn.current = onNoteOn;
  cbOff.current = onNoteOff;
  const accessRef = useRef<MIDIAccess | null>(null);
  // Listeners, not `onmidimessage`: several pianos on one page each listen to the same input.
  const listening = useRef(new Set<MIDIInput>());

  const onMessage = useCallback((e: MIDIMessageEvent) => {
    const [cmd, data1, data2] = e.data ?? [];
    const kind = cmd & 0xf0;
    if (kind === 0x90 && data2 > 0) cbOn.current(data1, data2 / 127);
    else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) cbOff.current(data1);
    else if (kind === 0xb0 && data1 === SUSTAIN_CC) {
      const down = data2 >= 64;
      setSustain(down);
      setPedal(down);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !("requestMIDIAccess" in navigator)) setStatus("not-supported");
    const set = listening.current;
    return () => {
      set.forEach((i) => i.removeEventListener("midimessage", onMessage));
      set.clear();
      if (accessRef.current) accessRef.current.onstatechange = null;
      setSustain(false); // never leave notes ringing after the piano is gone
    };
  }, [onMessage]);

  const attach = useCallback(
    (access: MIDIAccess) => {
      const list: string[] = [];
      access.inputs.forEach((input) => {
        // Some browsers keep an unplugged port in the map, marked "disconnected".
        if (input.state === "connected") list.push(input.name ?? "MIDI keyboard");
        if (!listening.current.has(input)) {
          input.addEventListener("midimessage", onMessage);
          listening.current.add(input);
        }
      });
      setDevice(list);
      if (!list.length) {
        // Keyboard unplugged or Bluetooth dropped with the pedal down: let the notes go.
        setSustain(false);
        setPedal(false);
      }
    },
    [onMessage],
  );

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

  return { status, device, pedal, connect };
}
