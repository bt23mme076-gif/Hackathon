# DrishtiAI — Nagpur Smart City Initiative

Real-time AI video analytics for Nagpur's police and environment departments,
built for **Manthan 4 Yuwa — VNIT Nagpur** (Smart City / Problem Statement 01: City Eye).

DrishtiAI watches 4 simulated CCTV feeds with YOLOv8, and gives operators a single
live dashboard for two things:

1. **Crime Detection** — crowd surges, abandoned objects, wrong-way vehicles.
2. **Pollution Index** — per-junction CO2 estimate from vehicle dwell time (CPCB India
   emission factors), shown as a live Nagpur map + charts.

---

## Architecture

```
ml/detect.py (runs on the GPU machine — RTX 3050)
  -> reads 4 MP4 feeds (ml/feeds/*.mp4)
  -> YOLOv8n per frame -> tracker.py assigns persistent IDs
  -> crime.py / pollution.py analyze tracked objects
  -> POST http://<backend-host>:8000/detect every ~1s per camera

backend/main.py (FastAPI)
  -> validates + stores detections in SQLite
  -> broadcasts live updates over WebSocket (/ws)

frontend/ (React)
  -> operator logs in (JWT)
  -> Dashboard: 4 camera panels + live alert sidebar
  -> Crime: full alert history table
  -> Pollution: Nagpur map + CO2 chart + vehicle breakdown
```

**Machines used for this build:** the ML pipeline (`ml/`) is written here but is meant
to run on the teammate's laptop with the RTX 3050 GPU — it was not installed or executed
on this machine. The backend and frontend were built and fully smoke-tested here.

---

## Running it

### 1. Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
cd ..
python -m uvicorn backend.main:app --reload --port 8000
```

SQLite (`drishtiai.db`) and the 4 cameras are auto-created on first startup.

Login credentials (hardcoded for the hackathon):

| Email | Password | Role |
|---|---|---|
| operator@drishtiai.in | operator123 | operator |
| admin@drishtiai.in | admin123 | admin |

### 2. Frontend (React)

```bash
cd frontend
npm install
npm start
```

Opens on `http://localhost:3000`. Requires the backend running on port 8000
(CORS is already configured for this origin).

### 3. ML pipeline (on the GPU machine only)

```bash
cd ml
pip install ultralytics opencv-python torch requests
```

Drop 4 CCTV clips into `ml/feeds/` named `cam01.mp4`, `cam02.mp4`, `cam03.mp4`,
`cam04.mp4` (Sitabuldi Junction, Wardha Road, Pratap Nagar, Empress Mall), then:

```bash
python detect.py
```

**If the ML machine and the backend machine are different laptops on the same
Wi-Fi** (e.g. demo day setup), change `BACKEND_URL` at the top of `ml/detect.py`
from `http://localhost:8000/detect` to `http://<backend-laptop-LAN-IP>:8000/detect`,
and run the backend with `--host 0.0.0.0` so it's reachable over LAN. Also update
`API_BASE_URL` / `WS_URL` in `frontend/src/App.jsx` if the frontend is viewed from
a different machine than the backend.

### Docker (optional, backend + frontend only)

```bash
docker compose up --build
```

Not used for the ML pipeline (needs GPU passthrough, and by design runs on a
separate machine). Untested on this build machine — Docker wasn't installed here;
verify on a machine with Docker before relying on it for the demo.

---

## API Reference

| Route | Auth | Description |
|---|---|---|
| `POST /auth/login` | — | Returns a JWT for the given email/password |
| `GET /cameras` | JWT | List all 4 cameras with lat/lng |
| `POST /detect` | — (local ML only) | Ingest crime alerts / pollution readings for a camera |
| `GET /alerts` | JWT | Alert history (filter by `camera_id`, `status`) |
| `POST /alerts/{id}/ack` | JWT | Acknowledge an alert |
| `GET /pollution` | JWT | Pollution score history (filter by `camera_id`) |
| `WS /ws` | — | Live broadcast of new alerts, alert updates, pollution readings |

## Detection Logic

**Crime** (`ml/crime.py`) — per camera, with a 60s cooldown per alert type and a
0.45 minimum detection confidence:
- Crowd surge: 10+ people in one frame.
- Abandoned object: a backpack/suitcase/handbag stationary (<25px drift) for 60+
  seconds; resets if it moves (picked up).
- Wrong-way vehicle: a vehicle whose tracked movement direction opposes a
  camera's calibrated expected traffic flow.

**Pollution** (`ml/pollution.py`) — per camera, a 60-second rolling window:

```
CO2 (g) = vehicle_count x emission_rate (g/min) x dwell_minutes

car: 2.3 g/min | truck/bus: 8.7 g/min | motorcycle: 1.1 g/min

GREEN: 0-50g | YELLOW: 51-150g | RED: 151g+
```

## Camera Locations

| ID | Name | Lat | Lng |
|---|---|---|---|
| cam01 | Sitabuldi Junction | 21.1458 | 79.0882 |
| cam02 | Wardha Road | 21.1123 | 79.0988 |
| cam03 | Pratap Nagar | 21.1367 | 79.0712 |
| cam04 | Empress Mall | 21.1502 | 79.0845 |

## Tech Stack

- **ML:** Python 3.10, YOLOv8n (ultralytics, pretrained COCO), OpenCV, PyTorch + CUDA
- **Backend:** FastAPI, WebSockets, SQLite + SQLAlchemy, JWT (python-jose)
- **Frontend:** React, Tailwind CSS, Leaflet / react-leaflet, Recharts, Axios

## What's been tested

- Backend: booted live, all 7 REST routes + WebSocket broadcast verified with
  real HTTP requests (login success/failure, JWT-gated routes, alert cooldown
  path, pollution ingestion, acknowledge flow, unknown-camera rejection).
- Frontend: booted live against the real backend in a browser — login, all 3
  pages, live WebSocket alert delivery, map/chart rendering, and the acknowledge
  action were all exercised end-to-end.
- ML pipeline (`tracker.py`, `crime.py`, `pollution.py`, `detect.py`): syntax-
  checked only. Not functionally run — no GPU/YOLO environment on this machine.
  **Run and verify this on the GPU machine before demo day.**
- `docker-compose.yml` / Dockerfiles: written and reviewed, not build-tested —
  Docker isn't installed on this machine.
