"""PopBet backend — pop-culture prediction market with fictional coins."""
from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-secret")
JWT_ALG = os.environ.get("JWT_ALG", "HS256")
ACCESS_TOKEN_DAYS = int(os.environ.get("ACCESS_TOKEN_DAYS", "30"))
EMERGENT_PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
PUSH_BASE_URL = "https://integrations.emergentagent.com"

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("popbet")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": EMERGENT_PUSH_KEY},
    timeout=10.0,
)

# ---------- models ----------
CATEGORIES = ["sport", "awards", "reality_tv", "gossip", "music"]


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    username: str = Field(min_length=2, max_length=20)
    phone: Optional[str] = Field(default=None, max_length=32)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=100)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=100)


class UpdateProfileIn(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=20)
    avatar_base64: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=32)


class DeleteAccountIn(BaseModel):
    password: Optional[str] = None


class UserOut(BaseModel):
    user_id: str
    email: EmailStr
    username: str
    coins: int
    avatar: str
    created_at: datetime
    streak_days: int = 0
    best_streak: int = 0
    phone: Optional[str] = None


class AuthOut(BaseModel):
    token: str
    user: UserOut


class BetOption(BaseModel):
    key: str  # "a" or "b"
    label: str
    stake_total: int = 0
    voters: int = 0


class BetOut(BaseModel):
    bet_id: str
    category: str
    question: str
    subtitle: Optional[str] = None
    options: List[BetOption]
    closes_at: datetime
    resolved: bool
    winning_option: Optional[str] = None
    image_url: Optional[str] = None
    total_pool: int
    user_choice: Optional[str] = None
    user_stake: int = 0


class PlaceBetIn(BaseModel):
    option: str  # "a" or "b"
    stake: int = Field(ge=10, le=100000)


class MyBetOut(BaseModel):
    bet_id: str
    category: str
    question: str
    choice: str
    stake: int
    placed_at: datetime
    resolved: bool
    won: Optional[bool] = None
    payout: int = 0
    winning_option: Optional[str] = None
    closes_at: datetime


class LeaderRow(BaseModel):
    user_id: str
    username: str
    avatar: str
    coins: int
    rank: int


class LeaderboardOut(BaseModel):
    rows: List[LeaderRow]
    me: LeaderRow


class AddFriendIn(BaseModel):
    username: str


class RegisterPushIn(BaseModel):
    platform: str
    device_token: str


class ResolveIn(BaseModel):
    winning_option: str  # "a" or "b"


# ---------- helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def make_token(user_id: str) -> str:
    exp = now_utc() + timedelta(days=ACCESS_TOKEN_DAYS)
    payload = {"sub": user_id, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _user_out(u: dict) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        username=u["username"],
        coins=u["coins"],
        avatar=u.get("avatar", ""),
        created_at=u["created_at"],
        streak_days=u.get("streak", {}).get("current", 0),
        best_streak=u.get("streak", {}).get("best", 0),
        phone=u.get("phone"),
    )


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        return
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    try:
        resp = await push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code >= 400:
            logger.warning("Push failed status=%s body=%s", resp.status_code, resp.text[:200])
    except Exception as e:  # never let push crash the app
        logger.warning("Push exception (non-blocking): %s", e)


AVATAR_URLS = [
    "https://images.unsplash.com/photo-1772371272228-f4a8247cfe6d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHw0fHxoYXBweSUyMHRlZW5hZ2VyJTIwYXZhdGFyJTIwcG9ydHJhaXR8ZW58MHx8fHwxNzg0NDE0NzU4fDA&ixlib=rb-4.1.0&q=85",
    "https://images.pexels.com/photos/30518441/pexels-photo-30518441.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
]

# ---------- seed data ----------
SEED_BETS = [
    {
        "category": "sport",
        "question": "Kto wygra dzisiejszy mecz Real Madryt vs Barcelona?",
        "subtitle": "El Clásico - La Liga",
        "options": [
            {"key": "a", "label": "Real Madryt"},
            {"key": "b", "label": "Barcelona"},
        ],
        "hours_left": 6,
    },
    {
        "category": "sport",
        "question": "Kto zdobędzie więcej goli w tym tygodniu?",
        "subtitle": "Premier League",
        "options": [
            {"key": "a", "label": "Haaland"},
            {"key": "b", "label": "Salah"},
        ],
        "hours_left": 24,
    },
    {
        "category": "awards",
        "question": "Kto wygra Oscara dla najlepszego aktora?",
        "subtitle": "Oscary 2026",
        "options": [
            {"key": "a", "label": "Timothée Chalamet"},
            {"key": "b", "label": "Adrien Brody"},
        ],
        "hours_left": 48,
    },
    {
        "category": "awards",
        "question": "Film roku na Grammy Awards?",
        "subtitle": "Grammy 2026",
        "options": [
            {"key": "a", "label": "Taylor Swift"},
            {"key": "b", "label": "Beyoncé"},
        ],
        "hours_left": 72,
    },
    {
        "category": "reality_tv",
        "question": "Kto opuści dom Big Brother w tym tygodniu?",
        "subtitle": "Big Brother PL - Odcinek 12",
        "options": [
            {"key": "a", "label": "Kasia"},
            {"key": "b", "label": "Michał"},
        ],
        "hours_left": 12,
    },
    {
        "category": "reality_tv",
        "question": "Która para przetrwa Love Island Polska?",
        "subtitle": "Finał Love Island",
        "options": [
            {"key": "a", "label": "Ola i Kuba"},
            {"key": "b", "label": "Marta i Piotrek"},
        ],
        "hours_left": 36,
    },
    {
        "category": "gossip",
        "question": "Czy Kim K i Pete wrócą do siebie w tym miesiącu?",
        "subtitle": "Plotki celebrytów",
        "options": [
            {"key": "a", "label": "Tak, wracają"},
            {"key": "b", "label": "Nie ma szans"},
        ],
        "hours_left": 96,
    },
    {
        "category": "gossip",
        "question": "Czy Doda ogłosi nowy album do końca miesiąca?",
        "subtitle": "Polska muzyka pop",
        "options": [
            {"key": "a", "label": "Ogłosi album"},
            {"key": "b", "label": "Cisza radiowa"},
        ],
        "hours_left": 60,
    },
    {
        "category": "music",
        "question": "Kto zadebiutuje wyżej na Billboard Hot 100?",
        "subtitle": "Nowe wydawnictwa",
        "options": [
            {"key": "a", "label": "Sabrina Carpenter"},
            {"key": "b", "label": "Olivia Rodrigo"},
        ],
        "hours_left": 18,
    },
    {
        "category": "music",
        "question": "Bad Bunny vs Drake - kto sprzeda więcej biletów na tournée?",
        "subtitle": "Tournée 2026",
        "options": [
            {"key": "a", "label": "Bad Bunny"},
            {"key": "b", "label": "Drake"},
        ],
        "hours_left": 120,
    },
]


async def seed_bets() -> None:
    count = await db.bets.count_documents({})
    if count > 0:
        return
    logger.info("Seeding %d sample bets", len(SEED_BETS))
    docs = []
    now = now_utc()
    for s in SEED_BETS:
        docs.append({
            "bet_id": make_id("bet"),
            "category": s["category"],
            "question": s["question"],
            "subtitle": s.get("subtitle"),
            "options": [
                {"key": o["key"], "label": o["label"], "stake_total": 0, "voters": 0}
                for o in s["options"]
            ],
            "closes_at": now + timedelta(hours=s["hours_left"]),
            "created_at": now,
            "resolved": False,
            "winning_option": None,
        })
    await db.bets.insert_many(docs)


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("username", unique=True)
    await db.users.create_index("phone")
    await db.users.create_index("phone_normalized")
    await db.bets.create_index("bet_id", unique=True)
    await db.bets.create_index("category")
    await db.placements.create_index([("user_id", 1), ("bet_id", 1)], unique=True)
    await db.placements.create_index("bet_id")
    await db.friendships.create_index([("owner_id", 1), ("friend_id", 1)], unique=True)
    await db.friend_requests.create_index([("from_id", 1), ("to_id", 1)], unique=True)
    await db.friend_requests.create_index("to_id")
    await db.transfers.create_index("from_id")
    await db.transfers.create_index("to_id")


async def backfill_phone_normalized() -> None:
    """One-time backfill of phone_normalized for pre-existing users."""
    cursor = db.users.find(
        {"phone": {"$ne": None}, "phone_normalized": {"$exists": False}},
        {"_id": 0, "user_id": 1, "phone": 1},
    )
    async for u in cursor:
        norm = _normalize_phone(u.get("phone") or "") or None
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"phone_normalized": norm}})


# ---------- lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    await backfill_phone_normalized()
    await seed_bets()
    yield
    client.close()
    await push_client.aclose()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- routes ----------
@app.get("/api/")
async def root():
    return {"app": "PopBet", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"ok": True, "time": now_utc().isoformat()}


# --- auth ---
@app.post("/api/auth/signup", response_model=AuthOut, status_code=201)
async def signup(payload: SignupIn):
    email = payload.email.lower().strip()
    username = payload.username.strip()
    existing = await db.users.find_one({"$or": [{"email": email}, {"username": username}]}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Email lub nazwa użytkownika już istnieje")
    user_id = make_id("usr")
    avatar = AVATAR_URLS[hash(user_id) % len(AVATAR_URLS)]
    doc = {
        "user_id": user_id,
        "email": email,
        "username": username,
        "phone": (payload.phone or "").strip() or None,
        "phone_normalized": _normalize_phone(payload.phone or "") or None,
        "password_hash": pwd_ctx.hash(payload.password),
        "coins": 1000,
        "avatar": avatar,
        "created_at": now_utc(),
        "stats": {"total_bets": 0, "wins": 0, "losses": 0, "current_streak": 0, "best_streak": 0},
        "streak": {"current": 0, "best": 0, "last_checkin": None},
        "push_tokens": [],
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    token = make_token(user_id)
    return AuthOut(token=token, user=_user_out(doc))


@app.post("/api/auth/login", response_model=AuthOut)
async def login(payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not pwd_ctx.verify(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Nieprawidłowy email lub hasło")
    token = make_token(user["user_id"])
    return AuthOut(token=token, user=_user_out(user))


@app.get("/api/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return _user_out(user)


# --- password reset (local / dev-mode: token returned in response) ---
@app.post("/api/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return success (don't leak whether the email exists) but only produce
    # a token if the user actually exists.
    if not user:
        return {"ok": True, "delivery": "in_app", "token": None}
    token = uuid.uuid4().hex + uuid.uuid4().hex[:8]
    await db.password_resets.insert_one({
        "token": token,
        "user_id": user["user_id"],
        "email": email,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(hours=1),
        "used": False,
    })
    # DEV: without an email provider configured, we return the token so the app
    # can present it to the user (and let them proceed to reset). In production
    # you'd only send it via email.
    return {"ok": True, "delivery": "in_app", "token": token, "expires_in_minutes": 60}


@app.post("/api/auth/reset-password", response_model=AuthOut)
async def reset_password(payload: ResetPasswordIn):
    entry = await db.password_resets.find_one({"token": payload.token}, {"_id": 0})
    if not entry or entry.get("used"):
        raise HTTPException(status_code=400, detail="Nieprawidłowy lub zużyty token")
    exp = entry["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=400, detail="Token wygasł")

    user = await db.users.find_one({"user_id": entry["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Konto nie istnieje")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": pwd_ctx.hash(payload.new_password)}},
    )
    await db.password_resets.update_one({"token": payload.token}, {"$set": {"used": True, "used_at": now_utc()}})
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return AuthOut(token=make_token(user["user_id"]), user=_user_out(user))


@app.post("/api/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if not user.get("password_hash") or not pwd_ctx.verify(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Nieprawidłowe aktualne hasło")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="Nowe hasło musi być inne")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": pwd_ctx.hash(payload.new_password)}},
    )
    return {"ok": True}


# --- edit / delete profile ---
@app.patch("/api/profile", response_model=UserOut)
async def update_profile(payload: UpdateProfileIn, user: dict = Depends(get_current_user)):
    updates: dict = {}
    if payload.username is not None:
        new_username = payload.username.strip()
        if new_username != user["username"]:
            clash = await db.users.find_one({"username": new_username}, {"_id": 0})
            if clash and clash["user_id"] != user["user_id"]:
                raise HTTPException(status_code=409, detail="Nazwa zajęta")
            updates["username"] = new_username
    if payload.avatar_base64 is not None:
        # Basic guard against absurdly large images.
        if len(payload.avatar_base64) > 5_000_000:
            raise HTTPException(status_code=400, detail="Zdjęcie zbyt duże (max 5 MB)")
        prefix = "data:image/jpeg;base64,"
        if payload.avatar_base64.startswith("data:"):
            updates["avatar"] = payload.avatar_base64
        else:
            updates["avatar"] = prefix + payload.avatar_base64
    if payload.phone is not None:
        raw = payload.phone.strip()
        updates["phone"] = raw or None
        updates["phone_normalized"] = _normalize_phone(raw) or None
    if not updates:
        return _user_out(user)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_out(fresh)


@app.delete("/api/account")
async def delete_account(payload: DeleteAccountIn, user: dict = Depends(get_current_user)):
    # If the user has a password (non-Google account), require it to confirm.
    if user.get("password_hash"):
        if not payload.password or not pwd_ctx.verify(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Nieprawidłowe hasło")
    uid = user["user_id"]
    await db.placements.delete_many({"user_id": uid})
    await db.friendships.delete_many({"$or": [{"owner_id": uid}, {"friend_id": uid}]})
    await db.friend_requests.delete_many({"$or": [{"from_id": uid}, {"to_id": uid}]})
    await db.password_resets.delete_many({"user_id": uid})
    await db.transfers.delete_many({"$or": [{"from_id": uid}, {"to_id": uid}]})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


# --- bets ---
async def _hydrate_bet(bet: dict, user_id: Optional[str]) -> BetOut:
    total_pool = sum(o["stake_total"] for o in bet["options"])
    user_choice = None
    user_stake = 0
    if user_id:
        placement = await db.placements.find_one({"user_id": user_id, "bet_id": bet["bet_id"]}, {"_id": 0})
        if placement:
            user_choice = placement["option"]
            user_stake = placement["stake"]
    return BetOut(
        bet_id=bet["bet_id"],
        category=bet["category"],
        question=bet["question"],
        subtitle=bet.get("subtitle"),
        options=[BetOption(**o) for o in bet["options"]],
        closes_at=bet["closes_at"],
        resolved=bet.get("resolved", False),
        winning_option=bet.get("winning_option"),
        image_url=bet.get("image_url"),
        total_pool=total_pool,
        user_choice=user_choice,
        user_stake=user_stake,
    )


@app.get("/api/bets", response_model=List[BetOut])
async def list_bets(
    category: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    q: dict = {"resolved": False}
    if category and category != "all":
        q["category"] = category
    cursor = db.bets.find(q, {"_id": 0}).sort("closes_at", 1)
    bets = await cursor.to_list(200)
    return [await _hydrate_bet(b, user["user_id"]) for b in bets]


@app.get("/api/bets/{bet_id}", response_model=BetOut)
async def get_bet(bet_id: str, user: dict = Depends(get_current_user)):
    bet = await db.bets.find_one({"bet_id": bet_id}, {"_id": 0})
    if not bet:
        raise HTTPException(status_code=404, detail="Zakład nie istnieje")
    return await _hydrate_bet(bet, user["user_id"])


@app.post("/api/bets/{bet_id}/place", response_model=BetOut)
async def place_bet(bet_id: str, payload: PlaceBetIn, user: dict = Depends(get_current_user)):
    bet = await db.bets.find_one({"bet_id": bet_id}, {"_id": 0})
    if not bet:
        raise HTTPException(status_code=404, detail="Zakład nie istnieje")
    if bet.get("resolved"):
        raise HTTPException(status_code=400, detail="Zakład już rozstrzygnięty")
    closes_at = bet["closes_at"]
    if closes_at.tzinfo is None:
        closes_at = closes_at.replace(tzinfo=timezone.utc)
    if closes_at < now_utc():
        raise HTTPException(status_code=400, detail="Zakład zamknięty")
    if payload.option not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Nieprawidłowa opcja")
    if user["coins"] < payload.stake:
        raise HTTPException(status_code=400, detail="Za mało coinów")

    existing = await db.placements.find_one({"user_id": user["user_id"], "bet_id": bet_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Już obstawiłeś ten zakład")

    # deduct coins, record placement, bump option totals
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"coins": -payload.stake}})
    await db.placements.insert_one({
        "placement_id": make_id("plc"),
        "user_id": user["user_id"],
        "bet_id": bet_id,
        "option": payload.option,
        "stake": payload.stake,
        "placed_at": now_utc(),
        "resolved": False,
        "won": None,
        "payout": 0,
    })
    await db.bets.update_one(
        {"bet_id": bet_id, "options.key": payload.option},
        {"$inc": {"options.$.stake_total": payload.stake, "options.$.voters": 1}},
    )
    bet = await db.bets.find_one({"bet_id": bet_id}, {"_id": 0})
    return await _hydrate_bet(bet, user["user_id"])


@app.get("/api/my-bets", response_model=List[MyBetOut])
async def my_bets(status: str = Query(default="active"), user: dict = Depends(get_current_user)):
    q: dict = {"user_id": user["user_id"]}
    if status == "active":
        q["resolved"] = False
    elif status == "resolved":
        q["resolved"] = True
    placements = await db.placements.find(q, {"_id": 0}).sort("placed_at", -1).to_list(500)
    out: List[MyBetOut] = []
    for p in placements:
        bet = await db.bets.find_one({"bet_id": p["bet_id"]}, {"_id": 0})
        if not bet:
            continue
        out.append(MyBetOut(
            bet_id=p["bet_id"],
            category=bet["category"],
            question=bet["question"],
            choice=p["option"],
            stake=p["stake"],
            placed_at=p["placed_at"],
            resolved=p.get("resolved", False),
            won=p.get("won"),
            payout=p.get("payout", 0),
            winning_option=bet.get("winning_option"),
            closes_at=bet["closes_at"],
        ))
    return out


# --- resolve (test helper — no auth to allow easy demo/testing) ---
@app.post("/api/bets/{bet_id}/resolve")
async def resolve_bet(bet_id: str, payload: ResolveIn):
    bet = await db.bets.find_one({"bet_id": bet_id}, {"_id": 0})
    if not bet:
        raise HTTPException(status_code=404, detail="Zakład nie istnieje")
    if bet.get("resolved"):
        raise HTTPException(status_code=400, detail="Zakład już rozstrzygnięty")
    if payload.winning_option not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Nieprawidłowa opcja")

    win_key = payload.winning_option
    lose_key = "b" if win_key == "a" else "a"

    win_option = next(o for o in bet["options"] if o["key"] == win_key)
    lose_option = next(o for o in bet["options"] if o["key"] == lose_key)
    winners_pool = win_option["stake_total"] or 0
    losers_pool = lose_option["stake_total"] or 0

    placements = await db.placements.find({"bet_id": bet_id}, {"_id": 0}).to_list(1000)
    to_notify: List[str] = []
    for p in placements:
        won = p["option"] == win_key
        # pari-mutuel: winner gets their stake back + proportional share of losers' pool
        if won and winners_pool > 0:
            share = (p["stake"] / winners_pool) * losers_pool
            payout = int(round(p["stake"] + share))
        else:
            payout = 0
        await db.placements.update_one(
            {"placement_id": p["placement_id"]},
            {"$set": {"resolved": True, "won": won, "payout": payout}},
        )
        if payout > 0:
            await db.users.update_one({"user_id": p["user_id"]}, {"$inc": {"coins": payout}})
        # update stats + biggest win
        stat_inc = {"stats.total_bets": 1}
        if won:
            stat_inc["stats.wins"] = 1
        else:
            stat_inc["stats.losses"] = 1
        await db.users.update_one({"user_id": p["user_id"]}, {"$inc": stat_inc})
        if won and payout - p["stake"] > 0:
            profit = payout - p["stake"]
            await db.users.update_one(
                {"user_id": p["user_id"], "$or": [
                    {"stats.biggest_win": {"$exists": False}},
                    {"stats.biggest_win": {"$lt": profit}},
                ]},
                {"$set": {"stats.biggest_win": profit, "stats.biggest_win_question": bet["question"]}},
            )
        to_notify.append(p["user_id"])

    await db.bets.update_one(
        {"bet_id": bet_id},
        {"$set": {"resolved": True, "winning_option": win_key, "resolved_at": now_utc()}},
    )

    # push notify each winner/loser
    for uid in to_notify:
        placement = await db.placements.find_one({"user_id": uid, "bet_id": bet_id}, {"_id": 0})
        if not placement:
            continue
        if placement["won"]:
            title = "🎉 Wygrana!"
            msg = f"Twój zakład wygrał! +{placement['payout']} coinów"
        else:
            title = "😔 Przegrana"
            msg = f"Twój zakład: „{bet['question'][:40]}…” został rozstrzygnięty."
        await send_push(
            recipients=[uid],
            data={"title": title, "message": msg, "action_url": "/(tabs)/my-bets"},
            idempotency_key=f"resolve-{bet_id}-{uid}",
        )

    return {"ok": True, "winning_option": win_key, "winners": sum(1 for p in placements if p["option"] == win_key)}


# --- profile / stats ---
@app.get("/api/profile/me")
async def my_profile(user: dict = Depends(get_current_user)):
    stats = user.get("stats", {})
    total = stats.get("total_bets", 0)
    wins = stats.get("wins", 0)
    hit_rate = round((wins / total) * 100) if total else 0
    return {
        "user": _user_out(user),
        "stats": {
            "total_bets": total,
            "wins": wins,
            "losses": stats.get("losses", 0),
            "hit_rate": hit_rate,
            "best_streak": stats.get("best_streak", 0),
            "biggest_win": stats.get("biggest_win", 0),
            "biggest_win_question": stats.get("biggest_win_question"),
            "checkin_streak": user.get("streak", {}).get("current", 0),
            "checkin_best": user.get("streak", {}).get("best", 0),
        },
    }


# --- leaderboard ---
@app.get("/api/leaderboard/global", response_model=LeaderboardOut)
async def leaderboard_global(user: dict = Depends(get_current_user)):
    top = await db.users.find({}, {"_id": 0}).sort("coins", -1).limit(100).to_list(100)
    rows = [
        LeaderRow(
            user_id=u["user_id"], username=u["username"],
            avatar=u.get("avatar", ""), coins=u["coins"], rank=i + 1,
        )
        for i, u in enumerate(top)
    ]
    # find my rank
    my_rank = 0
    for i, u in enumerate(top):
        if u["user_id"] == user["user_id"]:
            my_rank = i + 1
            break
    if my_rank == 0:
        higher = await db.users.count_documents({"coins": {"$gt": user["coins"]}})
        my_rank = higher + 1
    me_row = LeaderRow(
        user_id=user["user_id"], username=user["username"],
        avatar=user.get("avatar", ""), coins=user["coins"], rank=my_rank,
    )
    return LeaderboardOut(rows=rows, me=me_row)


@app.get("/api/leaderboard/friends", response_model=LeaderboardOut)
async def leaderboard_friends(user: dict = Depends(get_current_user)):
    friendships = await db.friendships.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(500)
    friend_ids = [f["friend_id"] for f in friendships]
    ids = friend_ids + [user["user_id"]]
    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0}).sort("coins", -1).to_list(500)
    rows = [
        LeaderRow(
            user_id=u["user_id"], username=u["username"],
            avatar=u.get("avatar", ""), coins=u["coins"], rank=i + 1,
        )
        for i, u in enumerate(users)
    ]
    my_rank = next((r.rank for r in rows if r.user_id == user["user_id"]), 1)
    me_row = LeaderRow(
        user_id=user["user_id"], username=user["username"],
        avatar=user.get("avatar", ""), coins=user["coins"], rank=my_rank,
    )
    return LeaderboardOut(rows=rows, me=me_row)


# --- friends: mutual requests ---
@app.post("/api/friends/request")
async def send_friend_request(payload: AddFriendIn, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"username": payload.username.strip()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    if target["user_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Nie możesz zaprosić siebie")

    # already friends?
    existing_friend = await db.friendships.find_one(
        {"owner_id": user["user_id"], "friend_id": target["user_id"]}, {"_id": 0}
    )
    if existing_friend:
        raise HTTPException(status_code=409, detail="Już jesteście znajomymi")

    # incoming request from target → auto-accept mutually
    incoming = await db.friend_requests.find_one(
        {"from_id": target["user_id"], "to_id": user["user_id"]}, {"_id": 0}
    )
    if incoming:
        await _make_friendship(user["user_id"], target["user_id"])
        await db.friend_requests.delete_one({"from_id": target["user_id"], "to_id": user["user_id"]})
        return {"ok": True, "status": "accepted"}

    # already-sent outgoing?
    existing_req = await db.friend_requests.find_one(
        {"from_id": user["user_id"], "to_id": target["user_id"]}, {"_id": 0}
    )
    if existing_req:
        raise HTTPException(status_code=409, detail="Zaproszenie już wysłane")

    await db.friend_requests.insert_one({
        "request_id": make_id("frq"),
        "from_id": user["user_id"],
        "from_username": user["username"],
        "to_id": target["user_id"],
        "created_at": now_utc(),
    })
    # notify target
    try:
        await send_push(
            recipients=[target["user_id"]],
            data={
                "title": "Nowe zaproszenie 👥",
                "message": f"{user['username']} chce Cię dodać do znajomych.",
                "action_url": "/(tabs)/leaderboard",
            },
        )
    except Exception:
        pass
    return {"ok": True, "status": "pending"}


async def _make_friendship(a: str, b: str) -> None:
    now = now_utc()
    await db.friendships.update_one(
        {"owner_id": a, "friend_id": b},
        {"$setOnInsert": {"owner_id": a, "friend_id": b, "created_at": now}},
        upsert=True,
    )
    await db.friendships.update_one(
        {"owner_id": b, "friend_id": a},
        {"$setOnInsert": {"owner_id": b, "friend_id": a, "created_at": now}},
        upsert=True,
    )


class FriendRequestActionIn(BaseModel):
    request_id: str


@app.post("/api/friends/accept")
async def accept_friend_request(payload: FriendRequestActionIn, user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one(
        {"request_id": payload.request_id, "to_id": user["user_id"]}, {"_id": 0}
    )
    if not req:
        raise HTTPException(status_code=404, detail="Zaproszenie nie istnieje")
    await _make_friendship(user["user_id"], req["from_id"])
    await db.friend_requests.delete_one({"request_id": payload.request_id})
    # notify sender
    try:
        await send_push(
            recipients=[req["from_id"]],
            data={
                "title": "Zaproszenie zaakceptowane 🎉",
                "message": f"{user['username']} przyjął(a) Twoje zaproszenie do znajomych.",
                "action_url": "/(tabs)/leaderboard",
            },
        )
    except Exception:
        pass
    return {"ok": True}


@app.post("/api/friends/reject")
async def reject_friend_request(payload: FriendRequestActionIn, user: dict = Depends(get_current_user)):
    res = await db.friend_requests.delete_one(
        {"request_id": payload.request_id, "to_id": user["user_id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zaproszenie nie istnieje")
    return {"ok": True}


@app.get("/api/friends/pending")
async def pending_requests(user: dict = Depends(get_current_user)):
    incoming = await db.friend_requests.find({"to_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    outgoing = await db.friend_requests.find({"from_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"incoming": incoming, "outgoing": outgoing}


class FindByPhonesIn(BaseModel):
    phones: List[str] = Field(default_factory=list, max_length=500)


def _normalize_phone(p: str) -> str:
    return "".join(ch for ch in p if ch.isdigit())


@app.post("/api/friends/find-by-phones")
async def find_by_phones(payload: FindByPhonesIn, user: dict = Depends(get_current_user)):
    normalized = list({_normalize_phone(p) for p in payload.phones if p})
    if not normalized:
        return {"matches": []}
    # match by last 9 digits (Polish mobile) against phone_normalized
    tails = [n[-9:] for n in normalized if len(n) >= 6]
    if not tails:
        return {"matches": []}
    regexes = [{"phone_normalized": {"$regex": f"{t}$"}} for t in tails]
    matches = await db.users.find(
        {"$or": regexes, "user_id": {"$ne": user["user_id"]}}, {"_id": 0}
    ).to_list(200)
    return {
        "matches": [
            {"user_id": m["user_id"], "username": m["username"], "avatar": m.get("avatar", ""), "phone": m.get("phone")}
            for m in matches
        ]
    }


# --- coin transfer ---
class TransferIn(BaseModel):
    to_username: str
    amount: int = Field(ge=10, le=1000000)


@app.post("/api/coins/transfer")
async def transfer_coins(payload: TransferIn, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"username": payload.to_username.strip()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    if target["user_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Nie możesz przelać do siebie")
    if user["coins"] < payload.amount:
        raise HTTPException(status_code=400, detail="Za mało coinów")

    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"coins": -payload.amount}})
    await db.users.update_one({"user_id": target["user_id"]}, {"$inc": {"coins": payload.amount}})
    tr_id = make_id("tr")
    await db.transfers.insert_one({
        "transfer_id": tr_id,
        "from_id": user["user_id"],
        "from_username": user["username"],
        "to_id": target["user_id"],
        "to_username": target["username"],
        "amount": payload.amount,
        "created_at": now_utc(),
    })
    try:
        await send_push(
            recipients=[target["user_id"]],
            data={
                "title": f"💸 +{payload.amount} coinów",
                "message": f"{user['username']} przelał(a) Ci coiny.",
                "action_url": "/(tabs)/profile",
            },
            idempotency_key=f"transfer-{tr_id}",
        )
    except Exception:
        pass
    return {"ok": True, "amount": payload.amount, "to_username": target["username"]}


@app.get("/api/coins/transfers")
async def list_transfers(user: dict = Depends(get_current_user)):
    outgoing = await db.transfers.find({"from_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    incoming = await db.transfers.find({"to_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"incoming": incoming, "outgoing": outgoing}


# --- daily streak ---
def _same_utc_day(a: datetime, b: datetime) -> bool:
    return a.year == b.year and a.month == b.month and a.day == b.day


def _yesterday_utc_day(prev: datetime, today: datetime) -> bool:
    return (today.date() - prev.date()).days == 1


@app.get("/api/streak/status")
async def streak_status(user: dict = Depends(get_current_user)):
    streak = user.get("streak", {}) or {}
    last = streak.get("last_checkin")
    current = streak.get("current", 0)
    best = streak.get("best", 0)
    now = now_utc()
    can_checkin = True
    if last:
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if _same_utc_day(last, now):
            can_checkin = False
        elif not _yesterday_utc_day(last, now):
            current = 0
    next_bonus = min(50 * max(current + 1, 1), 500)
    return {"current": current, "best": best, "can_checkin": can_checkin, "next_bonus": next_bonus}


@app.post("/api/streak/checkin")
async def streak_checkin(user: dict = Depends(get_current_user)):
    streak = user.get("streak", {}) or {}
    last = streak.get("last_checkin")
    current = streak.get("current", 0)
    best = streak.get("best", 0)
    now = now_utc()
    if last:
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if _same_utc_day(last, now):
            raise HTTPException(status_code=409, detail="Bonus już odebrany dzisiaj")
        if _yesterday_utc_day(last, now):
            current = current + 1
        else:
            current = 1
    else:
        current = 1
    bonus = min(50 * current, 500)
    best = max(best, current)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$inc": {"coins": bonus},
            "$set": {"streak": {"current": current, "best": best, "last_checkin": now}},
        },
    )
    return {"ok": True, "bonus": bonus, "current": current, "best": best}


# --- Emergent Google Session ---
class GoogleSessionIn(BaseModel):
    session_id: str  # temp session_id returned by Emergent's redirect


@app.post("/api/auth/google-session", response_model=AuthOut)
async def google_session(payload: GoogleSessionIn):
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": payload.session_id},
            )
        if resp.status_code >= 400:
            raise HTTPException(status_code=401, detail="Google session odrzucona")
        data = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Emergent auth niedostępne")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=401, detail="Brak email w sesji Google")
    name = (data.get("name") or email.split("@")[0]).strip()
    picture = data.get("picture") or ""

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        # Update avatar if we have a picture and none set previously
        if picture and not existing.get("avatar"):
            await db.users.update_one({"user_id": user_id}, {"$set": {"avatar": picture}})
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        # Create user; derive a unique username from name/email
        base_username = "".join(ch for ch in name.replace(" ", "") if ch.isalnum())[:16] or email.split("@")[0]
        candidate = base_username
        i = 0
        while await db.users.find_one({"username": candidate}, {"_id": 0}):
            i += 1
            candidate = f"{base_username}{i}"
        user_id = make_id("usr")
        doc = {
            "user_id": user_id,
            "email": email,
            "username": candidate,
            "phone": None,
            "password_hash": "",  # empty — user cannot log in with password
            "coins": 1000,
            "avatar": picture or AVATAR_URLS[hash(user_id) % len(AVATAR_URLS)],
            "created_at": now_utc(),
            "stats": {"total_bets": 0, "wins": 0, "losses": 0, "current_streak": 0, "best_streak": 0},
            "streak": {"current": 0, "best": 0, "last_checkin": None},
            "push_tokens": [],
            "google": True,
        }
        await db.users.insert_one(doc)
        user = doc

    token = make_token(user["user_id"])
    return AuthOut(token=token, user=_user_out(user))


# --- friends: mutual requests ---


@app.get("/api/friends/list")
async def list_friends(user: dict = Depends(get_current_user)):
    friendships = await db.friendships.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(500)
    friend_ids = [f["friend_id"] for f in friendships]
    users = await db.users.find({"user_id": {"$in": friend_ids}}, {"_id": 0}).to_list(500)
    return [
        {"user_id": u["user_id"], "username": u["username"], "coins": u["coins"], "avatar": u.get("avatar", "")}
        for u in users
    ]


# --- push registration ---
@app.post("/api/register-push", status_code=201)
async def register_push(payload: RegisterPushIn, user: dict = Depends(get_current_user)):
    try:
        resp = await push_client.post(
            "/api/v1/push/users/register",
            json={"user_id": user["user_id"], "platform": payload.platform, "device_token": payload.device_token},
        )
        if resp.status_code == 401:
            logger.warning("EMERGENT_PUSH_KEY missing or invalid (dev preview)")
        elif resp.status_code >= 400:
            logger.warning("Push register failed status=%s", resp.status_code)
    except Exception as e:
        logger.warning("Push register exception: %s", e)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$addToSet": {"push_tokens": {"platform": payload.platform, "token": payload.device_token}}},
    )
    return {"status": "registered"}
