# ClearVoice

**Free, high-quality AI noise isolation that runs entirely in your browser.**

ClearVoice uses DeepFilterNet3 to aggressively suppress background noise while keeping your voice clear — the closest open-source software experience to the “quiet bubble” you get from good Anker-style headsets.

## What’s fixed / improved

- **Recording now works reliably** (no more 0:00 empty clips)
- Real-time **AI DeepFilterNet3** path with strong attenuation
- Always routes audio through a proper AudioContext graph so MediaRecorder receives real data
- Shows duration + file size after recording
- Privacy-first: everything stays on-device

## Quick start

```bash
npm install          # also copies the AI model assets into public/
npm run dev
```

Open http://localhost:3000 → choose **AI DeepFilterNet** → Start microphone → speak → Record for a few seconds → Stop.

## Limits vs real Anker hardware

True spatial “silent radius” needs multiple microphones and hardware beamforming/ANC.  
ClearVoice approximates that with a single consumer mic + a strong neural model. Results are best when you speak close to the microphone.

## License

MIT (app). DeepFilterNet components follow upstream licenses.
