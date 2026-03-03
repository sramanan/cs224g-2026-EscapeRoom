import { useState, useRef, useEffect } from "react";

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(523.25, 0, 0.15);
    playTone(659.25, 0.15, 0.2);
  } catch (_) {}
}

const CHARS_PER_MS = 0.12; // ~speech rate for throttled assistant text

export default function App() {
  const [status, setStatus] = useState("Click connect to enter the room...");
  const [isConnected, setIsConnected] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [guessedCodes, setGuessedCodes] = useState([]);
  const audioRef = useRef(null);
  const localCanvasRef = useRef(null);
  const remoteCanvasRef = useRef(null);
  const dcRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const sidebandWsRef = useRef(null);
  const pendingDisconnectRef = useRef(false);
  const assistantBufferRef = useRef("");
  const assistantRevealedRef = useRef(0);
  const throttleIntervalRef = useRef(null);
  const userBufferRef = useRef("");

  useEffect(() => {
    document.body.className = isUnlocked ? "unlocked" : "locked";
  }, [isUnlocked]);

  async function connect() {
    setStatus("Connecting...");
    setTranscriptSegments([]);
    setGuessedCodes([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const localSource = audioCtx.createMediaStreamSource(stream);
      const localAnalyser = audioCtx.createAnalyser();
      localAnalyser.fftSize = 256;
      localSource.connect(localAnalyser);

      function drawLocal() {
        requestAnimationFrame(drawLocal);
        const data = new Uint8Array(localAnalyser.frequencyBinCount);
        localAnalyser.getByteFrequencyData(data);
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const h = (avg / 255) * canvas.height;
        ctx.fillStyle = "#e94560";
        ctx.fillRect(0, canvas.height - h, canvas.width, h);
      }
      drawLocal();

      streamRef.current = stream;

      const tokenRes = await fetch("/get-token");
      const data = await tokenRes.json();
      const token = data.value;
      const passcode = data.passcode ?? "7314";  // fallback for older backend

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => {
        audioRef.current.srcObject = e.streams[0];

        const remoteSource = audioCtx.createMediaStreamSource(e.streams[0]);
        const remoteAnalyser = audioCtx.createAnalyser();
        remoteAnalyser.fftSize = 256;
        remoteSource.connect(remoteAnalyser);

        function drawRemote() {
          requestAnimationFrame(drawRemote);
          const buf = new Uint8Array(remoteAnalyser.frequencyBinCount);
          remoteAnalyser.getByteFrequencyData(buf);
          const canvas = remoteCanvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
          const h = (avg / 255) * canvas.height;
          ctx.fillStyle = "#4ade80";
          ctx.fillRect(0, canvas.height - h, canvas.width, h);
        }
        drawRemote();
      };

      pc.addTrack(stream.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      function stopThrottle() {
        if (throttleIntervalRef.current) {
          clearInterval(throttleIntervalRef.current);
          throttleIntervalRef.current = null;
        }
      }

      function startThrottle() {
        if (throttleIntervalRef.current) return;
        const start = Date.now();
        throttleIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - start;
          const targetReveal = Math.floor(elapsed * CHARS_PER_MS);
          const buf = assistantBufferRef.current;
          if (assistantRevealedRef.current >= buf.length) {
            stopThrottle();
            return;
          }
          const toReveal = Math.min(targetReveal - assistantRevealedRef.current, buf.length - assistantRevealedRef.current);
          if (toReveal <= 0) return;
          assistantRevealedRef.current += toReveal;
          const revealed = buf.slice(0, assistantRevealedRef.current);
          setTranscriptSegments((prev) => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].speaker === "assistant") {
              next[next.length - 1] = { ...next[next.length - 1], text: revealed };
            }
            return next;
          });
        }, 50);
      }

      dc.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "response.done" && pendingDisconnectRef.current) {
          pendingDisconnectRef.current = false;
          stopThrottle();
          pcRef.current?.close();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          pcRef.current = null;
          dcRef.current = null;
          sidebandWsRef.current?.close();
          sidebandWsRef.current = null;
          setIsConnected(false);
        }
        if (event.type === "conversation.item.input_audio_transcription.delta") {
          userBufferRef.current += event.delta ?? "";
        }
        if (event.type === "conversation.item.input_audio_transcription.completed") {
          const text = (event.transcript ?? userBufferRef.current).trim();
          userBufferRef.current = "";
          if (text) {
            setTranscriptSegments((prev) => [...prev, { speaker: "user", text }]);
          }
        }
        if (event.type === "response.created") {
          const pendingUser = userBufferRef.current.trim();
          if (pendingUser) {
            setTranscriptSegments((prev) => [...prev, { speaker: "user", text: pendingUser }]);
            userBufferRef.current = "";
          }
          stopThrottle();
          assistantBufferRef.current = "";
          assistantRevealedRef.current = 0;
          setTranscriptSegments((prev) => [...prev, { speaker: "assistant", text: "" }]);
        }
        if (event.type === "response.output_audio_transcript.delta") {
          assistantBufferRef.current += event.delta ?? "";
          startThrottle();
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/sdp",
          },
        }
      );

      const location = sdpResponse.headers.get("Location");
      const callId = location ? location.split("/").pop() : null;
      if (!callId) {
        throw new Error("No call_id in SDP response Location");
      }

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      const sidebandWs = new WebSocket(`${wsProtocol}//${wsHost}/ws`);
      sidebandWsRef.current = sidebandWs;
      await new Promise((resolve, reject) => {
        sidebandWs.onopen = resolve;
        sidebandWs.onerror = () => reject(new Error("Sideband WebSocket failed"));
      });
      sidebandWs.send(JSON.stringify({ type: "register_call", call_id: callId, passcode }));

      sidebandWs.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "unlock_result") {
          if (msg.guessed_code) {
            setGuessedCodes((prev) => [...prev, msg.guessed_code]);
          }
          if (msg.success) {
            setIsUnlocked(true);
            setStatus("The door swings open — you're free!");
            playSuccessSound();
            pendingDisconnectRef.current = true;
          } else {
            setStatus("Wrong code — keep searching for clues!");
          }
        }
      };

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      const sendAgentFirst = () => {
        const trigger = () => dc.send(JSON.stringify({ type: "response.create" }));
        if (dc.readyState === "open") {
          setTimeout(trigger, 1800);
        } else {
          dc.addEventListener("open", () => setTimeout(trigger, 1800), { once: true });
        }
      };
      sendAgentFirst();

      setIsConnected(true);
      setStatus("Ask to inspect the bookshelf and clock. Solve the riddles and tell The Enigma the code!");
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <div className="container">
      <div className="door">
        <div className="door-panel" />
        <div
          className={`status-light ${isUnlocked ? "unlocked" : "locked"}`}
          title={isUnlocked ? "Unlocked" : "Locked"}
        />
      </div>
      <h1>
        {isUnlocked
          ? "You Escaped!"
          : "The Puzzle Master's Escape Room"}
      </h1>
      <p className="subtitle">Chapter 5 — Production Polish</p>

      <div className="status">{status}</div>
      {isConnected && (
        <p className="tip">Tip: Use headphones so the mic doesn&apos;t pick up The Enigma&apos;s voice.</p>
      )}

      {isUnlocked && (
        <div className="success-banner">The Enigma has unlocked the door!</div>
      )}

      <div className="visualizers">
        <div className="visualizer">
          <label>You</label>
          <canvas ref={localCanvasRef} width={80} height={60} />
        </div>
        <div className="visualizer">
          <label>The Enigma</label>
          <canvas ref={remoteCanvasRef} width={80} height={60} />
        </div>
      </div>

      <button onClick={connect} disabled={isConnected}>
        {isConnected ? "Connected" : "Connect"}
      </button>

      {guessedCodes.length > 0 && (
        <div className="guessed-codes">
          <span className="guessed-codes-label">Guessed:</span>{" "}
          {guessedCodes.map((code, i) => (
            <span key={i} className="guessed-code">
              {code}
            </span>
          ))}
        </div>
      )}

      <div className="captions transcript">
        {transcriptSegments.length === 0 ? (
          "Captions will appear here..."
        ) : (
          transcriptSegments.map((seg, i) => (
            <div key={i} className={`transcript-line transcript-${seg.speaker}`}>
              <span className="transcript-speaker">{seg.speaker === "user" ? "You" : "The Enigma"}:</span> {seg.text}
            </div>
          ))
        )}
      </div>

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
