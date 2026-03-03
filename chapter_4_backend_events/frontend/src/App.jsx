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
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const pendingDisconnectRef = useRef(false);
  const backendWsRef = useRef(null);

  useEffect(() => {
    document.body.className = isUnlocked ? "unlocked" : "locked";
  }, [isUnlocked]);

  async function connect() {
    setStatus("Connecting...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const tokenRes = await fetch("/get-token");
      const data = await tokenRes.json();
      const token = data.value;
      const passcode = data.passcode ?? "7314";

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      const backendWs = new WebSocket(`${wsProtocol}//${wsHost}/ws`);
      backendWsRef.current = backendWs;

      backendWs.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "unlock_result") {
          if (msg.success) {
            setIsUnlocked(true);
            setStatus("The door swings open — you're free!");
            playSuccessSound();
            pendingDisconnectRef.current = true;
          } else {
            setStatus("Wrong code — keep searching for clues!");
          }
        } else if (msg.type === "error") {
          setStatus(`Error: ${msg.message}`);
        }
      };

      await new Promise((resolve, reject) => {
        backendWs.onopen = resolve;
        backendWs.onerror = () => reject(new Error("WebSocket failed"));
        if (backendWs.readyState === WebSocket.OPEN) resolve();
      });

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => {
        audioRef.current.srcObject = e.streams[0];
      };

      pc.addTrack(stream.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      dc.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "response.done" && pendingDisconnectRef.current) {
          pendingDisconnectRef.current = false;
          pcRef.current?.close();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          pcRef.current = null;
          backendWsRef.current?.close();
          backendWsRef.current = null;
          setIsConnected(false);
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
      if (callId) {
        backendWs.send(
          JSON.stringify({
            type: "register_call",
            call_id: callId,
            passcode,
          })
        );
      }

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
      <p className="subtitle">Chapter 4 — Backend event handling</p>

      <div className="status">{status}</div>

      {isUnlocked && (
        <div className="success-banner">The Enigma has unlocked the door!</div>
      )}

      <button onClick={connect} disabled={isConnected}>
        {isConnected ? "Connected" : "Connect"}
      </button>

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
