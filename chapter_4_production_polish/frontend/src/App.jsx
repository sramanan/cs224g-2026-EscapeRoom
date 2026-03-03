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

export default function App() {
  const [status, setStatus] = useState("Click connect to enter the room...");
  const [isConnected, setIsConnected] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [caption, setCaption] = useState("");
  const audioRef = useRef(null);
  const localCanvasRef = useRef(null);
  const remoteCanvasRef = useRef(null);
  const dcRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const pendingDisconnectRef = useRef(false);

  useEffect(() => {
    document.body.className = isUnlocked ? "unlocked" : "locked";
  }, [isUnlocked]);

  async function connect() {
    setStatus("Connecting...");

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

      dc.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);

        if (event.type === "response.function_call_arguments.done") {
          if (event.name === "unlock_door") {
            const args = JSON.parse(event.arguments);
            const callId = event.call_id;
            const success = args.code === passcode;

            if (success) {
              setIsUnlocked(true);
              setStatus("The door swings open — you're free!");
              playSuccessSound();
              pendingDisconnectRef.current = true;
            } else {
              setStatus(`Wrong code: "${args.code}" — keep searching for clues!`);
            }

            if (dc.readyState === "open" && callId) {
              dc.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({
                      success,
                      message: success ? "The door has been unlocked." : "Incorrect code.",
                    }),
                  },
                })
              );
              dc.send(JSON.stringify({ type: "response.create" }));
            }
          }
        }

        if (event.type === "response.done" && pendingDisconnectRef.current) {
          pendingDisconnectRef.current = false;
          pcRef.current?.close();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          pcRef.current = null;
          dcRef.current = null;
          setIsConnected(false);
        }

        if (event.type === "response.output_audio_transcript.delta") {
          setCaption((prev) => prev + event.delta);
        }
        if (event.type === "response.created") {
          setCaption("");
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

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

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
      <p className="subtitle">Chapter 4 — Production Polish</p>

      <div className="status">{status}</div>

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

      <div className="captions">{caption || "Captions will appear here..."}</div>

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
