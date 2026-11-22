
"use client";

import { useEffect, useRef, useState } from "react";
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
  Headphones,
} from "lucide-react";

type AudioMode = "original" | "browser";

export default function Home() {
  const [mode, setMode] = useState<AudioMode>("original");
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [level, setLevel] = useState(0);

  const [message, setMessage] = useState(
    "Microphone not connected"
  );
  const [recordingStatus, setRecordingStatus] = useState(
    "No recording yet"
  );
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingMode, setRecordingMode] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef("");

  async function loadDevices() {
    try {
      const allDevices =
        await navigator.mediaDevices.enumerateDevices();

      const microphones = allDevices.filter(
        (device) => device.kind === "audioinput"
      );

      setDevices(microphones);

      if (
        microphones.length > 0 &&
        !microphones.some(
          (device) => device.deviceId === selectedDevice
        )
      ) {
        setSelectedDevice(microphones[0].deviceId);
      }
    } catch (error) {
      console.error("Device enumeration error:", error);
    }
  }

  function clearPreviousRecording() {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = "";
    }

    setRecordingUrl("");
    setRecordingMode("");
    setRecordingStatus("No recording yet");
  }

  async function startMicrophone() {
    if (isLoading || isActive) return;

    setIsLoading(true);
    setMessage("Requesting microphone access...");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access is unavailable. Open ClearVoice using HTTPS."
        );
      }

      const audioConstraints: MediaTrackConstraints = {
        deviceId: selectedDevice
          ? { exact: selectedDevice }
          : undefined,

        // Original mode preserves the microphone input.
        // Browser mode enables native browser processing.
        noiseSuppression: mode === "browser",
        echoCancellation: mode === "browser",
        autoGainControl: mode === "browser",
        channelCount: 1,
      };

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });

      streamRef.current = stream;

      const context = new AudioContext();
      contextRef.current = context;

      await context.resume();

      const source =
        context.createMediaStreamSource(stream);

      const analyser = context.createAnalyser();

      analyser.fftSize = 256;

      source.connect(analyser);

      sourceRef.current = source;
      analyserRef.current = analyser;

      const settings = stream.getAudioTracks()[0]?.getSettings();

      console.log("ClearVoice microphone settings:", settings);

      setIsActive(true);

      setMessage(
        mode === "original"
          ? "Original microphone input is active"
          : "Browser-enhanced microphone is active"
      );

      await loadDevices();

      const data = new Uint8Array(
        analyser.frequencyBinCount
      );

      function updateLevel() {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(data);

        const average =
          data.reduce((sum, value) => sum + value, 0) /
          data.length;

        setLevel(
          Math.min(100, Math.round((average / 128) * 100))
        );

        animationRef.current =
          requestAnimationFrame(updateLevel);
      }

      updateLevel();
    } catch (error) {
      console.error("Microphone initialization error:", error);

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to access microphone.";

      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function startRecording() {
    const stream = streamRef.current;

    if (!stream || !isActive) {
      setRecordingStatus("Connect your microphone first.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRecordingStatus(
        "Your browser does not support audio recording."
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

      const recorder = supportedType
        ? new MediaRecorder(stream, {
            mimeType: supportedType,
          })
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
        setRecordingMode(mode);
        setRecordingStatus("Recording ready to play");
        setIsRecording(false);
      };

      recorder.onerror = (event) => {
        console.error("Recording error:", event);

        setRecordingStatus(
          "An error occurred while recording."
        );

        setIsRecording(false);
      };

      recorder.start(1000);

      setIsRecording(true);
      setRecordingStatus("Recording in progress...");
    } catch (error) {
      console.error("Unable to start recording:", error);

      setRecordingStatus(
        error instanceof Error
          ? error.message
          : "Unable to start recording."
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setRecordingStatus("Preparing recording...");
    }
  }

  async function stopMicrophone() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;

    if (contextRef.current) {
      await contextRef.current.close();
      contextRef.current = null;
    }

    setIsActive(false);
    setLevel(0);
    setMessage("Microphone disconnected");
  }

  useEffect(() => {
    void loadDevices();

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      if (contextRef.current) {
        void contextRef.current.close();
      }

      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
    };
  }, []);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/20 p-3 text-violet-300">
              <AudioLines size={25} />
            </div>

            <div>
              <h1 className="text-xl font-bold">
                ClearVoice
              </h1>
              <p className="text-xs text-gray-400">
                AI Audio Enhancement
              </p>
            </div>
          </div>

          <div className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300">
            Audio Testing Mode
          </div>
        </header>

        <section className="grid gap-8 py-12 lg:grid-cols-[1.5fr_1fr]">

          {/* MAIN CONTENT */}
          <div>
            <p className="mb-4 text-sm font-semibold tracking-widest text-violet-300">
              CLEARER CALLS START HERE
            </p>

            <h2 className="max-w-2xl text-4xl font-bold leading-tight md:text-6xl">
              Your voice deserves to be heard.
            </h2>

            <p className="mt-5 max-w-xl leading-7 text-gray-400">
              Test your microphone and compare original
              audio with browser-enhanced audio.
            </p>

            {/* MICROPHONE PANEL */}
            <div className="mt-10 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    Microphone monitor
                  </h3>

                  <p className="mt-1 text-sm text-gray-400">
                    {message}
                  </p>
                </div>

                <Waves className="text-violet-300" size={24} />
              </div>

              {/* AUDIO VISUALIZER */}
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

              {/* LEVEL METER */}
              <div className="mb-6">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-400">
                    Microphone input level
                  </span>

                  <span>{isActive ? level : 0}%</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-400 transition-all"
                    style={{
                      width: `${isActive ? level : 0}%`,
                    }}
                  />
                </div>
              </div>

              <button
                onClick={
                  isActive ? stopMicrophone : startMicrophone
                }
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-6 py-4 font-semibold transition hover:bg-violet-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <Headphones size={20} />
                ) : isActive ? (
                  <MicOff size={20} />
                ) : (
                  <Mic size={20} />
                )}

                {isLoading
                  ? "Connecting microphone..."
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

                {isActive ? "Microphone connected" : "Disconnected"}
              </div>
            </div>

            {/* RECORDING PANEL */}
            <div className="mt-6 rounded-3xl border border-white/10 bg-[#111622] p-6 md:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    Record & compare
                  </h3>

                  <p className="mt-1 text-sm text-gray-400">
                    Record your microphone audio and play it back.
                  </p>
                </div>

                <Circle className="text-red-400" size={22} />
              </div>

              <div className="mb-5 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                Recording mode:{" "}
                <span className="font-semibold text-violet-300">
                  {mode === "original"
                    ? "Original microphone"
                    : "Browser Enhanced"}
                </span>
              </div>

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
                    download={`clearvoice-${recordingMode}-test.webm`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-violet-300"
                  >
                    <Download size={17} />
                    Download recording
                  </a>
                </div>
              )}

              <p className="mt-5 text-xs leading-5 text-gray-500">
                Recordings stay in your browser. ClearVoice
                does not upload your audio to a server.
              </p>
            </div>
          </div>

          {/* SETTINGS */}
          <aside className="space-y-5">

            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <div className="mb-6 flex items-center gap-3">
                <Settings2 className="text-violet-300" />
                <h3 className="font-semibold">
                  Audio settings
                </h3>
              </div>

              <label className="mb-3 block text-sm text-gray-400">
                Microphone device
              </label>

              <select
                value={selectedDevice}
                onChange={(event) =>
                  setSelectedDevice(event.target.value)
                }
                disabled={isActive}
                className="w-full rounded-xl border border-white/10 bg-[#080b12] p-3 text-sm disabled:opacity-50"
              >
                {devices.map((device, index) => (
                  <option
                    key={device.deviceId}
                    value={device.deviceId}
                  >
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>

              <div className="my-6 border-t border-white/10" />

              <h4 className="mb-3 font-medium">
                Processing mode
              </h4>

              <div className="space-y-3">

                <button
                  onClick={() => setMode("original")}
                  disabled={isActive}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    mode === "original"
                      ? "border-violet-400 bg-violet-500/10"
                      : "border-white/10 bg-[#080b12]"
                  } disabled:opacity-50`}
                >
                  <div className="font-semibold">
                    Original microphone
                  </div>

                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Disables browser noise suppression,
                    echo cancellation and automatic gain control.
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
                  <div className="font-semibold">
                    Browser Enhanced
                  </div>

                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Enables native browser noise suppression,
                    echo cancellation and automatic gain control.
                  </p>
                </button>

              </div>

              <div className="mt-6 rounded-xl bg-violet-500/10 p-4 text-sm text-violet-200">
                <ShieldCheck className="mb-2" size={20} />

                These two modes work independently of the
                experimental AI engine.
              </div>
            </div>

            {/* ENGINE STATUS */}
            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <div className="mb-3 flex items-center gap-3">
                <AudioLines className="text-violet-300" />
                <h3 className="font-semibold">
                  AI processing engine
                </h3>
              </div>

              <div className="mb-3 rounded-xl bg-yellow-500/10 p-3 text-sm text-yellow-200">
                Temporarily disabled
              </div>

              <p className="text-sm leading-6 text-gray-400">
                DeepFilterNet3 integration is being stabilized.
                It will be reintroduced after the browser
                processing and recording foundation is verified.
              </p>
            </div>

            {/* FUTURE FEATURES */}
            <div className="rounded-3xl border border-white/10 bg-[#111622] p-6">
              <h3 className="mb-3 font-semibold">
                Development roadmap
              </h3>

              <ul className="space-y-3 text-sm text-gray-400">
                <li>✓ Independent microphone recording</li>
                <li>✓ Original vs browser-enhanced testing</li>
                <li>• AI noise suppression</li>
                <li>• Background music suppression</li>
                <li>• Competing voice isolation</li>
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
