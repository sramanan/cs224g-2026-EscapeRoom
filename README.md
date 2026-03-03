# The Puzzle Master's Escape Room

A voice AI workshop: the frontend shows a locked door with a red light. The AI is **The Enigma** — an eccentric, riddling Puzzle Master who controls the room. Talk to them, solve the riddles, and speak the correct 4-digit passcode to unlock the door (green light + success sound).

## The Scenario

- **You** are trapped. The door is locked; a red light glows.
- **The Enigma** describes the room and guides you to inspect items: a dusty bookshelf, a grandfather clock.
- **You** figure out the passcode from the riddles.
- **You** tell The Enigma the code. If correct, they call `unlock_door` → green light, success sound.

## Workshop Focus

Students write **backend and Realtime API code**. The frontend is provided: door UI, status light, WebRTC connection, data channel, and (in Chapter 5) backend WebSocket integration, visualizers, and captions. Chapters 1–3 implement token and session config; Chapter 4 adds backend event handling (sideband) as a TODO; Chapter 5 is the full implementation with sideband and polish.

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
./scripts/run-chapter.sh 1   # or 2, 3, 4, 5
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

**You implement (backend):** Add The Enigma's persona and turn detection to the session config:

- Generate a random 4-digit passcode (e.g. `random.randint(1000, 9999)`).
- `instructions` — describe room, guide to inspect bookshelf/clock, give riddles. Reveal the passcode gradually across multiple turns (one digit per clue); never give all four digits in one sentence.
- `audio.output.voice: "cedar"` (or alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin)
- `audio.input.turn_detection` — semantic VAD with `interrupt_response: true` for barge-in.

### Chapter 3: Tools & Escape

**You implement (backend):** Register the `unlock_door` tool in the session: `tools` array with a function that accepts `code`, plus `tool_choice: "auto"`. Generate a random passcode and include it in instructions. Return both `value` and `passcode` from `get-token` so the frontend can verify submissions.

The frontend listens for `response.function_call_arguments.done`, checks the code against the passcode from the token response, and triggers the unlock UI + success sound.

### Chapter 4: Backend event handling

**You implement (backend):** Handle tool calls on the server using a sideband WebSocket to the same Realtime session. The chapter is a scaffold with a TODO and a stub that returns "Not implemented"; you add the real logic.

- Frontend still uses WebRTC for audio. After the SDP exchange, the response `Location` header contains a `call_id`. The frontend connects to your backend WebSocket (`/ws`), then sends `{ type: "register_call", call_id, passcode }`.
- **Your backend:** Open a WebSocket to `wss://api.openai.com/v1/realtime?call_id=<call_id>` with your API key. Receive events; on `response.function_call_arguments.done` for `unlock_door`, verify the code against `passcode`, send the tool result and `response.create` to OpenAI, and send `{ type: "unlock_result", success }` to the frontend.
- This keeps tool execution and business logic on the server instead of the client.

Docs: [Realtime server controls (sideband)](https://developers.openai.com/api/docs/guides/realtime-server-controls).

### Chapter 5: Production Polish (full implementation)

**All implemented.** This is the complete app: backend sideband (same pattern as Chapter 4, but fully coded) plus production polish.

- **Backend:** `/get-token` returns token and passcode; `/ws` accepts `register_call`, opens a sideband WebSocket to OpenAI, handles `unlock_door` on the server, and sends `unlock_result` to the frontend.
- **Frontend:** Connects to backend `/ws` with `call_id` and passcode, receives `unlock_result` (no client-side tool handling). Keeps WebRTC for audio and the data channel for captions and disconnect-after-unlock. Audio level meters, live captions, and success sound are included.

Run Chapter 5 to see the full experience.

## Resetting a Chapter

```bash
./scripts/advance-chapter.sh 1
```

Restores the chapter to its original scaffold via `git checkout`.

## Architecture

### Chapters 1–3: Client-side tool handling

The browser talks to your server only for the token; audio and Realtime events go directly between browser and OpenAI. The frontend handles tool calls on the data channel.

```
Browser                          Your Server              OpenAI
  |                                  |                       |
  |-- GET /get-token --------------->|                       |
  |                                  |-- POST /realtime/     |
  |                                  |   client_secrets ---->|
  |                                  |<-- { value, passcode }|
  |<-- { value, passcode } ---------|                        |
  |                                                          |
  |-- POST /realtime/calls (SDP offer, Bearer token) ------>|
  |<-- SDP answer + Location (call_id) ---------------------|
  |                                                          |
  |<=== WebRTC audio + RTCDataChannel (events) =============>|
  |     (frontend handles response.function_call_arguments   |
  |      .done, sends tool result + response.create)         |
```

Session config (instructions, voice, tools) is set when creating the client secret on the backend.

### Chapters 4–5: Backend event handling (sideband)

The frontend still uses WebRTC for audio and the data channel for captions and lifecycle. Tool execution moves to the backend: the frontend registers the call with the backend over a WebSocket; the backend opens a sideband WebSocket to the same Realtime session and handles `unlock_door`, then notifies the frontend with `unlock_result`.

```
Browser                          Your Server                    OpenAI
  |                                  |                              |
  |-- GET /get-token --------------->|                              |
  |<-- { value, passcode } ----------|                              |
  |                                 |                              |
  |-- POST /realtime/calls (SDP) --------------------------------->|
  |<-- SDP answer + Location (call_id) ----------------------------|
  |                                 |                              |
  |-- WS /ws --- register_call ----->|                              |
  |   (call_id, passcode)            |-- WS wss://.../realtime? --->|
  |                                  |    call_id=... (sideband)    |
  |<=== WebRTC audio + data channel (captions, response.done) =====>|
  |                                  |<-- response.function_call_ --|
  |                                  |    arguments.done (unlock)   |
  |                                  |-- tool result + response. --->|
  |                                  |    create                    |
  |<-- unlock_result ----------------|                              |
```

Chapter 4 is a scaffold (you implement the sideband); Chapter 5 is the full implementation with this architecture plus production polish.

## Frontend Overview (for learning)

The frontend is provided so you can focus on backend and Realtime API code. Here’s what it does and how it works.

### Connection flow

1. **Microphone access** — `navigator.mediaDevices.getUserMedia({ audio: true })` asks the user for mic permission and returns a `MediaStream`.
2. **Token fetch** — `fetch("/get-token")` calls your backend; the proxy forwards to `localhost:8000`. It expects `{ value: "ek_..." }`.
3. **WebRTC setup** — Creates an `RTCPeerConnection`, adds the mic track with `addTrack()`, and creates the `oai-events` data channel (before the offer so it’s part of the SDP).
4. **SDP exchange** — `createOffer()` → `setLocalDescription()` → POST the SDP to `https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer <token>`, then `setRemoteDescription(answer)`.
5. **Remote audio** — The `ontrack` handler assigns `e.streams[0]` to a hidden `<audio autoplay>` element so The Enigma’s voice is played.

### Data channel

The `oai-events` channel carries JSON events. The frontend listens with `dc.addEventListener("message", ...)` and parses `JSON.parse(e.data)`.

- **Chapters 1–3:** Reacts to **`response.function_call_arguments.done`** — if `name === "unlock_door"`, parses `arguments`, checks `code` against the passcode from the token response, then sends the tool result and `response.create` on the data channel.
- **Chapters 4–5:** Tool handling is on the backend; the frontend connects to backend `/ws`, sends `register_call` with `call_id` and passcode, and receives **`unlock_result`** from the WebSocket. The data channel is still used for **`response.output_audio_transcript.delta`** (captions), **`response.created`** (clear captions), and **`response.done`** (disconnect after unlock).

### Unlock behavior

When the code is correct, the frontend:

- Calls `setIsUnlocked(true)` — switches the status light from red to green and updates styles.
- Calls `playSuccessSound()` — uses the Web Audio API to play a simple two-tone chime.
- Shows a success banner.

### Chapter 5: Visualizers and captions

- **AnalyserNode** — `createMediaStreamSource()` + `createAnalyser()` connect the mic and remote audio to the Web Audio API.
- **Level meters** — `requestAnimationFrame` + `getByteFrequencyData()` drive canvas bars for local and remote audio levels.
- **Live captions** — Delta events from the AI transcript are appended and rendered below the UI.

## Resources

- [OpenAI Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc/)
- [Realtime server controls (sideband)](https://developers.openai.com/api/docs/guides/realtime-server-controls) — Chapters 4–5
- [Voice activity detection (VAD) & barge-in](https://developers.openai.com/api/docs/guides/realtime-vad/)
- [Realtime Function Calling](https://platform.openai.com/docs/guides/realtime-function-calling)
- [Realtime Conversations Guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [MDN: RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
