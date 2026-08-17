"""
Pollution index logic for DrishtiAI (original algorithm).

Consumes the per-frame TrackedObject dict produced by tracker.CentroidTracker,
tracks how long each vehicle dwells in frame, and computes a CO2 score per
junction (camera) using CPCB India emission factors.

    CO2 = vehicle_count x emission_rate (g/min) x dwell_minutes

One PollutionTracker instance per camera. Call `update()` every frame with the
current tracked objects, and `flush_if_due()` once per loop iteration — it
returns a score payload every JUNCTION_UPDATE_INTERVAL seconds (default 60s)
and resets the window.
"""

import time
from typing import Dict, Optional

from tracker import TrackedObject

EMISSION_RATES = {
    "car": 2.3,
    "truck": 8.7,
    "bus": 8.7,
    "motorcycle": 1.1,
}

VEHICLE_CLASSES = set(EMISSION_RATES.keys())
MIN_CONFIDENCE = 0.45

JUNCTION_UPDATE_INTERVAL = 60  # seconds — how often a pollution score is emitted

GREEN_MAX = 50
YELLOW_MAX = 150


def score_level(score: float) -> str:
    if score <= GREEN_MAX:
        return "GREEN"
    if score <= YELLOW_MAX:
        return "YELLOW"
    return "RED"


class PollutionTracker:
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        self._window_start = time.time()
        # object_id -> class_name, for vehicles seen at least once in the current window
        self._seen_this_window: Dict[int, str] = {}

    def update(self, tracked_objects: Dict[int, TrackedObject], now: Optional[float] = None):
        """Record which vehicles are present this frame. Call every frame."""
        for obj in tracked_objects.values():
            if obj.class_name in VEHICLE_CLASSES and obj.confidence >= MIN_CONFIDENCE:
                self._seen_this_window[obj.object_id] = obj.class_name

    def flush_if_due(self, tracked_objects: Dict[int, TrackedObject], now: Optional[float] = None) -> Optional[dict]:
        """
        If JUNCTION_UPDATE_INTERVAL seconds have elapsed since the window
        started, compute the pollution score for the window and reset it.
        Returns a payload dict ready for POST /detect, or None if not due yet.
        """
        now = now if now is not None else time.time()
        elapsed = now - self._window_start
        if elapsed < JUNCTION_UPDATE_INTERVAL:
            return None

        dwell_minutes = elapsed / 60.0

        counts = {"car": 0, "truck": 0, "bus": 0, "motorcycle": 0}
        for class_name in self._seen_this_window.values():
            counts[class_name] = counts.get(class_name, 0) + 1

        total_co2 = sum(
            count * EMISSION_RATES[class_name] * dwell_minutes
            for class_name, count in counts.items()
        )
        total_co2 = round(total_co2, 2)

        payload = {
            "cars": counts["car"],
            "trucks": counts["truck"] + counts["bus"],
            "motorcycles": counts["motorcycle"],
            "total_co2": total_co2,
            "score": total_co2,
            "level": score_level(total_co2),
        }

        # Reset window; carry forward vehicles still on screen so a vehicle
        # that never leaves keeps accruing dwell time in the next window too.
        self._window_start = now
        self._seen_this_window = {
            obj.object_id: obj.class_name
            for obj in tracked_objects.values()
            if obj.class_name in VEHICLE_CLASSES and obj.confidence >= MIN_CONFIDENCE
        }

        return payload
