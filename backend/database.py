from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./drishtiai.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(models.Camera).count() == 0:
            cameras = [
                models.Camera(
                    id="cam01",
                    name="Sitabuldi Junction",
                    location="Sitabuldi Junction",
                    lat=21.1458,
                    lng=79.0882,
                    status="online",
                ),
                models.Camera(
                    id="cam02",
                    name="Wardha Road",
                    location="Wardha Road",
                    lat=21.1123,
                    lng=79.0988,
                    status="online",
                ),
                models.Camera(
                    id="cam03",
                    name="Pratap Nagar",
                    location="Pratap Nagar",
                    lat=21.1367,
                    lng=79.0712,
                    status="online",
                ),
                models.Camera(
                    id="cam04",
                    name="Empress Mall",
                    location="Empress Mall",
                    lat=21.1502,
                    lng=79.0845,
                    status="online",
                ),
            ]
            db.add_all(cameras)
            db.commit()
    finally:
        db.close()
