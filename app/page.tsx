
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
  Circle,
  Square,
  Download,
  Play,
} from "lucide-react";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("Microphone not connected");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingStatus, setRecordingStatus] = useState(
    "No recording yet"
  );

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef("");

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

  function clearPreviousRecording() {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = "";
    }

    setRecordingUrl("");
    setRecordingStatus("No recording yet");
  }

  async function stopMicrophone() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
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

  function startRecording() {
    const stream = streamRef.current;

    if (!stream || !isActive) {
      setRecordingStatus("Connect your microphone first.");
      return;
    }

    if (!window.MediaRecorder) {
      setRecordingStatus("Recording is not supported by this browser.");
      return;
    }

    try {
      clearPreviousRecording();
      chunksRef.current = [];

      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const supportedType = mimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        const url = URL.createObjectURL(blob);

        recordingUrlRef.current = url;
        setRecordingUrl(url);
        setRecordingStatus("Recording ready to play");
        setIsRecording(false);
      };

      recorder.onerror = () => {
        setRecordingStatus("Recording encountered an error.");
        setIsRecording(false);
      };

      recorder.start();

      setIsRecording(true);
      setRecordingStatus("Recording in progress...");
    } catch (error) {
      console.error(error);
      setRecordingStatus("Unable to start recording.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setRecordingStatus("Preparing your recording...");
    }
  }

  useEffect(() => {
    loadDevices();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();

      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
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
              <p className="text-xs text-gray-400">
                AI Audio Enhancement
              </p>
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
                          ? (level / 100) *
                              (20 + Math.abs(Math.sin(index)) * 70)
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

            <div className="mt-6 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Record & Playback</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Record your voice and listen to the result.
                  </p>
                </div>
                <div className="rounded-xl bg-red-500/10 p-3 text-red-400">
                  <Circle size={22} />
                </div>
              </div>

              <div className="mb-5 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                {recordingStatus}
                <p className="mt-1 text-xs text-gray-500">
                  Current setting: Noise suppression{" "}
                  {enabled ? "ON" : "OFF"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startRecording}
                  disabled={!isActive || isRecording}
                  className="flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition hover:bg-red-400 disabled:opacity-40"
                >
                  <Circle size={17} />
                  Record
                </button>

                <button
                  onClick={stopRecording}
                  disabled={!isRecording}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/5 disabled:opacity-40"
                >
                  <Square size={17} />
                  Stop
                </button>
              </div>

              {recordingUrl && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-300">
                    <Play size={17} />
                    Your recording is ready
                  </div>

                  <audio
                    controls
                    src={recordingUrl}
                    className="w-full"
                  />

                  <a
                    href={recordingUrl}
                    download="clearvoice-test.webm"
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-violet-300 transition hover:bg-white/5"
                  >
                    <Download size={17} />
                    Download recording
                  </a>
                </div>
              )}

              <p className="mt-5 text-xs leading-5 text-gray-500">
                Recordings are processed and stored locally in your browser
                during this session. They are not uploaded to a server.
              </p>
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
