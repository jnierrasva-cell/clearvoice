"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Mic,
  MicOff,
  ShieldCheck,
  Settings2,
  Volume2,
  Waves,
} from "lucide-react";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("Microphone not connected");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  async function loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const microphones = list.filter(
        (device) => device.kind === "audioinput"
      );

      setDevices(microphones);

      if (!selectedDevice && microphones.length > 0) {
        setSelectedDevice(microphones[0].deviceId);
      }
    } catch {
      setMessage("Unable to list microphone devices.");
    }
  }

  async function stopMicrophone() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    await audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsActive(false);
    setLevel(0);
    setMessage("Microphone disconnected");
  }

  async function startMicrophone() {
    try {
      await stopMicrophone();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice
            ? { exact: selectedDevice }
            : undefined,
          noiseSuppression: enabled,
          echoCancellation: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const context = new AudioContext();
      audioContextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      function updateLevel() {
        analyser.getByteFrequencyData(data);

        const average =
          data.reduce((sum, value) => sum + value, 0) / data.length;

        setLevel(Math.min(100, Math.round((average / 128) * 100)));

        animationRef.current = requestAnimationFrame(updateLevel);
      }

      updateLevel();

      setIsActive(true);
      setMessage("Microphone is active");
      await loadDevices();
    } catch (error) {
      console.error(error);
      setMessage("Microphone access failed. Check browser permissions.");
      setIsActive(false);
    }
  }

  useEffect(() => {
    loadDevices();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, []);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/20 p-3 text-violet-300">
              <AudioLines size={25} />
            </div>
            <div>
              <h1 className="text-xl font-bold">ClearVoice</h1>
              <p className="text-xs text-gray-400">AI Audio Enhancement</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            Browser MVP
          </div>
        </header>

        <section className="grid gap-8 py-12 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="mb-4 text-sm font-semibold tracking-widest text-violet-300">
              CLEARER CALLS START HERE
            </p>

            <h2 className="max-w-2xl text-4xl font-bold leading-tight md:text-6xl">
              Your voice deserves to be heard.
            </h2>

            <p className="mt-5 max-w-xl leading-7 text-gray-400">
              Reduce unwanted background noise and create a cleaner
              microphone experience for your calls.
            </p>

            <div className="mt-10 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Microphone monitor</h3>
                  <p className="mt-1 text-sm text-gray-400">{message}</p>
                </div>
                <div className="rounded-xl bg-violet-500/15 p-3 text-violet-300">
                  <Waves size={22} />
                </div>
              </div>

              <div className="my-10 flex h-24 items-center justify-center gap-1">
                {Array.from({ length: 35 }).map((_, index) => (
                  <div
                    key={index}
                    className="w-1 rounded-full bg-violet-400 transition-all duration-100"
                    style={{
                      height: `${Math.max(
                        5,
                        isActive
                          ? (level / 100) * (20 + Math.abs(Math.sin(index)) * 70)
                          : 5
                      )}px`,
                    }}
                  />
                ))}
              </div>

              <div className="mb-6">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-400">Input level</span>
                  <span>{isActive ? level : 0}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-400 transition-all"
                    style={{ width: `${isActive ? level : 0}%` }}
                  />
                </div>
              </div>

              <button
                onClick={isActive ? stopMicrophone : startMicrophone}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-6 py-4 font-semibold transition hover:bg-violet-500"
              >
                {isActive ? <MicOff size={20} /> : <Mic size={20} />}
                {isActive ? "Stop microphone" : "Start microphone test"}
              </button>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <div className="mb-6 flex items-center gap-3">
                <Settings2 className="text-violet-300" />
                <h3 className="font-semibold">Audio settings</h3>
              </div>

              <label className="mb-3 block text-sm text-gray-400">
                Input device
              </label>

              <select
                value={selectedDevice}
                onChange={(event) => setSelectedDevice(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#080b12] p-3 text-sm"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>

              <div className="my-6 border-t border-white/10" />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-medium">Noise suppression</h4>
                  <p className="mt-1 text-xs text-gray-400">
                    Browser-supported processing
                  </p>
                </div>

                <button
                  onClick={() => setEnabled(!enabled)}
                  className={`h-7 w-12 rounded-full p-1 transition ${
                    enabled ? "bg-violet-600" : "bg-gray-600"
                  }`}
                  aria-label="Toggle noise suppression"
                  aria-pressed={enabled}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition ${
                      enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="mt-6 rounded-xl bg-violet-500/10 p-4 text-sm text-violet-200">
                <ShieldCheck className="mb-2" size={20} />
                Noise suppression is currently handled by your browser.
                Advanced AI voice isolation is planned for a later version.
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <div className="mb-3 flex items-center gap-3">
                <Volume2 className="text-violet-300" />
                <h3 className="font-semibold">What comes next?</h3>
              </div>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>• Advanced AI noise removal</li>
                <li>• Voice isolation from nearby conversations</li>
                <li>• Processed audio comparison</li>
                <li>• Virtual microphone for meeting apps</li>
              </ul>
            </div>
          </aside>
        </section>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500">
          ClearVoice — Early Development Build
        </footer>
      </div>
    </main>
  );
}

