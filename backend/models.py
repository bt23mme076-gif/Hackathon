from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func

from .database import Base


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    status = Column(String, default="online")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(String, index=True, nullable=False)
    location = Column(String, nullable=False)
    alert_type = Column(String, nullable=False)  # crowd_surge | abandoned_object | wrong_way_vehicle
    confidence = Column(Float, nullable=False)
    count = Column(Integer, default=1)
    status = Column(String, default="new", index=True)  # new | acknowledged | resolved
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class PollutionScore(Base):
    __tablename__ = "pollution_scores"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(String, index=True, nullable=False)
    location = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    level = Column(String, nullable=False)  # GREEN | YELLOW | RED
    cars = Column(Integer, default=0)
    trucks = Column(Integer, default=0)
    motorcycles = Column(Integer, default=0)
    total_co2 = Column(Float, default=0.0)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
