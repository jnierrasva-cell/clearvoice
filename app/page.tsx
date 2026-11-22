"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AudioLines,
  Mic,
  MicOff,
  Settings2,
  Waves,
  Circle,
  Square,
  Download,
  Play,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";

type AudioMode = "original" | "browser" | "ai";

const SAMPLE_RATE = 48000;

export default function Home() {
  const [mode, setMode] = useState<AudioMode>("ai");
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [level, setLevel] = useState(0);

  const [message, setMessage] = useState("Microphone not connected");
  const [recordingStatus, setRecordingStatus] = useState("No recording yet");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingMode, setRecordingMode] = useState("");
  const [recordingSize, setRecordingSize] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const aiDestroyRef = useRef<(() => void) | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef("");
  const recordingStartTimeRef = useRef<number>(0);

  const loadDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const microphones = allDevices.filter((d) => d.kind === "audioinput");
      setDevices(microphones);
      if (
        microphones.length > 0 &&
        !microphones.some((d) => d.deviceId === selectedDevice)
      ) {
        setSelectedDevice(microphones[0].deviceId);
      }
    } catch (error) {
      console.error("Device enumeration error:", error);
    }
  }, [selectedDevice]);

  function clearPreviousRecording() {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = "";
    }
    setRecordingUrl("");
    setRecordingMode("");
    setRecordingStatus("No recording yet");
    setRecordingDuration(null);
    setRecordingSize(0);
  }

  async function createProcessedGraph(
    rawStream: MediaStream,
    useAi: boolean
  ): Promise<{
    stream: MediaStream;
    context: AudioContext;
    destroy: () => void;
  }> {
    const context = new AudioContext({
      sampleRate: useAi ? SAMPLE_RATE : undefined,
    });
    await context.resume();

    const source = context.createMediaStreamSource(rawStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const destination = context.createMediaStreamDestination();

    sourceRef.current = source;
    analyserRef.current = analyser;
    destinationRef.current = destination;

    if (useAi) {
      await context.audioWorklet.addModule("/worklet.js");

      const wasmResponse = await fetch("/df_bg.wasm");
      if (!wasmResponse.ok) {
        throw new Error(
          `Failed to load AI model (${wasmResponse.status}). Did you run npm install?`
        );
      }
      const wasmBytes = await wasmResponse.arrayBuffer();
      const wasmModule = await WebAssembly.compile(wasmBytes);

      const node = new AudioWorkletNode(context, "deepfilternet-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: {
          wasmModule,
          attenuationLimit: 100,
        },
      });
      workletNodeRef.current = node;

      source.connect(node);
      node.connect(analyser);
      analyser.connect(destination);
    } else {
      source.connect(analyser);
      analyser.connect(destination);
    }

    return {
      stream: destination.stream,
      context,
      destroy: () => {
        try {
          source.disconnect();
          workletNodeRef.current?.disconnect();
          analyser.disconnect();
          destination.disconnect();
        } catch {
          /* ignore */
        }
        workletNodeRef.current = null;
      },
    };
  }

  async function startMicrophone() {
    if (isLoading || isActive) return;

    setIsLoading(true);
    setMessage(
      mode === "ai"
        ? "Loading AI noise cancellation model (first load can take a few seconds)..."
        : "Requesting microphone access..."
    );
    setAiError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access is unavailable. Use HTTPS or localhost."
        );
      }

      const audioConstraints: MediaTrackConstraints = {
        deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
        noiseSuppression: mode === "browser",
        echoCancellation: true,
        autoGainControl: true,
        channelCount: 1,
      };

      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      rawStreamRef.current = rawStream;

      const track = rawStream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") {
        throw new Error("Microphone track is not live. Check permissions.");
      }

      const { stream, context, destroy } = await createProcessedGraph(
        rawStream,
        mode === "ai"
      );

      streamRef.current = stream;
      contextRef.current = context;
      aiDestroyRef.current = destroy;

      setIsActive(true);

      const modeLabel =
        mode === "original"
          ? "Original microphone (no processing)"
          : mode === "browser"
            ? "Browser-enhanced microphone"
            : "AI DeepFilterNet active — strong noise isolation";
      setMessage(modeLabel);

      await loadDevices();

      const data = new Uint8Array(analyserRef.current!.frequencyBinCount);
      function updateLevel() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const average =
          data.reduce((sum, value) => sum + value, 0) / data.length;
        setLevel(Math.min(100, Math.round((average / 128) * 100)));
        animationRef.current = requestAnimationFrame(updateLevel);
      }
      updateLevel();
    } catch (error) {
      console.error("Microphone / AI init error:", error);
      cleanupStreams();
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to access microphone or AI model.";
      setMessage(errorMessage);
      if (mode === "ai") setAiError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function cleanupStreams() {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    aiDestroyRef.current?.();
    aiDestroyRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    destinationRef.current = null;
    workletNodeRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;

    if (contextRef.current) {
      void contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || !isActive) {
      setRecordingStatus("Connect your microphone first.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setRecordingStatus("Your browser does not support audio recording.");
      return;
    }

    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") {
      setRecordingStatus(
        "Audio stream is not live. Stop and restart the microphone."
      );
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

      const options: MediaRecorderOptions = {
        audioBitsPerSecond: 128000,
      };
      if (supportedType) options.mimeType = supportedType;

      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        const size = blob.size;
        setRecordingSize(size);

        if (size < 800) {
          setRecordingStatus(
            "Recording appears empty. Speak while the red button is active, then stop."
          );
          setIsRecording(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecordingUrl(url);
        setRecordingMode(mode);
        setRecordingStatus("Recording ready — play below");
        setIsRecording(false);

        const elapsed =
          (performance.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(Math.max(0.1, elapsed));
      };

      recorder.onerror = (event) => {
        console.error("Recording error:", event);
        setRecordingStatus("An error occurred while recording.");
        setIsRecording(false);
      };

      recorder.start(250);
      recordingStartTimeRef.current = performance.now();
      setIsRecording(true);
      setRecordingStatus("Recording… speak now");
    } catch (error) {
      console.error("Unable to start recording:", error);
      setRecordingStatus(
        error instanceof Error ? error.message : "Unable to start recording."
      );
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    try {
      recorder.requestData();
    } catch {
      /* some browsers throw if already stopped */
    }
    recorder.stop();
    setRecordingStatus("Finalizing recording…");
  }

  async function stopMicrophone() {
    if (recorderRef.current?.state === "recording") {
      stopRecording();
    }
    cleanupStreams();
    setIsActive(false);
    setLevel(0);
    setMessage("Microphone disconnected");
  }

  useEffect(() => {
    void loadDevices();
    return () => {
      if (recorderRef.current?.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupStreams();
      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatDuration(seconds: number | null) {
    if (seconds == null) return "0:00";
    const s = Math.round(seconds);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, "0")}`;
  }

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
                Free high-quality AI noise cancellation
              </p>
            </div>
          </div>
          <div className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300">
            {mode === "ai" ? "DeepFilterNet3 AI" : "Test Mode"}
          </div>
        </header>

        <section className="grid gap-8 py-12 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="mb-4 text-sm font-semibold tracking-widest text-violet-300">
              CLEARER CALLS FOR EVERYONE
            </p>
            <h2 className="max-w-2xl text-4xl font-bold leading-tight md:text-5xl">
              Near Anker-level isolation.
              <br />
              <span className="text-violet-300">
                No expensive headset required.
              </span>
            </h2>
            <p className="mt-5 max-w-xl leading-7 text-gray-400">
              Real-time neural noise suppression that focuses on your voice and
              aggressively reduces everything else. Runs 100% in your browser —
              audio never leaves your device.
            </p>

            <div className="mt-10 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Microphone monitor</h3>
                  <p className="mt-1 text-sm text-gray-400">{message}</p>
                </div>
                <Waves className="text-violet-300" size={24} />
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
                              (20 + Math.abs(Math.sin(index * 0.5)) * 70)
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
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-6 py-4 font-semibold transition hover:bg-violet-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : isActive ? (
                  <MicOff size={20} />
                ) : (
                  <Mic size={20} />
                )}
                {isLoading
                  ? mode === "ai"
                    ? "Loading AI model…"
                    : "Connecting…"
                  : isActive
                    ? "Stop microphone"
                    : "Start microphone"}
              </button>

              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive ? "bg-green-400" : "bg-gray-500"
                  }`}
                />
                {isActive
                  ? mode === "ai"
                    ? "AI isolation active"
                    : "Microphone connected"
                  : "Disconnected"}
              </div>

              {aiError && (
                <p className="mt-3 text-sm text-red-300">{aiError}</p>
              )}
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Record & compare</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Records the currently processed audio (AI / browser /
                    original).
                  </p>
                </div>
                <Circle className="text-red-400" size={22} />
              </div>

              <div className="mb-5 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                Mode:{" "}
                <span className="font-semibold text-violet-300">
                  {mode === "original"
                    ? "Original"
                    : mode === "browser"
                      ? "Browser Enhanced"
                      : "AI DeepFilterNet"}
                </span>
              </div>

              <div className="mb-5 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                {recordingStatus}
                {recordingDuration != null && (
                  <span className="ml-2 text-violet-300">
                    · {formatDuration(recordingDuration)}
                    {recordingSize > 0 &&
                      ` · ${(recordingSize / 1024).toFixed(1)} KB`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startRecording}
                  disabled={!isActive || isRecording}
                  className="flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-semibold text-white disabled:opacity-40"
                >
                  <Circle size={17} />
                  Record
                </button>
                <button
                  onClick={stopRecording}
                  disabled={!isRecording}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 font-semibold disabled:opacity-40"
                >
                  <Square size={17} />
                  Stop
                </button>
              </div>

              {recordingUrl && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-300">
                    <Play size={17} />
                    Ready ({recordingMode}) — {formatDuration(recordingDuration)}
                  </div>
                  <audio
                    controls
                    src={recordingUrl}
                    className="w-full"
                    onLoadedMetadata={(e) => {
                      const d = (e.target as HTMLAudioElement).duration;
                      if (Number.isFinite(d) && d > 0) {
                        setRecordingDuration(d);
                      }
                    }}
                  />
                  <a
                    href={recordingUrl}
                    download={`clearvoice-${recordingMode}-${Date.now()}.webm`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-violet-300"
                  >
                    <Download size={17} />
                    Download recording
                  </a>
                </div>
              )}

              <p className="mt-5 text-xs leading-5 text-gray-500">
                Tip: speak for at least 2–3 seconds while recording. Recordings
                stay in your browser — nothing is uploaded.
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
                Microphone device
              </label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                disabled={isActive}
                className="w-full rounded-xl border border-white/10 bg-[#080b12] p-3 text-sm disabled:opacity-50"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>

              <div className="my-6 border-t border-white/10" />

              <h4 className="mb-3 font-medium">Processing mode</h4>
              <div className="space-y-3">
                <button
                  onClick={() => setMode("ai")}
                  disabled={isActive}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    mode === "ai"
                      ? "border-violet-400 bg-violet-500/10"
                      : "border-white/10 bg-[#080b12]"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <Sparkles size={16} className="text-violet-300" />
                    AI DeepFilterNet
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Strong neural isolation focused on your voice. Closest we
                    can get to an Anker-style “quiet bubble” with a single mic.
                  </p>
                </button>

                <button
                  onClick={() => setMode("browser")}
                  disabled={isActive}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    mode === "browser"
                      ? "border-violet-400 bg-violet-500/10"
                      : "border-white/10 bg-[#080b12]"
                  } disabled:opacity-50`}
                >
                  <div className="font-semibold">Browser Enhanced</div>
                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Native noise suppression + echo cancellation. Lighter, lower
                    quality.
                  </p>
                </button>

                <button
                  onClick={() => setMode("original")}
                  disabled={isActive}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    mode === "original"
                      ? "border-violet-400 bg-violet-500/10"
                      : "border-white/10 bg-[#080b12]"
                  } disabled:opacity-50`}
                >
                  <div className="font-semibold">Original microphone</div>
                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    No processing — use for A/B comparison.
                  </p>
                </button>
              </div>

              <div className="mt-6 rounded-xl bg-violet-500/10 p-4 text-sm text-violet-200">
                <ShieldCheck className="mb-2" size={20} />
                Everything runs on your device. No audio is sent to any server.
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <div className="mb-3 flex items-center gap-3">
                <AudioLines className="text-violet-300" />
                <h3 className="font-semibold">About the isolation</h3>
              </div>
              <p className="text-sm leading-6 text-gray-400">
                Anker headsets create a physical “silent radius” with multiple
                microphones and hardware beamforming/ANC. ClearVoice approximates
                that experience in software: DeepFilterNet3 learns what is voice
                vs noise and suppresses the rest aggressively. It works best
                when you speak relatively close to the mic.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <h3 className="mb-3 font-semibold">What works today</h3>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>✓ Real-time AI noise isolation (DeepFilterNet3)</li>
                <li>✓ Reliable local recording (fixed 0:00 duration)</li>
                <li>✓ Original / Browser / AI comparison</li>
                <li>✓ Device selection</li>
                <li className="text-gray-500">• Strength slider (next)</li>
                <li className="text-gray-500">• Virtual mic for Zoom/Meet</li>
              </ul>
            </div>
          </aside>
        </section>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500">
          ClearVoice — free AI noise isolation for everyone
        </footer>
      </div>
    </main>
  );
}
