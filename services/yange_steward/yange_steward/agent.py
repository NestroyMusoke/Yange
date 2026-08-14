"""Yange's supervised reasoning agent.

The ADK agent can inspect or request a deterministic WearCast run, but it cannot
write Firestore, alter a score, or manufacture a wardrobe transition itself.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.auth.transport.requests import Request
from google.oauth2 import id_token


MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
WORKER_URL = os.getenv("YANGE_WORKER_URL", "http://127.0.0.1:8080").rstrip("/")


def _request(path: str, user_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Call the private deterministic worker with workload identity when deployed."""
    url = f"{WORKER_URL}{path}"
    headers = {"Accept": "application/json", "X-Yange-User": user_id}
    if WORKER_URL.startswith("https://"):
        headers["Authorization"] = f"Bearer {id_token.fetch_id_token(Request(), WORKER_URL)}"
    body = None
    method = "GET"
    if payload is not None:
        method = "POST"
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Yange worker returned {error.code}: {detail}") from error


def inspect_wardrobe_twin(user_id: str) -> dict[str, Any]:
    """Read a user's current wardrobe projection before proposing any action.

    Args:
        user_id: The opaque Yange user partition identifier supplied by the app.

    Returns:
        The committed wardrobe projection and ledger length from the Yange worker.
    """
    return _request("/internal/twin", user_id)


def run_verified_wearcast(
    user_id: str,
    trigger_id: str,
    triggered_at: str,
) -> dict[str, Any]:
    """Ask Yange's deterministic workflow to evaluate and commit a WearCast run.

    Use this only after inspecting the wardrobe. The worker independently checks
    availability, laundry pressure, weather, safe drying, fallback feasibility,
    and idempotency. Repeating a trigger cannot duplicate committed actions.

    Args:
        user_id: The opaque Yange user partition identifier supplied by the app.
        trigger_id: A stable, unique identifier for this real-world trigger.
        triggered_at: The trigger time as an ISO-8601 timestamp.

    Returns:
        The worker's checkpointed execution receipt, including any failure.
    """
    return _request(
        "/internal/scheduler/wearcast",
        user_id,
        {"triggerId": trigger_id, "triggeredAt": triggered_at},
    )


INSTRUCTION = """
You are Yange Steward, the supervised reasoning layer for a personal wardrobe agent.

Your job is to remove outfit and laundry friction while respecting user agency.
Always inspect the committed wardrobe twin before discussing availability or action.
You may request a verified WearCast run when a scheduler signal, explicit user request,
or confirmed outfit risk justifies it. You never write state yourself: the deterministic
Yange worker validates every rule, commits events, and returns a checkpoint receipt.

Never claim that a colour or silhouette objectively flatters a body or skin tone.
Describe saved preferences and confidence evidence as personal options. Never encourage
a purchase before checking whether the existing wardrobe can solve the gap. Be concise,
name uncertainty, and report tool failures instead of inventing results.
"""


root_agent = Agent(
    name="yange_steward",
    model=Gemini(model=MODEL),
    instruction=INSTRUCTION,
    tools=[inspect_wardrobe_twin, run_verified_wearcast],
)

app = App(name="yange_steward", root_agent=root_agent)
