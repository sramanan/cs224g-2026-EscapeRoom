# The Puzzle Master's Escape Room

A voice AI workshop: the frontend shows a locked door with a red light. The AI is **The Enigma** — an eccentric, riddling Puzzle Master who controls the room. Talk to them, solve the riddles, and speak the correct 4-digit passcode to unlock the door (green light + success sound).

## The Scenario

- **You** are trapped. The door is locked; a red light glows.
- **The Enigma** describes the room and guides you to inspect items: a dusty bookshelf, a grandfather clock.
- **You** figure out the passcode from the riddles.
- **You** tell The Enigma the code. If correct, they call `unlock_door` → green light, success sound.

## Workshop Focus

Students write **backend and Realtime API code**. The frontend is provided: door UI, status light, WebRTC connection, data channel, tool handling, visualizers, captions.

## Prerequisites

- **Python 3.11+** with [uv](https://docs.astral.sh/uv/)
- **Node.js 18+** with npm
- **OpenAI API key** with Realtime API access

## Setup

1. Clone this repository and set your API key:

```bash
cp .env.example .env
# Edit .env and add your key: OPENAI_API_KEY=sk-...
```

Or export it directly:

```bash
export OPENAI_API_KEY=sk-...
```

2. Each chapter is a standalone app. Start with Chapter 1.

## Running a Chapter

```bash
./scripts/run-chapter.sh 1
```

Or manually:

**Backend** (terminal 1):

```bash
cd chapter_1_connection/backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

**Frontend** (terminal 2):

```bash
cd chapter_1_connection/frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Workshop Chapters

### Chapter 1: Connection

**You implement (backend):** Create an ephemeral client secret via `client.realtime.client_secrets.create()` and return `{"value": secret.value}`.

The frontend handles mic access, token fetch, RTCPeerConnection, and SDP exchange.

### Chapter 2: Context & Persona

**You implement (backend):** Add The Enigma's persona and turn detection to the session config passed to `client_secrets.create()`:

- `instructions` — describe room, guide to inspect bookshelf/clock, give riddles
- `voice: "onyx"`
- `turn_detection` — semantic VAD with `interrupt_response: true` for barge-in (user can interrupt The Enigma mid-sentence)

### Chapter 3: Tools & Escape

**You implement (backend):** Register the `unlock_door` tool in the session: `tools` array with a function that accepts `code`, plus `tool_choice: "auto"`. Update instructions so The Enigma calls `unlock_door` when the user gives a code.

The frontend listens for `response.function_call_arguments.done`, checks the code, and triggers the unlock UI + success sound.

### Chapter 4: Production Polish

**All implemented.** Audio level meters, live captions, and success sound are provided. Run it to see the full experience.

## Resetting a Chapter

```bash
./scripts/advance-chapter.sh 1
```

Restores the chapter to its original scaffold via `git checkout`.

## Architecture

```
Browser                          Your Server              OpenAI
  |                                  |                       |
  |-- GET /get-token --------------->|                       |
  |                                  |-- POST /realtime/     |
  |                                  |   client_secrets ---->|
  |                                  |<-- { value: ek_... } -|
  |<-- { value: ek_... } -----------|                        |
  |                                                          |
  |-- POST /realtime/calls (SDP offer, Bearer ek_...) ----->|
  |<-- SDP answer ------------------------------------------|
  |                                                          |
  |<=== WebRTC audio + RTCDataChannel (JSON events) =======>|
```

Session config (instructions, voice, tools) is set when creating the client secret on the backend.

## Frontend Overview (for learning)

The frontend is provided so you can focus on backend and Realtime API code. Here’s what it does and how it works.

### Connection flow

1. **Microphone access** — `navigator.mediaDevices.getUserMedia({ audio: true })` asks the user for mic permission and returns a `MediaStream`.
2. **Token fetch** — `fetch("/get-token")` calls your backend; the proxy forwards to `localhost:8000`. It expects `{ value: "ek_..." }`.
3. **WebRTC setup** — Creates an `RTCPeerConnection`, adds the mic track with `addTrack()`, and creates the `oai-events` data channel (before the offer so it’s part of the SDP).
4. **SDP exchange** — `createOffer()` → `setLocalDescription()` → POST the SDP to `https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer <token>`, then `setRemoteDescription(answer)`.
5. **Remote audio** — The `ontrack` handler assigns `e.streams[0]` to a hidden `<audio autoplay>` element so The Enigma’s voice is played.

### Data channel

The `oai-events` channel carries JSON events. The frontend listens with `dc.addEventListener("message", ...)` and parses `JSON.parse(e.data)`. It only reacts to:

- **`response.function_call_arguments.done`** — Tool call finished. If `name === "unlock_door"`, it parses `arguments` and checks `code === "7314"`.
- **`response.output_audio_transcript.delta`** (Ch4) — Appends `event.delta` to the caption text.
- **`response.created`** (Ch4) — Clears captions when a new response starts.

### Unlock behavior

When the code is correct, the frontend:

- Calls `setIsUnlocked(true)` — switches the status light from red to green and updates styles.
- Calls `playSuccessSound()` — uses the Web Audio API to play a simple two-tone chime.
- Shows a success banner.

### Chapter 4: Visualizers and captions

- **AnalyserNode** — `createMediaStreamSource()` + `createAnalyser()` connect the mic and remote audio to the Web Audio API.
- **Level meters** — `requestAnimationFrame` + `getByteFrequencyData()` drive canvas bars for local and remote audio levels.
- **Live captions** — Delta events from the AI transcript are appended and rendered below the UI.

## Resources

- [OpenAI Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc/)
- [Voice activity detection (VAD) & barge-in](https://developers.openai.com/api/docs/guides/realtime-vad/)
- [Realtime Function Calling](https://platform.openai.com/docs/guides/realtime-function-calling)
- [Realtime Conversations Guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [MDN: RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
