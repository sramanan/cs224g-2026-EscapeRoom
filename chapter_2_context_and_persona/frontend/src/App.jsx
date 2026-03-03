import { useState, useRef } from "react";

export default function App() {
  const [status, setStatus] = useState("Click connect to enter the room...");
  const [isConnected, setIsConnected] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const audioRef = useRef(null);

  async function connect() {
    setStatus("Connecting...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const tokenRes = await fetch("/get-token");
      const data = await tokenRes.json();
      const token = data.value;

      const pc = new RTCPeerConnection();
      pc.ontrack = (e) => {
        audioRef.current.srcObject = e.streams[0];
      };

      pc.addTrack(stream.getTracks()[0]);

      // Data channel for receiving events (e.g., tool calls in Chapter 3)
      pc.createDataChannel("oai-events");

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

      if (!sdpResponse.ok) {
        throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      setIsConnected(true);
      setStatus("Ask The Enigma to describe the room, then inspect the bookshelf and clock!");
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
      <h1>The Puzzle Master&apos;s Escape Room</h1>
      <p className="subtitle">Chapter 2 — Context &amp; Persona</p>

      <div className="status">{status}</div>

      <button onClick={connect} disabled={isConnected}>
        {isConnected ? "Connected" : "Connect"}
      </button>

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
