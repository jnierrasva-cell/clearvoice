
"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Mic,
  MicOff,
  ShieldCheck,
  Settings2,
  Waves,
  Circle,
  Square,
  Download,
  Play,
  Cpu,
} from "lucide-react";

type AudioProcessor = {
  initialize: () => Promise<void>;
  createAudioWorkletNode: (context: AudioContext) => Promise<AudioWorkletNode>;
  setSuppressionLevel: (level: number) => void;
  destroy: () => void;
};

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [suppressionLevel, setSuppressionLevel] = useState(80);
  const [recordingSource, setRecordingSource] = useState("processed");
  const [message, setMessage] = useState("Microphone not connected");
  const [engineStatus, setEngineStatus] = useState("Engine not loaded");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingStatus, setRecordingStatus] = useState(
    "No recording yet"
  );

  const streamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioProcessor | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
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

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    processedStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;
    processedStreamRef.current = null;

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    processorRef.current?.destroy();
    processorRef.current = null;

    await audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsActive(false);
    setLevel(0);
    setMessage("Microphone disconnected");
    setEngineStatus("Engine not loaded");
  }

  async function startMicrophone() {
    setIsLoading(true);
    setMessage("Initializing microphone...");
    setEngineStatus("Loading DeepFilterNet3...");

    try {
      await stopMicrophone();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice
            ? { exact: selectedDevice }
            : undefined,
          noiseSuppression: false,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      const context = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = context;
      await context.resume();

      const { DeepFilterNet3Core } = await import(
        "deepfilternet3-noise-filter"
      );

const processor = new DeepFilterNet3Core({
  sampleRate: 48000,
  noiseReductionLevel: 0,
  assetConfig: {
    cdnUrl: "/api/deepfilter-assets",
  },
});

      processorRef.current = processor;
      await processor.initialize();

      const workletNode = await processor.createAudioWorkletNode(context);
      workletNodeRef.current = workletNode;

      const source = context.createMediaStreamSource(stream);
      const destination = context.createMediaStreamDestination();

      source.connect(workletNode);
      workletNode.connect(destination);

      processedStreamRef.current = destination.stream;

      // Monitor processed audio without playing it through the speakers.
      const analyser = context.createAnalyser();
      const silentGain = context.createGain();

      analyser.fftSize = 256;
      silentGain.gain.value = 0;

      workletNode.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(context.destination);

      const data = new Uint8Array(analyser.frequencyBinCount);

      function updateLevel() {
        analyser.getByteFrequencyData(data);

        const average =
          data.reduce((sum, value) => sum + value, 0) / data.length;

        setLevel(Math.min(100, Math.round((average / 128) * 100)));

        animationRef.current = requestAnimationFrame(updateLevel);
      }

      processor.setSuppressionLevel(suppressionLevel);
      updateLevel();

      setIsActive(true);
      setMessage("AI microphone processing is active");
      setEngineStatus("DeepFilterNet3 ready");

      await loadDevices();
    } catch (error) {
      console.error("ClearVoice engine error:", error);

      await stopMicrophone();

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to initialize audio processing."
      );

      setEngineStatus("Engine initialization failed");
    } finally {
      setIsLoading(false);
    }
  }

  function startRecording() {
    const selectedStream =
      recordingSource === "processed"
        ? processedStreamRef.current
        : streamRef.current;

    if (!selectedStream || !isActive) {
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
        ? new MediaRecorder(selectedStream, { mimeType: supportedType })
        : new MediaRecorder(selectedStream);

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

  function updateSuppression(value: number) {
    setSuppressionLevel(value);
    processorRef.current?.setSuppressionLevel(value);
  }

  useEffect(() => {
    loadDevices();

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      processedStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      processorRef.current?.destroy();
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

          <div className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300">
            Browser AI Engine
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
              AI-powered microphone enhancement, running locally
              in your browser.
            </p>

            <div className="mt-10 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Processed microphone</h3>
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
                              (20 + Math.abs(Math.sin(index)) * 70)
                          : 5
                      )}px`,
                    }}
                  />
                ))}
              </div>

              <div className="mb-6">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-400">Processed output level</span>
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
                  <Cpu size={20} />
                ) : isActive ? (
                  <MicOff size={20} />
                ) : (
                  <Mic size={20} />
                )}
                {isLoading
                  ? "Initializing AI engine..."
                  : isActive
                    ? "Stop microphone"
                    : "Start AI microphone"}
              </button>

              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive ? "bg-green-400" : "bg-gray-500"
                  }`}
                />
                {engineStatus}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Record & compare</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Choose which microphone signal to record.
                  </p>
                </div>
                <Circle className="text-red-400" size={22} />
              </div>

              <label className="mb-2 block text-sm text-gray-400">
                Recording source
              </label>

              <select
                value={recordingSource}
                onChange={(event) => setRecordingSource(event.target.value)}
                className="mb-5 w-full rounded-xl border border-white/10 bg-[#080b12] p-3 text-sm"
              >
                <option value="processed">AI processed output</option>
                <option value="raw">Original microphone input</option>
              </select>

              <div className="mb-5 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                {recordingStatus}
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
                    Recording ready
                  </div>

                  <audio
                    controls
                    src={recordingUrl}
                    className="w-full"
                  />

                  <a
                    href={recordingUrl}
                    download={`clearvoice-${recordingSource}-test.webm`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-violet-300"
                  >
                    <Download size={17} />
                    Download recording
                  </a>
                </div>
              )}

              <p className="mt-5 text-xs leading-5 text-gray-500">
                Recordings remain in your browser session and are not
                uploaded to a ClearVoice server.
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

              <div className="flex items-center justify-between">
                <h4 className="font-medium">AI suppression strength</h4>
                <span className="text-sm text-violet-300">
                  {suppressionLevel}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={suppressionLevel}
                onChange={(event) =>
                  updateSuppression(Number(event.target.value))
                }
                className="mt-5 w-full accent-violet-500"
              />

              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>Gentle</span>
                <span>Strong</span>
              </div>

              <div className="mt-6 rounded-xl bg-violet-500/10 p-4 text-sm text-violet-200">
                <ShieldCheck className="mb-2" size={20} />
                DeepFilterNet3 processes audio locally using WebAssembly.
                Stronger suppression can also affect natural voice quality.
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <div className="mb-3 flex items-center gap-3">
                <Cpu className="text-violet-300" />
                <h3 className="font-semibold">Processing engine</h3>
              </div>

              <p className="text-sm leading-6 text-gray-400">
                DeepFilterNet3 — neural speech enhancement engine.
                Browser-native noise suppression is disabled in the
                input stream to avoid stacking two noise filters.
              </p>

              <div className="my-4 border-t border-white/10" />

              <ul className="space-y-3 text-sm text-gray-400">
                <li>• Local browser processing</li>
                <li>• Raw and processed recording</li>
                <li>• Adjustable suppression strength</li>
                <li>• No audio upload required</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <h3 className="mb-3 font-semibold">Future development</h3>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>• Dedicated background music suppression tests</li>
                <li>• Competing voice isolation research</li>
                <li>• Audio quality and latency measurements</li>
                <li>• Virtual microphone support</li>
              </ul>
            </div>
          </aside>
        </section>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500">
          ClearVoice — AI Audio Enhancement
        </footer>
      </div>
    </main>
  );
}
