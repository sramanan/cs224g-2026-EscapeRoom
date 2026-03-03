import { useState, useRef } from "react";

export default function App() {
  const [status, setStatus] = useState("Click connect to enter the room...");
  const [isConnected, setIsConnected] = useState(false);
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
      setStatus("Connected — ask The Enigma to describe the room!");
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <div className="container">
      <div className="door">
        <div className="door-panel" />
        <div className="status-light locked" title="Locked" />
      </div>
      <h1>The Puzzle Master&apos;s Escape Room</h1>
      <p className="subtitle">Chapter 1 — Connection</p>

      <div className="status">{status}</div>

      <button onClick={connect} disabled={isConnected}>
        {isConnected ? "Connected" : "Connect"}
      </button>

      <audio ref={audioRef} autoPlay />
    </div>
  );
}
