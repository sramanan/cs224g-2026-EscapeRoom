from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import random
import json
import os

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI()


def _base_session(passcode: str):
    """Session with The Enigma persona + semantic VAD/barge-in + unlock_door."""
    return {
        "type": "realtime",
        "model": "gpt-realtime",
        "instructions": (
            f"You are The Enigma, an eccentric Puzzle Master who controls this escape room. "
            "The user is trapped. Describe the room when asked. "
            "Guide them to inspect items: a dusty bookshelf, a grandfather clock. "
            f"Give cryptic riddles. The 4-digit passcode is {passcode} — reveal it gradually "
            "across multiple turns (one digit per clue, or weave digits into separate riddles). "
            "Never give all four digits in one sentence. When the user tells you a code, call "
            "unlock_door with that code. "
            "When you receive unlock_door result with success true, announce dramatically that "
            "the door swings open and they have escaped. Keep it brief. If success is false, tell "
            "them the code was wrong."
        ),
        "audio": {
            "input": {
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "auto",
                    "create_response": True,
                    "interrupt_response": True,
                }
            },
            "output": {"voice": "cedar"},
        },
        "tools": [
            {
                "type": "function",
                "name": "unlock_door",
                "description": "Unlock the door when the user provides the correct 4-digit passcode",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "The 4-digit code the user spoke"},
                    },
                    "required": ["code"],
                },
            },
        ],
        "tool_choice": "auto",
    }


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token and passcode. Frontend uses token for WebRTC; passcode is sent to backend for tool verification."""
    passcode = str(random.randint(1000, 9999))
    session = _base_session(passcode)
    secret = client.realtime.client_secrets.create(session=session)
    return {"value": secret.value, "passcode": passcode}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Client connects and sends { type: "register_call", call_id, passcode }. Backend opens sideband to OpenAI and handles tool events."""
    await websocket.accept()
    passcode = None

    try:
        data = await websocket.receive_text()
        msg = json.loads(data)
        if msg.get("type") != "register_call":
            await websocket.send_json({"type": "error", "message": "Expected register_call"})
            return
        call_id = msg.get("call_id")
        passcode = msg.get("passcode")
        if not call_id or not passcode:
            await websocket.send_json({"type": "error", "message": "call_id and passcode required"})
            return

        # TODO: CHAPTER 4 — Connect to OpenAI sideband and handle tool calls
        #
        # 1. Open a WebSocket to wss://api.openai.com/v1/realtime?call_id=<call_id>
        #    with header Authorization: Bearer <OPENAI_API_KEY>. Use the "websockets" library (already in pyproject).
        #
        # 2. When you receive response.function_call_arguments.done with name "unlock_door":
        #    - Parse event.arguments (JSON string) to get the code the user spoke.
        #    - Compare to passcode; send conversation.item.create (type: function_call_output,
        #      call_id: event.call_id, output: JSON string with success and message) to OpenAI.
        #    - Send response.create to OpenAI so the model can announce the result.
        #    - Send { type: "unlock_result", success: bool } to the frontend websocket.
        #
        # 3. Run the OpenAI WebSocket receive loop. Keep the connection alive until the client disconnects.
        #
        # Docs: https://developers.openai.com/api/docs/guides/realtime-server-controls

        await websocket.send_json({"type": "error", "message": "Not implemented — complete the TODO above."})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
