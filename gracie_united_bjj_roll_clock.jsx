import React, { useEffect, useMemo, useRef, useState } from "react";

const ROLL_OPTIONS = [1,2,3,4,5,6,7,8,9,10,15,20,30];
const ROUND_OPTIONS = [1,2,3,4,5,6,7,8,9,10];
const START_OPTIONS = [5,10,15];
const REST_OPTIONS = [15,30,45,60];
const WARNING_OPTIONS = [5,10,15];

const LOGO_URL = "https://www.championfactory.com/images/logo/logo.png";

const PHRASES = [
  "Get over here and lose position.",
  "Come here. Your base is mine.",
  "Step in. Regret it immediately.",
  "Get over here. I need the underhook.",
  "Come closer. I’m collecting necks.",
  "Get over here and donate an arm.",
  "Walk into the trap. Slowly.",
  "Come here. I promise side control.",
  "Get over here. Your frames won’t save you.",
  "Close the distance. I dare you.",
];

const PRESETS = {
  custom: null,
  class: {
    label: "Adult",
    rounds: 5,
    rollMinutes: 5,
    warningSeconds: 10,
    startSeconds: 10,
    restSeconds: 45,
  },
  warrior: {
    label: "Warrior",
    rounds: 6,
    rollMinutes: 6,
    warningSeconds: 10,
    startSeconds: 10,
    restSeconds: 45,
  },
  junior: {
    label: "Kids",
    rounds: 5,
    rollMinutes: 3,
    warningSeconds: 10,
    startSeconds: 10,
    restSeconds: 45,
  },
};

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function SelectField({ label, value, onChange, options, suffix = "", disabled = false }) {
  return (
    <label className="flex min-w-[120px] flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}{suffix}
          </option>
        ))}
      </select>
    </label>
  );
}

function PresetField({ value, onChange, disabled = false }) {
  return (
    <label className="flex min-w-[150px] flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Preset</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-white outline-none transition focus:border-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="class">Adult</option>
        <option value="junior">Kids</option>
        <option value="warrior">Warrior</option>
        <option value="custom">Custom</option>
      </select>
    </label>
  );
}

export default function GracieUnitedBJJRollClock() {
  const [preset, setPreset] = useState("custom");
  const [rollMinutes, setRollMinutes] = useState(5);
  const [rounds, setRounds] = useState(5);
  const [startSeconds, setStartSeconds] = useState(10);
  const [restSeconds, setRestSeconds] = useState(45);
  const [warningSeconds, setWarningSeconds] = useState(10);

  const [phase, setPhase] = useState("idle"); // idle | start | roll | rest | complete
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(rollMinutes * 60);
  const [isPaused, setIsPaused] = useState(false);

  const audioCtxRef = useRef(null);
  const lastAnnouncedSecondRef = useRef(null);
  const wakeLockRef = useRef(null);
  const voiceReadyRef = useRef(false);
  const phraseIndexRef = useRef(0);

  const isLive = phase === "start" || phase === "roll" || phase === "rest";
  const controlsLocked = isLive && !isPaused;

  const sessionSummary = useMemo(() => {
    if (phase === "idle") return "Ready";
    if (phase === "complete") return "Session Complete";
    if (phase === "start") return "Start Mode";
    if (phase === "roll") return `Round ${currentRound} of ${rounds}`;
    if (phase === "rest") return currentRound >= rounds ? "Final Rest" : `Rest before Round ${currentRound + 1}`;
    return "Ready";
  }, [phase, currentRound, rounds]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const handleVoices = () => {
      window.speechSynthesis.getVoices();
      voiceReadyRef.current = true;
    };
    handleVoices();
    window.speechSynthesis.onvoiceschanged = handleVoices;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!isLive || isPaused) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive, isPaused]);

  useEffect(() => {
    const key = `${phase}-${timeLeft}-${isPaused}`;
    if (lastAnnouncedSecondRef.current === key) return;
    lastAnnouncedSecondRef.current = key;

    if (isPaused) return;

    if (phase === "start") {
      if (timeLeft > 0) {
        playBeep({ frequency: 980, duration: 0.09, volume: 0.26 });
      } else {
        beginRound(1);
      }
      return;
    }

    if (phase === "roll") {
      if (timeLeft > 0 && timeLeft <= warningSeconds) {
        playBeep({ frequency: 1420, duration: 0.09, volume: 0.3, type: "triangle" });
      }
      if (timeLeft === 0) {
        if (currentRound >= rounds) {
          finishSession();
        } else {
          beginRest();
        }
      }
      return;
    }

    if (phase === "rest") {
      if (timeLeft > 0 && timeLeft <= warningSeconds) {
        playBeep({ frequency: 1260, duration: 0.08, volume: 0.28 });
      }
      if (timeLeft === 0) {
        beginRound(currentRound + 1);
      }
    }
  }, [phase, timeLeft, isPaused, currentRound, rounds, warningSeconds]);

  useEffect(() => {
    let released = false;
    async function handleWakeLock() {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      try {
        if (isLive && !isPaused && !wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
        if ((!isLive || isPaused) && wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      } catch {
        // Wake Lock is best effort only.
      }
    }
    handleWakeLock();
    return () => {
      if (released) return;
      released = true;
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isLive, isPaused]);

  useEffect(() => {
    if (phase === "idle") {
      setTimeLeft(rollMinutes * 60);
    }
  }, [rollMinutes, phase]);

  async function ensureAudioContext() {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }
    if (audioCtxRef.current.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch {
        return audioCtxRef.current;
      }
    }
    return audioCtxRef.current;
  }

  async function playBeep({ frequency = 880, duration = 0.12, volume = 0.24, type = "square" } = {}) {
    const ctx = await ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  async function playWarningBell() {
    await playBeep({ frequency: 1450, duration: 0.12, volume: 0.3, type: "triangle" });
    setTimeout(() => playBeep({ frequency: 1250, duration: 0.12, volume: 0.28, type: "triangle" }), 140);
    setTimeout(() => playBeep({ frequency: 1450, duration: 0.14, volume: 0.3, type: "triangle" }), 280);
  }

  async function playRoundBell() {
    await playBeep({ frequency: 950, duration: 0.2, volume: 0.32, type: "sawtooth" });
    setTimeout(() => playBeep({ frequency: 1200, duration: 0.22, volume: 0.32, type: "sawtooth" }), 160);
  }

  async function playFinalBell() {
    await playBeep({ frequency: 900, duration: 0.22, volume: 0.32, type: "triangle" });
    setTimeout(() => playBeep({ frequency: 1100, duration: 0.24, volume: 0.32, type: "triangle" }), 180);
    setTimeout(() => playBeep({ frequency: 800, duration: 0.32, volume: 0.34, type: "triangle" }), 360);
  }

  function speakRoundPhrase() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(PHRASES[phraseIndexRef.current % PHRASES.length]);
    phraseIndexRef.current += 1;

    if (voiceReadyRef.current) {
      const voices = synth.getVoices();
      const preferredVoice =
        voices.find((voice) => /david|mark|daniel|fred|guy/i.test(voice.name)) ||
        voices.find((voice) => /english|en-us|en_us/i.test(`${voice.name} ${voice.lang}`)) ||
        voices[0];
      if (preferredVoice) utterance.voice = preferredVoice;
    }

    utterance.rate = 0.86;
    utterance.pitch = 0.72;
    utterance.volume = 1;

    try {
      synth.cancel();
      synth.speak(utterance);
    } catch {
      // Speech synthesis is best effort only.
    }
  }

  function applyPreset(nextPreset) {
    setPreset(nextPreset);
    if (nextPreset === "custom") return;
    const selected = PRESETS[nextPreset];
    if (!selected) return;
    setRollMinutes(selected.rollMinutes);
    setRounds(selected.rounds);
    setStartSeconds(selected.startSeconds);
    setRestSeconds(selected.restSeconds);
    setWarningSeconds(selected.warningSeconds);
  }

  function updateCustom(setter, value) {
    setPreset("custom");
    setter(value);
  }

  async function startSession() {
    await ensureAudioContext();
    setIsPaused(false);
    setCurrentRound(1);
    if (startSeconds > 0) {
      setPhase("start");
      setTimeLeft(startSeconds);
    } else {
      beginRound(1);
    }
  }

  function beginRound(roundNumber) {
    setPhase("roll");
    setCurrentRound(roundNumber);
    setTimeLeft(rollMinutes * 60);
    playRoundBell();
    speakRoundPhrase();
  }

  function beginRest() {
    setPhase("rest");
    setTimeLeft(restSeconds);
    playBeep({ frequency: 720, duration: 0.2, volume: 0.26, type: "triangle" });
  }

  function finishSession() {
    setPhase("complete");
    setTimeLeft(0);
    setIsPaused(false);
    playFinalBell();
  }

  function handleStartPauseResume() {
    if (phase === "idle" || phase === "complete") {
      startSession();
      return;
    }
    setIsPaused((prev) => !prev);
  }

  function handleReset() {
    setPhase("idle");
    setCurrentRound(1);
    setTimeLeft(rollMinutes * 60);
    setIsPaused(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  const bigStatus = phase === "idle"
    ? "Ready"
    : phase === "start"
      ? "Starts In"
      : phase === "roll"
        ? "Roll"
        : phase === "rest"
          ? "Rest"
          : "Complete";

  const timerText = phase === "complete" ? "DONE" : formatTime(timeLeft);

  return (
    <div className="min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="relative flex min-h-screen w-full flex-col bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.25),_transparent_38%),linear-gradient(180deg,_#0b0b0b_0%,_#000_35%,_#050505_100%)] px-4 pb-5 pt-4 md:px-8 md:pb-6 md:pt-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-red-600/70" />
        <img
          src={LOGO_URL}
          alt="Gracie United badge left"
          className="pointer-events-none absolute bottom-5 left-4 z-20 w-24 opacity-95 drop-shadow-[0_0_28px_rgba(255,0,0,0.38)] md:bottom-6 md:left-8 md:w-32"
        />
        <img
          src={LOGO_URL}
          alt="Gracie United badge right"
          className="pointer-events-none absolute bottom-5 right-4 z-20 w-24 opacity-95 drop-shadow-[0_0_28px_rgba(255,0,0,0.38)] md:bottom-6 md:right-8 md:w-32"
        />

        <header className="relative z-10 flex items-center justify-center">
          <h1 className="text-center text-xl font-extrabold uppercase tracking-[0.28em] text-white md:text-3xl">
            Gracie Untied BJJ
          </h1>
        </header>

        <main className="relative z-10 flex flex-1 flex-col">
          <section className="order-2 flex flex-1 flex-col items-center justify-end py-3 md:py-5">

            <div className="mb-2 text-center text-sm font-semibold uppercase tracking-[0.4em] text-red-400 md:text-lg">
              {bigStatus}
            </div>

            <div className="select-none text-center font-black leading-none text-red-600 [text-shadow:0_0_18px_rgba(220,38,38,0.55),0_0_50px_rgba(220,38,38,0.28)] text-[clamp(6rem,24vw,17rem)]">
              {timerText}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300 md:text-sm">
              <span>Round {Math.min(currentRound, rounds)} / {rounds}</span>
              {isPaused && <span className="text-red-400">Paused</span>}
            </div>
          </section>

          <section className="order-1 relative z-10 mt-4 rounded-3xl border border-zinc-800/90 bg-zinc-950/88 p-3 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur md:mt-5 md:p-4">
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-6 xl:grid-cols-6">
              <PresetField value={preset} onChange={applyPreset} disabled={controlsLocked} />
              <SelectField label="Roll" value={rollMinutes} onChange={(value) => updateCustom(setRollMinutes, value)} options={ROLL_OPTIONS} suffix=" min" disabled={controlsLocked} />
              <SelectField label="Rounds" value={rounds} onChange={(value) => updateCustom(setRounds, value)} options={ROUND_OPTIONS} disabled={controlsLocked} />
              <SelectField label="Start" value={startSeconds} onChange={(value) => updateCustom(setStartSeconds, value)} options={START_OPTIONS} suffix=" sec" disabled={controlsLocked} />
              <SelectField label="Rest" value={restSeconds} onChange={(value) => updateCustom(setRestSeconds, value)} options={REST_OPTIONS} suffix=" sec" disabled={controlsLocked} />
              <SelectField label="Warning" value={warningSeconds} onChange={(value) => updateCustom(setWarningSeconds, value)} options={WARNING_OPTIONS} suffix=" sec" disabled={controlsLocked} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleStartPauseResume}
                  className="h-12 min-w-[160px] rounded-2xl bg-red-600 px-6 text-sm font-black uppercase tracking-[0.22em] text-white shadow-[0_0_24px_rgba(220,38,38,0.45)] transition hover:bg-red-500 active:scale-[0.98]"
                >
                  {phase === "idle" || phase === "complete" ? "Start" : isPaused ? "Resume" : "Pause"}
                </button>

                <button
                  onClick={handleReset}
                  className="h-12 min-w-[140px] rounded-2xl border border-zinc-700 bg-zinc-900 px-6 text-sm font-black uppercase tracking-[0.22em] text-zinc-100 transition hover:border-red-500 hover:text-white active:scale-[0.98]"
                >
                  Reset
                </button>
              </div>

              
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
