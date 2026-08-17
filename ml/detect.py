"""
DrishtiAI main detection loop.

Runs on the machine with the GPU (RTX 3050). Reads 4 simulated CCTV feeds
(MP4 files), runs YOLOv8n on each frame, feeds detections through the
per-camera tracker, crime detector, and pollution tracker, then POSTs
results to the FastAPI backend once per second per camera.

Single-threaded round-robin across cameras: one frame from cam01, one from
cam02, etc, then repeat. Keeps everything on one YOLO model instance without
concurrent inference calls (ultralytics/torch is not guaranteed safe for
overlapping forward passes on a shared model from multiple threads).

Requires (install on the GPU machine only):
    pip install ultralytics opencv-python torch requests

Run from inside the ml/ directory:
    python detect.py
"""

import time
from pathlib import Path

import cv2
import requests
from ultralytics import YOLO

from tracker import CentroidTracker
from crime import CrimeDetector
from pollution import PollutionTracker

BACKEND_URL = "http://localhost:8000/detect"
POST_INTERVAL = 1.0  # seconds between POSTs per camera
MIN_CONFIDENCE = 0.45
SHOW_PREVIEW = True  # set False to run headless

FEEDS_DIR = Path(__file__).parent / "feeds"

# COCO class names YOLOv8n cares about for this project
RELEVANT_CLASSES = {
    "person", "backpack", "suitcase", "handbag",
    "car", "truck", "bus", "motorcycle",
}

CAMERAS = [
    {"id": "cam01", "name": "Sitabuldi Junction", "file": "cam01.mp4", "expected_direction": None},
    {"id": "cam02", "name": "Wardha Road", "file": "cam02.mp4", "expected_direction": None},
    {"id": "cam03", "name": "Pratap Nagar", "file": "cam03.mp4", "expected_direction": None},
    {"id": "cam04", "name": "Empress Mall", "file": "cam04.mp4", "expected_direction": None},
]


def post_detection(payload: dict):
    try:
        requests.post(BACKEND_URL, json=payload, timeout=3)
    except requests.exceptions.RequestException as e:
        print(f"[WARN] Failed to POST to backend: {e}")


class CameraState:
    def __init__(self, camera: dict):
        self.camera = camera
        self.camera_id = camera["id"]
        video_path = FEEDS_DIR / camera["file"]

        if not video_path.exists():
            raise FileNotFoundError(f"Feed not found for {self.camera_id}: {video_path}")

        self.cap = cv2.VideoCapture(str(video_path))
        if not self.cap.isOpened():
            raise IOError(f"Could not open video for {self.camera_id}: {video_path}")

        self.tracker = CentroidTracker(max_disappeared=20, max_distance=90)
        self.crime_detector = CrimeDetector(self.camera_id, expected_direction=camera["expected_direction"])
        self.pollution_tracker = PollutionTracker(self.camera_id)
        self.last_post_time = 0.0

    def read_frame(self):
        ret, frame = self.cap.read()
        if not ret:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
        return frame

    def close(self):
        self.cap.release()


def process_frame(model: YOLO, state: CameraState, frame, now: float):
    results = model(frame, verbose=False)[0]

    detections = []
    for box in results.boxes:
        class_id = int(box.cls[0])
        class_name = model.names[class_id]
        confidence = float(box.conf[0])

        if class_name not in RELEVANT_CLASSES or confidence < MIN_CONFIDENCE:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0])
        detections.append({
            "bbox": (x1, y1, x2, y2),
            "class_name": class_name,
            "confidence": confidence,
        })

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
        cv2.putText(frame, f"{class_name} {confidence:.2f}", (x1, max(y1 - 8, 0)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)

    tracked_objects = state.tracker.update(detections, timestamp=now)
    state.pollution_tracker.update(tracked_objects, now=now)

    if now - state.last_post_time >= POST_INTERVAL:
        state.last_post_time = now

        crime_alerts = state.crime_detector.analyze(tracked_objects, now=now)
        pollution_payload = state.pollution_tracker.flush_if_due(tracked_objects, now=now)

        payload = {"camera_id": state.camera_id, "alerts": crime_alerts}
        if pollution_payload:
            payload["pollution"] = pollution_payload

        if crime_alerts or pollution_payload:
            post_detection(payload)

    return frame


def main():
    print("[INFO] Loading YOLOv8n model...")
    model = YOLO("yolov8n.pt")
    print("[INFO] Model loaded. Opening camera feeds...")

    states = []
    for camera in CAMERAS:
        try:
            states.append(CameraState(camera))
            print(f"[INFO] Opened feed: {camera['id']} ({camera['name']})")
        except (FileNotFoundError, IOError) as e:
            print(f"[ERROR] {e}")

    if not states:
        print("[ERROR] No camera feeds available. Put MP4 files in ml/feeds/. Exiting.")
        return

    try:
        while True:
            now = time.time()
            for state in states:
                frame = state.read_frame()
                if frame is None:
                    continue

                frame = process_frame(model, state, frame, now)

                if SHOW_PREVIEW:
                    cv2.imshow(f"DrishtiAI - {state.camera['name']}", frame)

            if SHOW_PREVIEW and cv2.waitKey(1) & 0xFF == ord("q"):
                break
    except KeyboardInterrupt:
        print("[INFO] Shutting down detection loop.")
    finally:
        for state in states:
            state.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
