"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrainerStatus } from "@/lib/ride/engine/types";
import {
  Characteristics,
  checkWebBluetoothSupport,
  fullUuid,
  isChooserCancelled,
  requestHeartRateDevice,
  requestTrainerDevice,
} from "@/lib/ride/trainer/web/bluetooth";
import type { BluetoothDeviceLike, WebBluetoothSupport } from "@/lib/ride/trainer/web/bluetooth";
import { browserClock } from "@/lib/ride/trainer/web/clock";
import { characteristicDecoders } from "@/lib/ride/trainer/web/codec";
import type { CyclingPowerMeasurement, FitnessMachineStatus, HeartRateMeasurement, IndoorBikeData } from "@/lib/ride/trainer/web/codec";
import {
  evaluateChecks,
  judgeTargetTest,
  newTargetTest,
  RATE_WINDOW_MS,
  trackTargetPower,
} from "@/lib/ride/trainer/web/diagnosticChecks";
import type { CheckState, DiagnosticSnapshot, LiveReading, TargetTest } from "@/lib/ride/trainer/web/diagnosticChecks";
import { FakeFtmsDevice } from "@/lib/ride/trainer/web/FakeFtmsDevice";
import { errorMessage } from "@/lib/ride/trainer/web/link";
import { WebBluetoothTrainer } from "@/lib/ride/trainer/web/WebBluetoothTrainer";
import type { DiagnosticEvent, TrainerDiagnostics as Diagnostics } from "@/lib/ride/trainer/web/WebBluetoothTrainer";
import { WebHeartRateMonitor } from "@/lib/ride/trainer/web/WebHeartRateMonitor";

// /ride/devices: connect a trainer and a heart rate strap, watch raw
// characteristics, send targets, and see each hardware test script step pass
// or fail (docs/hardware-testing.md).

interface LogEntry {
  id: number;
  atMs: number;
  level: "info" | "warn" | "error" | "raw";
  source: "trainer" | "heart rate" | "page";
  message: string;
}

interface CaptureEntry {
  characteristic: string;
  hex: string;
  tMs: number;
}

const TARGET_PRESETS = [150, 250, 100, 30];
const CAPTURE_MS = 30_000;
const MAX_LOG = 400;

// Maps a notification's characteristic name to the UUID the services table shows.
const characteristicUuidByName: Record<string, string> = {
  indoorBikeData: fullUuid(Characteristics.indoorBikeData),
  cyclingPowerMeasurement: fullUuid(Characteristics.cyclingPowerMeasurement),
  cyclingPowerFeature: fullUuid(Characteristics.cyclingPowerFeature),
  heartRateMeasurement: fullUuid(Characteristics.heartRateMeasurement),
  fitnessMachineFeature: fullUuid(Characteristics.fitnessMachineFeature),
  supportedPowerRange: fullUuid(Characteristics.supportedPowerRange),
  controlPointResponse: fullUuid(Characteristics.fitnessMachineControlPoint),
  fitnessMachineStatus: fullUuid(Characteristics.fitnessMachineStatus),
  wahooTrainer: fullUuid(Characteristics.wahooTrainer),
};

const unsupportedMessages: Record<Exclude<WebBluetoothSupport, { supported: true }>["reason"], { title: string; body: string }> = {
  noApi: {
    title: "This browser cannot talk to a trainer",
    body: "Web Bluetooth is only available in Chrome, Edge and Opera on macOS, Windows, Android and ChromeOS. Firefox, Safari and every browser on iPhone and iPad lack it.",
  },
  insecureContext: {
    title: "This page needs a secure connection",
    body: "Web Bluetooth only works on https:// pages or on http://localhost. Open the page over HTTPS, or run the app locally.",
  },
  noAdapter: {
    title: "Bluetooth is off or unavailable",
    body: "Turn Bluetooth on. On macOS, also allow the browser in System Settings > Privacy & Security > Bluetooth, then reload.",
  },
};

const statusStyles: Record<TrainerStatus, string> = {
  disconnected: "border-slate-700 bg-slate-800 text-slate-300",
  connecting: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  connected: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  reconnecting: "animate-pulse border-amber-300/50 bg-amber-300/15 text-amber-100",
};

const checkStyles: Record<CheckState, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-emerald-400/15 text-emerald-200 border-emerald-400/40" },
  fail: { label: "Fail", className: "bg-rose-400/15 text-rose-200 border-rose-400/40" },
  waiting: { label: "Waiting", className: "bg-amber-300/10 text-amber-100 border-amber-300/30" },
  manual: { label: "Observe", className: "bg-slate-800 text-slate-300 border-slate-700" },
};

const buttonClass =
  "border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-700";
const primaryButtonClass =
  "bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "rounded-xl border border-slate-800 bg-slate-900/80 p-4";
const headingClass = "text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300";

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function StatusPill({ status, label }: { status: TrainerStatus | null; label: string }) {
  const value = status ?? "disconnected";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[value]}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      {label}: {value}
    </span>
  );
}

function CheckBadge({ state }: { state: CheckState }) {
  const style = checkStyles[state];
  return (
    <span className={`inline-block w-20 shrink-0 self-start rounded border px-2 py-0.5 text-center text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-3xl font-semibold text-white tabular-nums">
        {value}
        <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function freshness(reading: LiveReading | null, nowMs: number): string {
  if (!reading) return "no data yet";
  const age = nowMs - reading.atMs;
  const rate = reading.recentCount / (RATE_WINDOW_MS / 1000);
  return age > 3000 ? `stale: last ${seconds(age)} s ago` : `${rate.toFixed(1)} updates/s`;
}

export function TrainerDiagnostics({ fake }: { fake: boolean }) {
  const [support, setSupport] = useState<WebBluetoothSupport | null>(null);
  const [trainerStatus, setTrainerStatus] = useState<TrainerStatus | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [indoorBikeData, setIndoorBikeData] = useState<LiveReading | null>(null);
  const [cyclingPower, setCyclingPower] = useState<LiveReading | null>(null);
  const [heartRate, setHeartRate] = useState<DiagnosticSnapshot["heartRate"]>(null);
  const [heartRateName, setHeartRateName] = useState<string | null>(null);
  const [targetTests, setTargetTests] = useState<TargetTest[]>([]);
  const [gaveUp, setGaveUp] = useState(false);
  const [lastReconnectMs, setLastReconnectMs] = useState<number | null>(null);
  const [controlLostEvents, setControlLostEvents] = useState(0);
  const [machineStatusEvents, setMachineStatusEvents] = useState(0);
  const [lastHex, setLastHex] = useState<Record<string, string>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [customWatts, setCustomWatts] = useState("200");
  const [captureEndsAt, setCaptureEndsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [fakePoweredOn, setFakePoweredOn] = useState(true);
  const [targetWatts, setTargetWatts] = useState<number | null>(null);

  const trainerRef = useRef<WebBluetoothTrainer | null>(null);
  const trainerUnsubscribe = useRef<(() => void) | null>(null);
  const heartRateRef = useRef<WebHeartRateMonitor | null>(null);
  const heartRateUnsubscribe = useRef<(() => void) | null>(null);
  const fakeDeviceRef = useRef<FakeFtmsDevice | null>(null);
  const logId = useRef(0);
  const showRawRef = useRef(showRaw);
  const captureRef = useRef<{ startedAtMs: number; entries: CaptureEntry[] } | null>(null);
  const recentRef = useRef<Record<string, number[]>>({});
  const reconnectStartedAt = useRef<number | null>(null);

  useEffect(() => {
    showRawRef.current = showRaw;
  }, [showRaw]);

  useEffect(() => {
    if (fake) return;
    let cancelled = false;
    void checkWebBluetoothSupport(window as unknown as Parameters<typeof checkWebBluetoothSupport>[0]).then((result) => {
      if (!cancelled) setSupport(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fake]);

  // Freshness indicators and the checklist depend on elapsed time.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(browserClock.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const addLog = useCallback((source: LogEntry["source"], level: LogEntry["level"], message: string, atMs = browserClock.now()) => {
    const entry: LogEntry = { id: ++logId.current, atMs, level, source, message };
    setLog((previous) => [entry, ...previous].slice(0, MAX_LOG));
  }, []);

  // Counts notifications per characteristic over the rate window.
  const countRecent = useCallback((key: string, atMs: number): number => {
    const list = (recentRef.current[key] ?? []).filter((t) => atMs - t < RATE_WINDOW_MS);
    list.push(atMs);
    recentRef.current[key] = list;
    return list.length;
  }, []);

  const handleNotification = useCallback(
    (source: LogEntry["source"], event: Extract<DiagnosticEvent, { type: "notification" }>) => {
      const { characteristic, hex, atMs } = event;
      setLastHex((previous) => ({ ...previous, [characteristicUuidByName[characteristic] ?? characteristic]: hex }));
      if (showRawRef.current) {
        addLog(source, "raw", `${characteristic} ${hex}${event.error ? ` (decode error: ${event.error})` : ""}`, atMs);
      } else if (event.error) {
        addLog(source, "warn", `Could not decode ${characteristic} ${hex}: ${event.error}`, atMs);
      }
      const capture = captureRef.current;
      if (capture && characteristic in characteristicDecoders) {
        capture.entries.push({ characteristic, hex, tMs: Math.round(atMs - capture.startedAtMs) });
      }
      if (event.error) return;

      if (characteristic === "indoorBikeData") {
        const data = event.decoded as IndoorBikeData;
        const recentCount = countRecent(characteristic, atMs);
        setIndoorBikeData((previous) => ({
          atMs,
          powerWatts: data.powerWatts ?? previous?.powerWatts,
          cadenceRpm: data.cadenceRpm ?? previous?.cadenceRpm,
          recentCount,
        }));
        if (data.powerWatts !== undefined) {
          const power = data.powerWatts;
          setTargetTests((tests) => (tests.length ? [...tests.slice(0, -1), trackTargetPower(tests.at(-1)!, power, atMs)] : tests));
        }
      } else if (characteristic === "cyclingPowerMeasurement") {
        const data = event.decoded as CyclingPowerMeasurement;
        const recentCount = countRecent(characteristic, atMs);
        setCyclingPower({ atMs, powerWatts: data.powerWatts, cadenceRpm: event.derived?.cadenceRpm, recentCount });
        // Without FTMS, Cycling Power is the only power source to judge targets by.
        if (!trainerRef.current?.diagnostics.hasFtms) {
          setTargetTests((tests) =>
            tests.length ? [...tests.slice(0, -1), trackTargetPower(tests.at(-1)!, data.powerWatts, atMs)] : tests,
          );
        }
      } else if (characteristic === "fitnessMachineStatus") {
        setMachineStatusEvents((count) => count + 1);
        if ((event.decoded as FitnessMachineStatus).type === "controlPermissionLost") setControlLostEvents((count) => count + 1);
      } else if (characteristic === "heartRateMeasurement") {
        const data = event.decoded as HeartRateMeasurement;
        setHeartRate((previous) =>
          previous ? { ...previous, bpm: data.heartRateBpm, firstSampleAtMs: previous.firstSampleAtMs ?? atMs } : previous,
        );
      }
    },
    [addLog, countRecent],
  );

  const attachTrainer = useCallback(
    (trainer: WebBluetoothTrainer) => {
      trainerUnsubscribe.current?.();
      const offs = [
        trainer.on("status", (status) => {
          setTrainerStatus(status);
          const now = browserClock.now();
          if (status === "reconnecting") {
            reconnectStartedAt.current = now;
            setGaveUp(false);
          } else if (status === "connected" && reconnectStartedAt.current !== null) {
            setLastReconnectMs(now - reconnectStartedAt.current);
            reconnectStartedAt.current = null;
          } else if (status === "connecting") {
            setGaveUp(false);
          }
        }),
        trainer.on("disconnect", ({ reason }) => {
          if (reason === "link lost") setGaveUp(true);
          reconnectStartedAt.current = null;
        }),
        trainer.on("diagnostic", (event) => {
          if (event.type === "log") addLog("trainer", event.level, event.message, event.atMs);
          else if (event.type === "notification") handleNotification("trainer", event);
          else setDiagnostics(trainer.diagnostics);
        }),
      ];
      trainerUnsubscribe.current = () => offs.forEach((off) => off());
    },
    [addLog, handleNotification],
  );

  // Leave the hardware in a clean state when the page goes away.
  useEffect(
    () => () => {
      trainerUnsubscribe.current?.();
      heartRateUnsubscribe.current?.();
      void trainerRef.current?.disconnect();
      void heartRateRef.current?.disconnect();
    },
    [],
  );

  const bluetooth = support?.supported ? support.bluetooth : null;
  const canUseBluetooth = fake || bluetooth !== null;

  async function connectTrainer() {
    let device: BluetoothDeviceLike;
    if (fake) {
      fakeDeviceRef.current ??= new FakeFtmsDevice(browserClock);
      device = fakeDeviceRef.current;
    } else {
      if (!bluetooth) return;
      try {
        device = await requestTrainerDevice(bluetooth);
      } catch (error) {
        if (isChooserCancelled(error)) {
          addLog("page", "info", "Chooser closed without picking a trainer. If the list was empty on macOS, allow the browser in System Settings > Privacy & Security > Bluetooth.");
        } else {
          addLog("page", "error", `Chooser failed: ${errorMessage(error)}`);
        }
        return;
      }
    }
    let trainer = trainerRef.current;
    if (!trainer || trainer.device !== device) {
      trainerUnsubscribe.current?.();
      await trainer?.disconnect();
      trainer = new WebBluetoothTrainer(device, { clock: browserClock });
      trainerRef.current = trainer;
      attachTrainer(trainer);
      setTargetTests([]);
      setDiagnostics(null);
      setIndoorBikeData(null);
      setCyclingPower(null);
      setLastHex({});
    }
    setDeviceName(trainer.name);
    addLog("page", "info", `Connecting to ${trainer.name}...`);
    try {
      await trainer.connect();
      setDiagnostics(trainer.diagnostics);
      addLog("page", "info", `Connected to ${trainer.name}.`);
    } catch (error) {
      addLog("page", "error", `Could not connect: ${errorMessage(error)}`);
    }
  }

  async function reconnectTrainer() {
    const trainer = trainerRef.current;
    if (!trainer) return;
    try {
      await trainer.connect();
      addLog("page", "info", `Reconnected to ${trainer.name} without the chooser.`);
    } catch (error) {
      addLog("page", "error", `Could not reconnect: ${errorMessage(error)}`);
    }
  }

  async function disconnectTrainer() {
    await trainerRef.current?.disconnect();
    addLog("page", "info", "Trainer disconnected.");
  }

  async function connectHeartRate() {
    if (!bluetooth) return;
    let device: BluetoothDeviceLike;
    try {
      device = await requestHeartRateDevice(bluetooth);
    } catch (error) {
      addLog("page", isChooserCancelled(error) ? "info" : "error", isChooserCancelled(error) ? "Chooser closed without picking a strap." : `Chooser failed: ${errorMessage(error)}`);
      return;
    }
    heartRateUnsubscribe.current?.();
    await heartRateRef.current?.disconnect();
    const monitor = new WebHeartRateMonitor(device, browserClock);
    heartRateRef.current = monitor;
    setHeartRateName(monitor.name);
    const offs = [
      monitor.on("status", (status) => {
        setHeartRate((previous) => ({
          status,
          connectedAtMs: status === "connected" ? (previous?.connectedAtMs ?? browserClock.now()) : (previous?.connectedAtMs ?? null),
          firstSampleAtMs: previous?.firstSampleAtMs ?? null,
          bpm: previous?.bpm ?? null,
        }));
      }),
      monitor.on("diagnostic", (event) => {
        if (event.type === "log") addLog("heart rate", event.level, event.message, event.atMs);
        else if (event.type === "notification") handleNotification("heart rate", event);
      }),
    ];
    heartRateUnsubscribe.current = () => offs.forEach((off) => off());
    setHeartRate({ status: "connecting", connectedAtMs: null, firstSampleAtMs: null, bpm: null });
    try {
      await monitor.connect();
      addLog("page", "info", `Heart rate strap ${monitor.name} connected.`);
    } catch (error) {
      addLog("page", "error", `Could not connect the strap: ${errorMessage(error)}`);
    }
  }

  async function disconnectHeartRate() {
    await heartRateRef.current?.disconnect();
    setHeartRate((previous) => (previous ? { ...previous, status: "disconnected" } : previous));
    addLog("page", "info", "Heart rate strap disconnected.");
  }

  async function setTarget(watts: number) {
    const trainer = trainerRef.current;
    if (!trainer || !Number.isFinite(watts)) return;
    const sentAtMs = browserClock.now();
    setTargetTests((tests) => [...tests, newTargetTest(watts, sentAtMs)]);
    const result = await trainer.setTargetPower(watts);
    const latencyMs = browserClock.now() - sentAtMs;
    setTargetWatts(trainer.targetWatts);
    setTargetTests((tests) => tests.map((t) => (t.sentAtMs === sentAtMs ? { ...t, result, latencyMs } : t)));
  }

  async function requestControl() {
    const granted = await trainerRef.current?.requestControl();
    addLog("page", granted ? "info" : "warn", granted ? "Control granted." : "Control was not granted.");
  }

  async function ergOff() {
    await trainerRef.current?.setErgEnabled(false);
    addLog("page", "info", "ERG off requested (flat road simulation).");
  }

  async function ergOn() {
    await trainerRef.current?.setErgEnabled(true);
    addLog("page", "info", "ERG on: last target re-sent.");
  }

  async function readCharacteristic(uuid: string) {
    try {
      const hex = await trainerRef.current!.readCharacteristic(uuid);
      setLastHex((previous) => ({ ...previous, [uuid]: hex }));
      addLog("page", "info", `Read ${uuid}: ${hex}`);
    } catch (error) {
      addLog("page", "error", `Read failed: ${errorMessage(error)}`);
    }
  }

  function startCapture() {
    captureRef.current = { startedAtMs: browserClock.now(), entries: [] };
    setCaptureEndsAt(browserClock.now() + CAPTURE_MS);
    addLog("page", "info", "Recording 30 s of raw notifications. Pedal, and set a target or two.");
    window.setTimeout(() => {
      const capture = captureRef.current;
      captureRef.current = null;
      setCaptureEndsAt(null);
      if (!capture) return;
      const info = trainerRef.current?.diagnostics.deviceInformation;
      const firmware = (info?.firmware ?? "unknown").replace(/[^0-9A-Za-z.-]+/g, "_");
      const file = {
        device: trainerRef.current?.name ?? null,
        deviceInformation: info ?? null,
        recordedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        notifications: capture.entries,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `kickr-core-${firmware}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addLog("page", "info", `Saved ${capture.entries.length} notifications as ${link.download}.`);
    }, CAPTURE_MS);
  }

  function fakePower(on: boolean) {
    const device = fakeDeviceRef.current;
    if (!device) return;
    if (on) device.powerOn();
    else device.powerOff();
    setFakePoweredOn(on);
    addLog("page", "info", on ? "Fake trainer powered on." : "Fake trainer unplugged.");
  }

  const snapshot: DiagnosticSnapshot = {
    nowMs,
    trainerStatus,
    deviceName,
    diagnostics,
    indoorBikeData,
    cyclingPower,
    heartRate,
    targetTests,
    gaveUp,
    lastReconnectMs,
    controlLostEvents,
    machineStatusEvents,
  };
  const checks = evaluateChecks(snapshot);
  const connected = trainerStatus === "connected";
  const canControl = connected && diagnostics?.controlPath !== "none";
  const latestTarget = targetTests.at(-1);
  const powerGap =
    indoorBikeData?.powerWatts !== undefined && cyclingPower?.powerWatts !== undefined
      ? Math.abs(indoorBikeData.powerWatts - cyclingPower.powerWatts)
      : null;

  if (!fake && support && !support.supported) {
    const message = unsupportedMessages[support.reason];
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className={headingClass}>Trainer diagnostics</p>
        <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-5 text-amber-100">
          <h1 className="text-xl font-semibold text-white">{message.title}</h1>
          <p className="mt-2 text-sm leading-6">{message.body}</p>
          <a href="/ride/devices?device=fake" className="mt-4 inline-block text-sm font-semibold text-cyan-200 underline underline-offset-4">
            Preview this page with a simulated trainer
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className={headingClass}>Trainer diagnostics</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Connect and test a smart trainer</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Follow the hardware test script in <code className="text-slate-300">docs/hardware-testing.md</code>. Close Zwift, the Wahoo app and
            any head unit first: only one app can control the trainer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill status={trainerStatus} label={deviceName ?? "Trainer"} />
          {heartRate ? <StatusPill status={heartRate.status} label={heartRateName ?? "Heart rate"} /> : null}
        </div>
      </div>

      {fake ? (
        <div className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm leading-6 text-cyan-100">
          Simulated trainer: no Bluetooth is used. It speaks the same FTMS bytes as a real trainer so every part of this page can be tried.
        </div>
      ) : null}

      {trainerStatus === "reconnecting" ? (
        <div role="status" className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/15 p-3 text-sm font-semibold text-amber-100">
          Reconnecting to {deviceName}: the link dropped. Power the trainer back on; the page reconnects by itself for 60 s.
        </div>
      ) : null}
      {gaveUp && trainerStatus === "disconnected" ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <span className="font-semibold">Gave up reconnecting after 60 s.</span>
          <button type="button" className={buttonClass} onClick={() => void reconnectTrainer()}>
            Reconnect
          </button>
        </div>
      ) : null}
      {diagnostics?.controlState === "lost" ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <span className="font-semibold">Another app took control of the trainer.</span>
          <button type="button" className={buttonClass} onClick={() => void requestControl()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className={cardClass} aria-labelledby="connect-heading">
            <h2 id="connect-heading" className={headingClass}>
              Devices
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                disabled={!canUseBluetooth || (trainerStatus !== null && trainerStatus !== "disconnected")}
                onClick={() => void connectTrainer()}
              >
                Connect trainer
              </button>
              <button type="button" className={buttonClass} disabled={!trainerStatus || trainerStatus === "disconnected"} onClick={() => void disconnectTrainer()}>
                Disconnect trainer
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={fake || !bluetooth || heartRate?.status === "connected" || heartRate?.status === "connecting"}
                title={fake ? "The simulated trainer has no heart rate strap." : undefined}
                onClick={() => void connectHeartRate()}
              >
                Connect heart rate
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!heartRate || heartRate.status === "disconnected"}
                onClick={() => void disconnectHeartRate()}
              >
                Disconnect heart rate
              </button>
            </div>
            {fake ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                <button type="button" className={buttonClass} disabled={trainerStatus === null || !fakePoweredOn} onClick={() => fakePower(false)}>
                  Unplug simulated trainer
                </button>
                <button type="button" className={buttonClass} disabled={fakePoweredOn} onClick={() => fakePower(true)}>
                  Plug it back in
                </button>
                <button type="button" className={buttonClass} disabled={!connected} onClick={() => fakeDeviceRef.current?.takeControlAway()}>
                  Another app takes control
                </button>
              </div>
            ) : null}
            {support === null && !fake ? <p className="mt-3 text-sm text-slate-500">Checking Web Bluetooth support...</p> : null}
            {diagnostics ? (
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {(
                  [
                    ["Manufacturer", diagnostics.deviceInformation.manufacturer],
                    ["Model", diagnostics.deviceInformation.model],
                    ["Firmware", diagnostics.deviceInformation.firmware],
                    ["Hardware", diagnostics.deviceInformation.hardware],
                    ["Control path", diagnostics.controlPath === "ftms" ? "FTMS control point" : diagnostics.controlPath === "wahoo" ? "Wahoo fallback (unsupported)" : "none"],
                    ["Control", diagnostics.controlState],
                    [
                      "Power range",
                      diagnostics.powerRange
                        ? `${diagnostics.powerRange.minWatts}-${diagnostics.powerRange.maxWatts} W, ${diagnostics.powerRange.incrementWatts} W steps`
                        : undefined,
                    ],
                    ["Reconnects", String(diagnostics.reconnectCount)],
                  ] as [string, string | undefined][]
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-slate-800 py-1">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="text-right font-medium text-slate-100">{value ?? "not reported"}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section className={cardClass} aria-labelledby="live-heading">
            <h2 id="live-heading" className={headingClass}>
              Live data
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              <Metric
                label="Power (Indoor Bike Data)"
                value={indoorBikeData?.powerWatts?.toString() ?? "-"}
                unit="W"
                sub={freshness(indoorBikeData, nowMs)}
              />
              <Metric label="Cadence (Indoor Bike Data)" value={indoorBikeData?.cadenceRpm !== undefined ? Math.round(indoorBikeData.cadenceRpm).toString() : "-"} unit="rpm" />
              <Metric label="Target" value={targetWatts?.toString() ?? "-"} unit="W" sub={latestTarget ? judgeTargetTest(latestTarget, nowMs).summary : "no target set"} />
              <Metric
                label="Power (Cycling Power)"
                value={cyclingPower?.powerWatts?.toString() ?? "-"}
                unit="W"
                sub={powerGap !== null ? `${powerGap} W from Indoor Bike Data` : freshness(cyclingPower, nowMs)}
              />
              <Metric label="Cadence (crank data)" value={cyclingPower?.cadenceRpm !== undefined ? Math.round(cyclingPower.cadenceRpm).toString() : "-"} unit="rpm" sub="the KICKR CORE estimates it" />
              <Metric label="Heart rate" value={heartRate?.bpm?.toString() ?? "-"} unit="bpm" sub={heartRate ? heartRate.status : "no strap"} />
            </div>
          </section>

          <section className={cardClass} aria-labelledby="control-heading">
            <h2 id="control-heading" className={headingClass}>
              ERG control
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={buttonClass} disabled={!canControl} onClick={() => void requestControl()}>
                Request control
              </button>
              {TARGET_PRESETS.map((watts) => (
                <button key={watts} type="button" className={buttonClass} disabled={!canControl} onClick={() => void setTarget(watts)}>
                  Set {watts} W
                </button>
              ))}
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void setTarget(Number(customWatts));
                }}
              >
                <label className="sr-only" htmlFor="custom-watts">
                  Custom target watts
                </label>
                <input
                  id="custom-watts"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={2000}
                  value={customWatts}
                  onChange={(event) => setCustomWatts(event.target.value)}
                  className="h-10 w-24 border border-slate-700 bg-slate-950 px-3 text-white"
                />
                <button type="submit" className={buttonClass} disabled={!canControl || customWatts === ""}>
                  Set
                </button>
              </form>
              <button type="button" className={buttonClass} disabled={!canControl} onClick={() => void ergOff()}>
                ERG off
              </button>
              <button type="button" className={buttonClass} disabled={!canControl} onClick={() => void ergOn()}>
                ERG on
              </button>
            </div>
            {targetTests.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Target</th>
                      <th className="py-1 pr-3 font-medium">Result</th>
                      <th className="py-1 pr-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {[...targetTests].reverse().map((test) => {
                      const verdict = judgeTargetTest(test, nowMs);
                      return (
                        <tr key={test.sentAtMs}>
                          <td className="py-2 pr-3 font-mono text-white">{test.watts} W</td>
                          <td className="py-2 pr-3">
                            <CheckBadge state={verdict.state} />
                          </td>
                          <td className="py-2 pr-3 text-slate-300">{verdict.summary}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Pedal at a steady cadence, then set 150 W and 250 W. Each press is judged here.</p>
            )}
          </section>

          <section className={cardClass} aria-labelledby="capture-heading">
            <h2 id="capture-heading" className={headingClass}>
              Byte capture
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Records every notification for 30 s and downloads it as JSON. Commit the file under{" "}
              <code className="text-slate-300">src/lib/ride/trainer/web/fixtures/</code> so the parsers are tested against real KICKR bytes.
            </p>
            <button type="button" className={`${buttonClass} mt-3`} disabled={!connected || captureEndsAt !== null} onClick={startCapture}>
              {captureEndsAt !== null ? `Recording... ${Math.max(0, Math.ceil((captureEndsAt - nowMs) / 1000))} s` : "Record 30 s of raw notifications"}
            </button>
          </section>
        </div>

        <div className="space-y-5">
          <section className={cardClass} aria-labelledby="checks-heading">
            <h2 id="checks-heading" className={headingClass}>
              Hardware test script
            </h2>
            <ol className="mt-3 divide-y divide-slate-800">
              {checks.map((check) => (
                <li key={check.step} className="flex gap-3 py-2.5">
                  <CheckBadge state={check.state} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {check.step}. {check.title}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-slate-400">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={cardClass} aria-labelledby="services-heading">
            <h2 id="services-heading" className={headingClass}>
              Services and characteristics
            </h2>
            {diagnostics?.services.length ? (
              <div className="mt-3 space-y-4">
                {diagnostics.services.map((service) => (
                  <div key={service.uuid}>
                    <p className="text-sm font-semibold text-white">{service.label}</p>
                    <ul className="mt-1 space-y-1">
                      {service.characteristics.map((characteristic) => (
                        <li key={characteristic.uuid} className="rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-slate-200">{characteristic.label}</span>
                            <span className="flex items-center gap-2 text-slate-500">
                              {characteristic.properties.join(", ")}
                              {characteristic.properties.includes("read") ? (
                                <button
                                  type="button"
                                  className="text-cyan-200 underline underline-offset-2 disabled:opacity-40"
                                  disabled={!connected}
                                  onClick={() => void readCharacteristic(characteristic.uuid)}
                                >
                                  Read
                                </button>
                              ) : null}
                            </span>
                          </div>
                          <p className="mt-0.5 break-all font-mono text-slate-400">{lastHex[characteristic.uuid.toLowerCase()] ?? "no value yet"}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Connect a trainer to list what it exposes.</p>
            )}
          </section>

          <section className={cardClass} aria-labelledby="log-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="log-heading" className={headingClass}>
                Log
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={showRaw} onChange={(event) => setShowRaw(event.target.checked)} />
                  Show raw notifications
                </label>
                <button type="button" className="text-cyan-200 underline underline-offset-2" onClick={() => setLog([])}>
                  Clear
                </button>
              </div>
            </div>
            <ol className="mt-3 max-h-96 overflow-y-auto font-mono text-xs leading-5" aria-live="polite">
              {log.length === 0 ? <li className="text-slate-500">Nothing yet.</li> : null}
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className={
                    entry.level === "error"
                      ? "text-rose-300"
                      : entry.level === "warn"
                        ? "text-amber-200"
                        : entry.level === "raw"
                          ? "text-slate-500"
                          : "text-slate-300"
                  }
                >
                  <span className="text-slate-600">{seconds(entry.atMs).padStart(7, " ")}s</span> [{entry.source}] {entry.message}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
