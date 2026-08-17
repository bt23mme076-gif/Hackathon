"""
Crime detection logic for DrishtiAI.

Consumes the per-frame TrackedObject dict produced by tracker.CentroidTracker
and raises alerts for:
  - Crowd surge: 10+ people detected in a single frame
  - Abandoned object: a backpack/suitcase stationary for 60+ seconds
  - Wrong-way vehicle: a vehicle moving opposite to the junction's expected
    traffic direction

Each camera gets its own CrimeDetector instance (state — cooldowns, stationary
tracking — must not leak across cameras).
"""

import time
from typing import Dict, List, Optional, Tuple

from tracker import TrackedObject

CROWD_THRESHOLD = 10
ABANDONED_TIMEOUT = 60          # seconds an object must stay put to count as abandoned
ABANDONED_MAX_DISPLACEMENT = 25  # px — under this, object counts as "stationary"
ALERT_COOLDOWN = 60             # seconds before the same alert type fires again
MIN_CONFIDENCE = 0.45

PERSON_CLASSES = {"person"}
ABANDONED_OBJECT_CLASSES = {"backpack", "suitcase", "handbag"}
VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}


class CrimeDetector:
    def __init__(self, camera_id: str, expected_direction: Optional[Tuple[float, float]] = None):
        """
        camera_id: which camera this detector instance belongs to.
        expected_direction: normalized (dx, dy) of the junction's expected
            traffic flow, in image coordinates. If None, wrong-way detection
            is skipped for this camera (no calibrated direction available).
        """
        self.camera_id = camera_id
        self.expected_direction = expected_direction
        self._last_alert_time: Dict[str, float] = {}
        self._abandoned_start: Dict[int, float] = {}  # object_id -> time first seen stationary
        self._already_flagged_abandoned: set = set()
        self._already_flagged_wrong_way: set = set()

    def _cooldown_ready(self, alert_type: str, now: float) -> bool:
        last = self._last_alert_time.get(alert_type)
        if last is None or (now - last) >= ALERT_COOLDOWN:
            self._last_alert_time[alert_type] = now
            return True
        return False

    def check_crowd_surge(self, tracked_objects: Dict[int, TrackedObject], now: float) -> Optional[dict]:
        people = [
            obj for obj in tracked_objects.values()
            if obj.class_name in PERSON_CLASSES and obj.confidence >= MIN_CONFIDENCE
        ]
        if len(people) < CROWD_THRESHOLD:
            return None
        if not self._cooldown_ready("crowd_surge", now):
            return None

        avg_confidence = sum(p.confidence for p in people) / len(people)
        return {
            "alert_type": "crowd_surge",
            "confidence": round(avg_confidence, 2),
            "count": len(people),
        }

    def check_abandoned_objects(self, tracked_objects: Dict[int, TrackedObject], now: float) -> List[dict]:
        alerts = []
        active_ids = set()

        for obj in tracked_objects.values():
            if obj.class_name not in ABANDONED_OBJECT_CLASSES or obj.confidence < MIN_CONFIDENCE:
                continue
            active_ids.add(obj.object_id)

            if obj.max_displacement > ABANDONED_MAX_DISPLACEMENT:
                # Object is moving (being carried) — reset its stationary clock.
                self._abandoned_start.pop(obj.object_id, None)
                self._already_flagged_abandoned.discard(obj.object_id)
                continue

            stationary_since = self._abandoned_start.setdefault(obj.object_id, obj.first_seen)
            stationary_duration = now - stationary_since

            if stationary_duration >= ABANDONED_TIMEOUT and obj.object_id not in self._already_flagged_abandoned:
                if self._cooldown_ready(f"abandoned_object_{obj.object_id}", now):
                    self._already_flagged_abandoned.add(obj.object_id)
                    alerts.append({
                        "alert_type": "abandoned_object",
                        "confidence": round(obj.confidence, 2),
                        "count": 1,
                    })

        # Clean up state for objects no longer tracked (left frame / picked up).
        stale = set(self._abandoned_start.keys()) - active_ids
        for object_id in stale:
            self._abandoned_start.pop(object_id, None)
            self._already_flagged_abandoned.discard(object_id)

        return alerts

    def check_wrong_way_vehicles(self, tracked_objects: Dict[int, TrackedObject], now: float) -> List[dict]:
        if self.expected_direction is None:
            return []

        alerts = []
        ex, ey = self.expected_direction

        for obj in tracked_objects.values():
            if obj.class_name not in VEHICLE_CLASSES or obj.confidence < MIN_CONFIDENCE:
                continue
            if obj.object_id in self._already_flagged_wrong_way:
                continue

            direction = obj.direction_vector()
            if direction is None:
                continue

            dx, dy = direction
            dot_product = (dx * ex) + (dy * ey)  # cosine similarity (unit vectors)

            if dot_product < -0.5:  # moving substantially opposite to expected flow
                if self._cooldown_ready(f"wrong_way_{obj.object_id}", now):
                    self._already_flagged_wrong_way.add(obj.object_id)
                    alerts.append({
                        "alert_type": "wrong_way_vehicle",
                        "confidence": round(obj.confidence, 2),
                        "count": 1,
                    })

        return alerts

    def analyze(self, tracked_objects: Dict[int, TrackedObject], now: Optional[float] = None) -> List[dict]:
        """Run all crime checks for this frame and return a list of alert dicts
        ready to be sent to the backend's POST /detect endpoint."""
        now = now if now is not None else time.time()

        alerts: List[dict] = []

        crowd_alert = self.check_crowd_surge(tracked_objects, now)
        if crowd_alert:
            alerts.append(crowd_alert)

        alerts.extend(self.check_abandoned_objects(tracked_objects, now))
        alerts.extend(self.check_wrong_way_vehicles(tracked_objects, now))

        return alerts
