import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .auth import (
    LoginRequest,
    TokenResponse,
    authenticate_user,
    create_access_token,
    get_current_user,
)
from .database import get_db, init_db
from .models import Alert, Camera, PollutionScore
from .websocket import manager, websocket_endpoint

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("drishtiai.main")

ALERT_COOLDOWN_SECONDS = 60

app = FastAPI(title="DrishtiAI — Nagpur Smart City Initiative")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("DrishtiAI backend started. Database initialized.")


# ---------- Schemas ----------

class AlertIn(BaseModel):
    alert_type: str
    confidence: float
    count: int = 1


class PollutionIn(BaseModel):
    cars: int = 0
    trucks: int = 0
    motorcycles: int = 0
    total_co2: float
    score: float
    level: str


class DetectionPayload(BaseModel):
    camera_id: str
    alerts: List[AlertIn] = []
    pollution: Optional[PollutionIn] = None


class AlertOut(BaseModel):
    id: int
    camera_id: str
    location: str
    alert_type: str
    confidence: float
    count: int
    status: str
    timestamp: datetime

    class Config:
        from_attributes = True


class PollutionOut(BaseModel):
    id: int
    camera_id: str
    location: str
    score: float
    level: str
    cars: int
    trucks: int
    motorcycles: int
    total_co2: float
    timestamp: datetime

    class Config:
        from_attributes = True


class CameraOut(BaseModel):
    id: str
    name: str
    location: str
    lat: float
    lng: float
    status: str

    class Config:
        from_attributes = True


# ---------- Auth ----------

@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    user = authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": user["email"], "role": user["role"]})
    return TokenResponse(access_token=token, email=user["email"], role=user["role"])


# ---------- Cameras ----------

@app.get("/cameras", response_model=List[CameraOut])
def get_cameras(db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    return db.query(Camera).all()


# ---------- Detection ingestion (called by ml/detect.py) ----------

@app.post("/detect")
async def receive_detection(payload: DetectionPayload, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == payload.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail=f"Unknown camera_id: {payload.camera_id}")

    created_alerts = []
    cooldown_cutoff = datetime.utcnow() - timedelta(seconds=ALERT_COOLDOWN_SECONDS)

    for alert_in in payload.alerts:
        recent = (
            db.query(Alert)
            .filter(
                Alert.camera_id == payload.camera_id,
                Alert.alert_type == alert_in.alert_type,
                Alert.timestamp >= cooldown_cutoff,
            )
            .first()
        )
        if recent:
            continue  # cooldown active, skip duplicate alert

        alert = Alert(
            camera_id=payload.camera_id,
            location=camera.location,
            alert_type=alert_in.alert_type,
            confidence=alert_in.confidence,
            count=alert_in.count,
            status="new",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        created_alerts.append(alert)

        await manager.broadcast(
            {
                "type": "alert",
                "data": {
                    "id": alert.id,
                    "camera_id": alert.camera_id,
                    "location": alert.location,
                    "alert_type": alert.alert_type,
                    "confidence": alert.confidence,
                    "count": alert.count,
                    "status": alert.status,
                    "timestamp": alert.timestamp,
                },
            }
        )

    if payload.pollution:
        p = payload.pollution
        score_row = PollutionScore(
            camera_id=payload.camera_id,
            location=camera.location,
            score=p.score,
            level=p.level,
            cars=p.cars,
            trucks=p.trucks,
            motorcycles=p.motorcycles,
            total_co2=p.total_co2,
        )
        db.add(score_row)
        db.commit()
        db.refresh(score_row)

        await manager.broadcast(
            {
                "type": "pollution",
                "data": {
                    "id": score_row.id,
                    "camera_id": score_row.camera_id,
                    "location": score_row.location,
                    "score": score_row.score,
                    "level": score_row.level,
                    "cars": score_row.cars,
                    "trucks": score_row.trucks,
                    "motorcycles": score_row.motorcycles,
                    "total_co2": score_row.total_co2,
                    "timestamp": score_row.timestamp,
                },
            }
        )

    return {"status": "ok", "alerts_created": len(created_alerts)}


# ---------- Alerts ----------

@app.get("/alerts", response_model=List[AlertOut])
def get_alerts(
    camera_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    query = db.query(Alert)
    if camera_id:
        query = query.filter(Alert.camera_id == camera_id)
    if status:
        query = query.filter(Alert.status == status)
    return query.order_by(Alert.timestamp.desc()).limit(limit).all()


@app.post("/alerts/{alert_id}/ack", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "acknowledged"
    db.commit()
    db.refresh(alert)

    await manager.broadcast(
        {
            "type": "alert_update",
            "data": {
                "id": alert.id,
                "camera_id": alert.camera_id,
                "location": alert.location,
                "alert_type": alert.alert_type,
                "confidence": alert.confidence,
                "count": alert.count,
                "status": alert.status,
                "timestamp": alert.timestamp,
            },
        }
    )
    return alert


# ---------- Pollution ----------

@app.get("/pollution", response_model=List[PollutionOut])
def get_pollution(
    camera_id: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    query = db.query(PollutionScore)
    if camera_id:
        query = query.filter(PollutionScore.camera_id == camera_id)
    return query.order_by(PollutionScore.timestamp.desc()).limit(limit).all()


# ---------- WebSocket ----------

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket)


@app.get("/")
def root():
    return {"service": "DrishtiAI — Nagpur Smart City Initiative", "status": "running"}
