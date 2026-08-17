"""
Lightweight centroid-based multi-object tracker.

Assigns persistent IDs to YOLO detections across frames so crime.py and
pollution.py can measure dwell time, stationary duration, and movement
direction per object without needing a heavy tracking library (DeepSORT, etc).

Pure numpy — no scipy dependency required.
"""

import time
from typing import Dict, List, Optional, Tuple

import numpy as np

# How many past centroids to keep per object (for direction/movement analysis)
HISTORY_LENGTH = 30


class TrackedObject:
    def __init__(self, object_id: int, centroid: Tuple[float, float], bbox: Tuple[int, int, int, int],
                 class_name: str, confidence: float, timestamp: float):
        self.object_id = object_id
        self.centroid = centroid
        self.bbox = bbox
        self.class_name = class_name
        self.confidence = confidence
        self.first_seen = timestamp
        self.last_seen = timestamp
        self.disappeared = 0
        self.centroid_history: List[Tuple[float, float, float]] = [(centroid[0], centroid[1], timestamp)]

    def update(self, centroid: Tuple[float, float], bbox: Tuple[int, int, int, int],
               confidence: float, timestamp: float):
        self.centroid = centroid
        self.bbox = bbox
        self.confidence = confidence
        self.last_seen = timestamp
        self.disappeared = 0
        self.centroid_history.append((centroid[0], centroid[1], timestamp))
        if len(self.centroid_history) > HISTORY_LENGTH:
            self.centroid_history.pop(0)

    @property
    def dwell_seconds(self) -> float:
        return self.last_seen - self.first_seen

    @property
    def max_displacement(self) -> float:
        """Max distance (px) the centroid has moved from its earliest recorded position
        within the retained history window. Used to detect stationary/abandoned objects."""
        if len(self.centroid_history) < 2:
            return 0.0
        xs = [c[0] for c in self.centroid_history]
        ys = [c[1] for c in self.centroid_history]
        ox, oy = xs[0], ys[0]
        return max(((x - ox) ** 2 + (y - oy) ** 2) ** 0.5 for x, y in zip(xs, ys))

    def direction_vector(self) -> Optional[Tuple[float, float]]:
        """Normalized movement direction from oldest to newest retained centroid."""
        if len(self.centroid_history) < 2:
            return None
        x0, y0, _ = self.centroid_history[0]
        x1, y1, _ = self.centroid_history[-1]
        dx, dy = x1 - x0, y1 - y0
        mag = (dx ** 2 + dy ** 2) ** 0.5
        if mag < 1e-6:
            return None
        return (dx / mag, dy / mag)


class CentroidTracker:
    def __init__(self, max_disappeared: int = 20, max_distance: float = 90.0):
        self.next_object_id = 0
        self.objects: Dict[int, TrackedObject] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def _register(self, centroid, bbox, class_name, confidence, timestamp):
        self.objects[self.next_object_id] = TrackedObject(
            self.next_object_id, centroid, bbox, class_name, confidence, timestamp
        )
        self.next_object_id += 1

    def _deregister(self, object_id: int):
        del self.objects[object_id]

    @staticmethod
    def _bbox_centroid(bbox: Tuple[int, int, int, int]) -> Tuple[float, float]:
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    def update(self, detections: List[dict], timestamp: Optional[float] = None) -> Dict[int, TrackedObject]:
        """
        detections: list of {"bbox": (x1,y1,x2,y2), "class_name": str, "confidence": float}
        Returns the current dict of active TrackedObjects (object_id -> TrackedObject).
        """
        timestamp = timestamp if timestamp is not None else time.time()

        if len(detections) == 0:
            for object_id in list(self.objects.keys()):
                self.objects[object_id].disappeared += 1
                if self.objects[object_id].disappeared > self.max_disappeared:
                    self._deregister(object_id)
            return self.objects

        input_centroids = [self._bbox_centroid(d["bbox"]) for d in detections]

        if len(self.objects) == 0:
            for i, centroid in enumerate(input_centroids):
                self._register(centroid, detections[i]["bbox"], detections[i]["class_name"],
                                detections[i]["confidence"], timestamp)
            return self.objects

        object_ids = list(self.objects.keys())
        object_centroids = [self.objects[oid].centroid for oid in object_ids]

        D = np.linalg.norm(
            np.array(object_centroids)[:, np.newaxis, :] - np.array(input_centroids)[np.newaxis, :, :],
            axis=2,
        )

        used_rows = set()
        used_cols = set()

        # Greedy nearest-neighbor matching, closest pairs first.
        flat_indices = np.dstack(np.unravel_index(np.argsort(D, axis=None), D.shape))[0]
        for row, col in flat_indices:
            row, col = int(row), int(col)
            if row in used_rows or col in used_cols:
                continue
            if D[row, col] > self.max_distance:
                continue
            object_id = object_ids[row]
            det = detections[col]
            self.objects[object_id].update(input_centroids[col], det["bbox"], det["confidence"], timestamp)
            used_rows.add(row)
            used_cols.add(col)

        unused_rows = set(range(len(object_ids))) - used_rows
        unused_cols = set(range(len(input_centroids))) - used_cols

        for row in unused_rows:
            object_id = object_ids[row]
            self.objects[object_id].disappeared += 1
            if self.objects[object_id].disappeared > self.max_disappeared:
                self._deregister(object_id)

        for col in unused_cols:
            det = detections[col]
            self._register(input_centroids[col], det["bbox"], det["class_name"], det["confidence"], timestamp)

        return self.objects
