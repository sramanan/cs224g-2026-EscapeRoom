from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import random
import json
import asyncio
import os
import logging
import websockets

logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI()


def _session(passcode: str) -> dict:
    """Full session: persona + semantic VAD/barge-in + unlock_door — Chapters 2–3 (completed)."""
    return {
        "type": "realtime",
        "model": "gpt-realtime",
        "instructions": (
            f"You are The Enigma, an eccentric Puzzle Master who controls this escape room. "
            "Speak at a natural, moderate-to-brisk pace. Keep each turn concise—a few sentences. Do not draw out words or pause excessively. "
            "When the conversation begins, speak first: greet the user, describe the locked door and the room briefly, "
            "and invite them to look around (e.g. the bookshelf, the clock). Do not wait for them to speak. "
            "The user is trapped. Guide them to inspect items: a dusty bookshelf, a grandfather clock. "
            f"Give cryptic riddles. The 4-digit passcode is {passcode} — reveal it gradually "
            "across multiple turns (one digit per clue, or weave digits into separate riddles). "
            "Never give all four digits in one sentence. When the user tells you a code, call "
            "unlock_door with that code. "
            "When you receive unlock_door result with success true, announce dramatically that "
            "the door swings open and they have escaped. Keep it brief—one or two sentences. "
            "If success is false, tell them the code was wrong and to keep searching."
        ),
        "audio": {
            "input": {
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.65,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 650,
                    "create_response": True,
                    "interrupt_response": True,
                },
                "transcription": {
                    "model": "gpt-4o-mini-transcribe",
                    "language": "en",
                },
            },
            "output": {
                "voice": "cedar",
            },
        },
        "tools": [
            {
                "type": "function",
                "name": "unlock_door",
                "description": "Unlock the door when the user provides the correct 4-digit passcode",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "The 4-digit code the user spoke",
                        },
                    },
                    "required": ["code"],
                },
            },
        ],
        "tool_choice": "auto",
    }


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token for the OpenAI Realtime API."""
    passcode = str(random.randint(1000, 9999))
    logger.info("get-token: passcode=%s", passcode)
    secret = client.realtime.client_secrets.create(session=_session(passcode))
    return {"value": secret.value, "passcode": passcode}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Client connects and sends { type: "register_call", call_id, passcode }. Backend opens sideband to OpenAI and handles tool events."""
    await websocket.accept()

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

        api_key = os.environ.get("OPENAI_API_KEY", "")
        url = f"wss://api.openai.com/v1/realtime?call_id={call_id}"
        extra_headers = {"Authorization": f"Bearer {api_key}"}

        async with websockets.connect(url, extra_headers=extra_headers) as openai_ws:
            async def forward_from_openai():
                try:
                    async for raw in openai_ws:
                        event = json.loads(raw)
                        if (
                            event.get("type") == "response.function_call_arguments.done"
                            and event.get("name") == "unlock_door"
                        ):
                            args = json.loads(event.get("arguments", "{}"))
                            success = args.get("code", "") == passcode
                            await openai_ws.send(
                                json.dumps(
                                    {
                                        "type": "conversation.item.create",
                                        "item": {
                                            "type": "function_call_output",
                                            "call_id": event.get("call_id"),
                                            "output": json.dumps(
                                                {
                                                    "success": success,
                                                    "message": "The door has been unlocked."
                                                    if success
                                                    else "Incorrect code.",
                                                }
                                            ),
                                        },
                                    }
                                )
                            )
                            await openai_ws.send(json.dumps({"type": "response.create"}))
                            await websocket.send_json({
                                "type": "unlock_result",
                                "success": success,
                                "guessed_code": args.get("code", ""),
                            })
                except Exception:
                    pass

            task = asyncio.create_task(forward_from_openai())
            try:
                while True:
                    text = await websocket.receive_text()
                    try:
                        await openai_ws.send(text)
                    except Exception:
                        break
            except WebSocketDisconnect:
                pass
            finally:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

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
