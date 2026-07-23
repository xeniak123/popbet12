"""PopBet backend — pop-culture prediction market with fictional coins."""
from __future__ import annotations

import hmac
import logging
import os
import random
import string
import uuid
from zoneinfo import ZoneInfo
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
from pymongo import ReturnDocument
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
# Klucz do panelu /admin i endpointów administracyjnych. Gdy pusty, admin jest wyłączony
# (a resolve działa bez klucza — tryb deweloperski/testowy).
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
# Gwarancja od "banku": wygrany zawsze dostaje minimum stawka * (1 + ten wskaznik),
# nawet gdy pula przegranych jest mala lub zerowa (malo userow / wszyscy na jedna opcje).
# Normalny podzial pari-mutuel dziala dalej i moze dac wiecej.
HOUSE_MIN_PROFIT_RATIO = float(os.environ.get("HOUSE_MIN_PROFIT_RATIO", "0.5"))

# --- Szybkie zakłady (gra w kartę) ---
QUICK_MAX_PER_DAY = int(os.environ.get("QUICK_MAX_PER_DAY", "3"))
QUICK_MIN_STAKE = int(os.environ.get("QUICK_MIN_STAKE", "10"))
# Mnożniki wypłaty przy trafieniu (całkowity zwrot: stawka * mnożnik).
# Kolor = 1/2 szansy, znak = 1/4, numer = 1/13 — im mniejsza szansa, tym wyższy mnożnik.
QUICK_COLOR_MULT = float(os.environ.get("QUICK_COLOR_MULT", "1.5"))
QUICK_SUIT_MULT = float(os.environ.get("QUICK_SUIT_MULT", "3.0"))
QUICK_RANK_MULT = float(os.environ.get("QUICK_RANK_MULT", "10.0"))

# --- Polecenia (referral) ---
REFERRAL_BONUS = int(os.environ.get("REFERRAL_BONUS", "300"))
# Monety na start: normalnie, oraz gdy ktoś zarejestruje się z cudzym kodem polecającym.
START_COINS = int(os.environ.get("START_COINS", "1000"))
START_COINS_REFERRED = int(os.environ.get("START_COINS_REFERRED", "1500"))
APP_INSTALL_URL = os.environ.get("APP_INSTALL_URL", "https://github.com/xeniak123/popbet12/releases/latest")
# Znaki kodu — bez mylących (0/O, 1/I).
REF_ALPHABET = "".join(c for c in (string.ascii_uppercase + string.digits) if c not in "O0I1")

# --- Sezony rankingowe ---
# Saldo sezonowe to osobny licznik zysku/straty z rozstrzygniętych zakładów.
# Gracz gra normalnie swoimi monetami — sezon tylko zlicza wynik w oknie czasu.
SEASON_DAYS = int(os.environ.get("SEASON_DAYS", "28"))
SEASON_EPOCH = datetime(2026, 7, 27, tzinfo=timezone.utc)  # poniedziałek, start sezonu 1

# --- Polecenia: premia progowa ---
REFERRAL_MILESTONE_EVERY = int(os.environ.get("REFERRAL_MILESTONE_EVERY", "5"))
REFERRAL_MILESTONE_BONUS = int(os.environ.get("REFERRAL_MILESTONE_BONUS", "1000"))

# --- Odznaki ---
# Czysty status: NIE dają monet ani przewagi, żeby nie psuć balansu pari-mutuel.
BADGE_DEFS = [
    {"code": "streak", "name": "Dzienna passa", "emoji": "🔥", "stat": "streak_best",
     "desc": "Dni z rzędu z odebranym bonusem",
     "tiers": [("brąz", 7), ("srebro", 30), ("złoto", 100)]},
    {"code": "hitstreak", "name": "Seria trafień", "emoji": "🎯", "stat": "hit_streak_best",
     "desc": "Trafione zakłady z rzędu",
     "tiers": [("brąz", 5), ("srebro", 10), ("złoto", 20)]},
    {"code": "bigwin", "name": "Gruba wygrana", "emoji": "💰", "stat": "biggest_win",
     "desc": "Zysk z jednego kuponu",
     "tiers": [("brąz", 1000), ("srebro", 10000), ("złoto", 50000)]},
    {"code": "referrals", "name": "Ambasador", "emoji": "🤝", "stat": "referrals",
     "desc": "Osoby, które weszły z Twoim kodem",
     "tiers": [("brąz", 1), ("srebro", 5), ("złoto", 25)]},
    {"code": "generous", "name": "Hojny", "emoji": "💸", "stat": "transferred_out",
     "desc": "Monety przelane znajomym",
     "tiers": [("brąz", 1000), ("srebro", 10000), ("złoto", 100000)]},
    {"code": "explorer", "name": "Odkrywca", "emoji": "🧭", "stat": "categories_count",
     "desc": "Kategorie, w których obstawiałeś",
     "tiers": [("brąz", 3), ("złoto", 5)]},
    {"code": "cardsharp", "name": "Król kart", "emoji": "🃏", "stat": "quick_rank_hits",
     "desc": "Trafione wartości karty (szansa 1/13)",
     "tiers": [("brąz", 1), ("srebro", 3), ("złoto", 10)]},
]

WARSAW_TZ = ZoneInfo("Europe/Warsaw")
SUIT_COLOR = {"hearts": "red", "diamonds": "red", "clubs": "black", "spades": "black"}
SUIT_SYMBOL = {"hearts": "♥", "diamonds": "♦", "clubs": "♣", "spades": "♠"}
CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
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
    referral_code: Optional[str] = Field(default=None, max_length=16)


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


VALID_CATEGORIES = ("sport", "awards", "reality_tv", "gossip", "music")


class AdminBetIn(BaseModel):
    category: str
    question: str
    subtitle: Optional[str] = None
    option_a: str
    option_b: str
    closes_in_hours: Optional[float] = Field(default=None, gt=0, le=24 * 365)
    closes_at: Optional[datetime] = None
    image_url: Optional[str] = None


class AdminBetsImportIn(BaseModel):
    bets: List[AdminBetIn]


class AdminResolveItem(BaseModel):
    bet_id: str
    winning_option: str  # "a" | "b" | "unknown"
    reason: Optional[str] = None


class AdminResolveBatchIn(BaseModel):
    results: List[AdminResolveItem]


class QuickPlayIn(BaseModel):
    color: str  # "red" | "black"
    color_stake: int = Field(ge=1)
    suit: Optional[str] = None            # hearts | diamonds | clubs | spades
    suit_stake: Optional[int] = None
    rank: Optional[str] = None            # A, 2..10, J, Q, K
    rank_stake: Optional[int] = None


# ---------- helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def require_admin(x_admin_key: Optional[str] = Header(default=None, alias="X-Admin-Key")) -> None:
    if not ADMIN_KEY:
        raise HTTPException(status_code=503, detail="Panel admina wyłączony — ustaw zmienną ADMIN_KEY")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Nieprawidłowy klucz admina")


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def warsaw_today() -> str:
    return datetime.now(WARSAW_TZ).strftime("%Y-%m-%d")


def season_number(now: Optional[datetime] = None) -> int:
    now = now or now_utc()
    return max(1, (now - SEASON_EPOCH).days // SEASON_DAYS + 1)


def season_bounds(n: int) -> tuple[datetime, datetime]:
    start = SEASON_EPOCH + timedelta(days=(n - 1) * SEASON_DAYS)
    return start, start + timedelta(days=SEASON_DAYS)


async def add_season_pnl(user_id: str, delta: int) -> None:
    """Dopisuje bilans do salda sezonowego; przy nowym sezonie archiwizuje i zeruje."""
    n = season_number()
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "season_n": 1, "season_pnl": 1})
    if not u:
        return
    if u.get("season_n") != n:
        update: dict = {"$set": {"season_n": n, "season_pnl": delta}}
        if u.get("season_n"):
            update["$push"] = {"season_history": {"n": u["season_n"], "pnl": u.get("season_pnl", 0)}}
        await db.users.update_one({"user_id": user_id}, update)
    else:
        await db.users.update_one({"user_id": user_id}, {"$inc": {"season_pnl": delta}})


def effective_season_pnl(user: dict) -> int:
    """Wynik sezonowy liczy się tylko, gdy pochodzi z bieżącego sezonu."""
    return int(user.get("season_pnl", 0)) if user.get("season_n") == season_number() else 0


def league_for(rank: int, total: int) -> str:
    """Liga z percentyla — każdy rywalizuje z podobnymi, bez machiny awansów/spadków."""
    if total <= 0 or rank <= 0:
        return "Brąz"
    p = rank / total
    if p <= 0.10:
        return "Diament"
    if p <= 0.35:
        return "Złoto"
    if p <= 0.70:
        return "Srebro"
    return "Brąz"


def badge_values(user: dict) -> dict:
    s = user.get("stats", {}) or {}
    return {
        "streak_best": int((user.get("streak", {}) or {}).get("best", 0)),
        "hit_streak_best": int(s.get("best_hit_streak", 0)),
        "biggest_win": int(s.get("biggest_win", 0)),
        "referrals": int(user.get("referrals", 0)),
        "transferred_out": int(s.get("transferred_out", 0)),
        "categories_count": len(s.get("categories_played", []) or []),
        "quick_rank_hits": int(s.get("quick_rank_hits", 0)),
    }


def earned_badge_ids(user: dict) -> List[str]:
    vals = badge_values(user)
    out: List[str] = []
    for d in BADGE_DEFS:
        v = vals.get(d["stat"], 0)
        for tier_name, threshold in d["tiers"]:
            if v >= threshold:
                out.append(f"{d['code']}:{tier_name}")
    return out


async def finalize_past_seasons() -> None:
    """Domyka poprzedni sezon i przyznaje tytuły top 3. Leniwie — bez crona."""
    prev = season_number() - 1
    if prev < 1:
        return
    done = await db.seasons.find_one({"n": prev}, {"_id": 0, "n": 1})
    if done:
        return
    top = await db.users.find(
        {"season_n": prev}, {"_id": 0, "user_id": 1, "username": 1, "season_pnl": 1}
    ).sort("season_pnl", -1).limit(3).to_list(3)
    await db.seasons.insert_one({
        "n": prev,
        "finalized_at": now_utc(),
        "top": [{"user_id": u["user_id"], "username": u["username"], "pnl": u.get("season_pnl", 0)}
                for u in top],
    })
    for place, u in enumerate(top, start=1):
        if u.get("season_pnl", 0) <= 0:
            continue  # tytuł tylko za wynik na plusie
        await db.users.update_one(
            {"user_id": u["user_id"]},
            {"$addToSet": {"titles": {"season": prev, "place": place,
                                      "label": f"Mistrz Sezonu {prev}" if place == 1
                                      else f"Podium Sezonu {prev}"}}},
        )


def quick_plays_used(user: dict) -> int:
    qs = user.get("quick_state") or {}
    if qs.get("date") == warsaw_today():
        return int(qs.get("count", 0))
    return 0


async def gen_referral_code() -> str:
    for _ in range(10):
        code = "".join(random.choice(REF_ALPHABET) for _ in range(6))
        if not await db.users.find_one({"referral_code": code}, {"_id": 0, "user_id": 1}):
            return code
    return "".join(random.choice(REF_ALPHABET) for _ in range(8))


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
    my_code = await gen_referral_code()

    # kto mnie polecił (jeśli podano kod)
    referrer = None
    ref = (payload.referral_code or "").strip().upper()
    if ref:
        referrer = await db.users.find_one({"referral_code": ref}, {"_id": 0, "user_id": 1})
    # user_id jest świeżo wygenerowany, więc polecenie samego siebie jest niemożliwe
    referrer_id = referrer["user_id"] if referrer and referrer["user_id"] != user_id else None

    doc = {
        "user_id": user_id,
        "email": email,
        "username": username,
        "phone": (payload.phone or "").strip() or None,
        "phone_normalized": _normalize_phone(payload.phone or "") or None,
        "password_hash": pwd_ctx.hash(payload.password),
        # z ważnym kodem polecającym startujesz z większą pulą
        "coins": START_COINS_REFERRED if referrer_id else START_COINS,
        "avatar": avatar,
        "created_at": now_utc(),
        "stats": {"total_bets": 0, "wins": 0, "losses": 0, "current_streak": 0, "best_streak": 0},
        "streak": {"current": 0, "best": 0, "last_checkin": None},
        "push_tokens": [],
        "referral_code": my_code,
        "referrals": 0,
    }
    if referrer_id:
        doc["referred_by"] = referrer_id

    await db.users.insert_one(doc)
    # nagroda dla polecającego dopiero po udanej rejestracji
    if referrer_id:
        after = await db.users.find_one_and_update(
            {"user_id": referrer_id},
            {"$inc": {"coins": REFERRAL_BONUS, "referrals": 1}},
            projection={"_id": 0, "referrals": 1},
            return_document=ReturnDocument.AFTER,
        )
        # premia progowa: co N-te polecenie dodatkowy zastrzyk
        count = (after or {}).get("referrals", 0)
        if REFERRAL_MILESTONE_EVERY > 0 and count and count % REFERRAL_MILESTONE_EVERY == 0:
            await db.users.update_one(
                {"user_id": referrer_id}, {"$inc": {"coins": REFERRAL_MILESTONE_BONUS}}
            )
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
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"coins": -payload.stake},
         "$addToSet": {"stats.categories_played": bet["category"]}},  # pod odznakę „Odkrywca”
    )
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


# --- resolve (z kluczem admina, jeśli ADMIN_KEY ustawiony; bez klucza tylko w trybie dev) ---
async def _do_resolve(bet: dict, win_key: str) -> dict:
    bet_id = bet["bet_id"]
    lose_key = "b" if win_key == "a" else "a"

    win_option = next(o for o in bet["options"] if o["key"] == win_key)
    lose_option = next(o for o in bet["options"] if o["key"] == lose_key)
    winners_pool = win_option["stake_total"] or 0
    losers_pool = lose_option["stake_total"] or 0

    placements = await db.placements.find({"bet_id": bet_id}, {"_id": 0}).to_list(1000)
    to_notify: List[str] = []
    for p in placements:
        won = p["option"] == win_key
        # pari-mutuel: zwrot stawki + proporcjonalny udzial w puli przegranych,
        # ale nie mniej niz gwarancja od banku (stake * (1 + HOUSE_MIN_PROFIT_RATIO)).
        if won and winners_pool > 0:
            share = (p["stake"] / winners_pool) * losers_pool
            parimutuel = p["stake"] + share
            guaranteed = p["stake"] * (1 + HOUSE_MIN_PROFIT_RATIO)
            payout = int(round(max(parimutuel, guaranteed)))
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

        # seria trafień z rzędu (pod odznakę) — rośnie przy wygranej, zeruje przy przegranej
        if won:
            await db.users.update_one({"user_id": p["user_id"]}, {"$inc": {"stats.hit_streak": 1}})
            fresh = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "stats": 1})
            st = (fresh or {}).get("stats", {}) or {}
            if st.get("hit_streak", 0) > st.get("best_hit_streak", 0):
                await db.users.update_one(
                    {"user_id": p["user_id"]},
                    {"$set": {"stats.best_hit_streak": st["hit_streak"]}},
                )
        else:
            await db.users.update_one({"user_id": p["user_id"]}, {"$set": {"stats.hit_streak": 0}})

        # wynik sezonowy: zysk netto albo strata stawki
        await add_season_pnl(p["user_id"], payout - p["stake"])
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


@app.post("/api/bets/{bet_id}/resolve")
async def resolve_bet(
    bet_id: str,
    payload: ResolveIn,
    x_admin_key: Optional[str] = Header(default=None, alias="X-Admin-Key"),
):
    if ADMIN_KEY and (not x_admin_key or not hmac.compare_digest(x_admin_key, ADMIN_KEY)):
        raise HTTPException(status_code=401, detail="Nieprawidłowy klucz admina")
    bet = await db.bets.find_one({"bet_id": bet_id}, {"_id": 0})
    if not bet:
        raise HTTPException(status_code=404, detail="Zakład nie istnieje")
    if bet.get("resolved"):
        raise HTTPException(status_code=400, detail="Zakład już rozstrzygnięty")
    if payload.winning_option not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Nieprawidłowa opcja")
    return await _do_resolve(bet, payload.winning_option)


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

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"coins": -payload.amount, "stats.transferred_out": payload.amount}},  # odznaka „Hojny”
    )
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


# --- admin ---
@app.post("/api/admin/bets", status_code=201)
async def admin_add_bets(payload: AdminBetsImportIn, _: None = Depends(require_admin)):
    if not payload.bets:
        raise HTTPException(status_code=400, detail="Pusta lista zakładów")
    now = now_utc()
    docs = []
    errors = []
    for i, b in enumerate(payload.bets, start=1):
        if b.category not in VALID_CATEGORIES:
            errors.append(f"Zakład {i}: nieznana kategoria '{b.category}' (dozwolone: {', '.join(VALID_CATEGORIES)})")
            continue
        if not b.question.strip() or not b.option_a.strip() or not b.option_b.strip():
            errors.append(f"Zakład {i}: question/option_a/option_b nie mogą być puste")
            continue
        closes_at = b.closes_at
        if closes_at is None:
            closes_at = now + timedelta(hours=b.closes_in_hours or 24)
        elif closes_at.tzinfo is None:
            closes_at = closes_at.replace(tzinfo=timezone.utc)
        if closes_at <= now:
            errors.append(f"Zakład {i}: data zamknięcia jest w przeszłości")
            continue
        docs.append({
            "bet_id": make_id("bet"),
            "category": b.category,
            "question": b.question.strip(),
            "subtitle": (b.subtitle or "").strip() or None,
            "options": [
                {"key": "a", "label": b.option_a.strip(), "stake_total": 0, "voters": 0},
                {"key": "b", "label": b.option_b.strip(), "stake_total": 0, "voters": 0},
            ],
            "closes_at": closes_at,
            "created_at": now,
            "resolved": False,
            "winning_option": None,
            "image_url": b.image_url,
        })
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    await db.bets.insert_many(docs)
    for d in docs:
        d.pop("_id", None)
    return {"ok": True, "created": len(docs), "bets": docs}


@app.post("/api/admin/bets/resolve-batch")
async def admin_resolve_batch(payload: AdminResolveBatchIn, _: None = Depends(require_admin)):
    if not payload.results:
        raise HTTPException(status_code=400, detail="Pusta lista wyników")
    out = []
    for item in payload.results:
        if item.winning_option not in ("a", "b"):
            out.append({"bet_id": item.bet_id, "status": "pominięty", "detail": "wynik nieznany"})
            continue
        bet = await db.bets.find_one({"bet_id": item.bet_id}, {"_id": 0})
        if not bet:
            out.append({"bet_id": item.bet_id, "status": "błąd", "detail": "zakład nie istnieje"})
            continue
        if bet.get("resolved"):
            out.append({"bet_id": item.bet_id, "status": "pominięty", "detail": "już rozstrzygnięty"})
            continue
        result = await _do_resolve(bet, item.winning_option)
        win_label = next(o["label"] for o in bet["options"] if o["key"] == item.winning_option)
        out.append({
            "bet_id": item.bet_id,
            "status": "rozstrzygnięty",
            "detail": f"wygrało: {win_label}, wygranych kuponów: {result['winners']}",
        })
    return {"ok": True, "results": out}


@app.get("/api/admin/bets")
async def admin_list_bets(_: None = Depends(require_admin)):
    bets = await db.bets.find({}, {"_id": 0}).sort([("resolved", 1), ("closes_at", 1)]).to_list(500)
    return {"bets": bets}


@app.delete("/api/admin/bets/{bet_id}")
async def admin_delete_bet(bet_id: str, _: None = Depends(require_admin)):
    bet = await db.bets.find_one({"bet_id": bet_id}, {"_id": 0})
    if not bet:
        raise HTTPException(status_code=404, detail="Zakład nie istnieje")
    if bet.get("resolved"):
        raise HTTPException(status_code=400, detail="Zakład już rozstrzygnięty — nie można usunąć")
    # zwrot monet za nierozstrzygnięte kupony
    placements = await db.placements.find({"bet_id": bet_id}, {"_id": 0}).to_list(1000)
    refunded = 0
    for p in placements:
        if not p.get("resolved"):
            await db.users.update_one({"user_id": p["user_id"]}, {"$inc": {"coins": p["stake"]}})
            refunded += 1
    await db.placements.delete_many({"bet_id": bet_id})
    await db.bets.delete_one({"bet_id": bet_id})
    return {"ok": True, "refunded_placements": refunded}


@app.get("/admin", include_in_schema=False)
async def admin_page():
    from fastapi.responses import HTMLResponse
    path = ROOT_DIR / "admin.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="admin.html nie znaleziony")
    return HTMLResponse(path.read_text(encoding="utf-8"))


# --- polecenia (referral) ---
@app.get("/api/referral/me")
async def referral_me(user: dict = Depends(get_current_user)):
    code = user.get("referral_code")
    if not code:
        code = await gen_referral_code()
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"referral_code": code}},
        )
    referrals = int(user.get("referrals", 0))
    message = (
        "Gram w PopBet — typuj wydarzenia i zgarniaj monety, plus gra w kartę! 🎲🃏\n\n"
        f"1) Zainstaluj aplikację z tego linku:\n{APP_INSTALL_URL}\n\n"
        f"2) Przy rejestracji wpisz mój kod polecający: {code}\n\n"
        f"Dzięki temu startujesz z {START_COINS_REFERRED} monetami zamiast {START_COINS}, "
        f"a ja dostaję {REFERRAL_BONUS}. Do zobaczenia w grze! 🙌"
    )
    every = max(1, REFERRAL_MILESTONE_EVERY)
    next_milestone = (referrals // every + 1) * every
    return {
        "code": code,
        "referrals": referrals,
        "bonus": REFERRAL_BONUS,
        "start_coins": START_COINS,
        "start_coins_referred": START_COINS_REFERRED,
        "install_url": APP_INSTALL_URL,
        "message": message,
        # postęp do premii progowej — żeby w apce pokazać pasek zamiast samej liczby
        "milestone_every": every,
        "milestone_bonus": REFERRAL_MILESTONE_BONUS,
        "next_milestone": next_milestone,
        "to_next_milestone": max(0, next_milestone - referrals),
    }


# --- odznaki ---
@app.get("/api/badges")
async def badges(user: dict = Depends(get_current_user)):
    vals = badge_values(user)
    known = set(user.get("badges", []) or [])
    earned = earned_badge_ids(user)
    fresh = [b for b in earned if b not in known]
    if fresh:
        await db.users.update_one(
            {"user_id": user["user_id"]}, {"$addToSet": {"badges": {"$each": fresh}}}
        )

    out = []
    for d in BADGE_DEFS:
        v = vals.get(d["stat"], 0)
        tiers = [{"tier": t, "threshold": thr, "earned": v >= thr} for t, thr in d["tiers"]]
        got = [t for t in tiers if t["earned"]]
        nxt = next((t for t in tiers if not t["earned"]), None)
        out.append({
            "code": d["code"], "name": d["name"], "emoji": d["emoji"], "desc": d["desc"],
            "value": v, "tiers": tiers,
            "highest": got[-1]["tier"] if got else None,
            "next": ({"tier": nxt["tier"], "threshold": nxt["threshold"],
                      "remaining": max(0, nxt["threshold"] - v)} if nxt else None),
        })

    return {
        "badges": out,
        "earned_count": len(earned),
        "total_count": sum(len(d["tiers"]) for d in BADGE_DEFS),
        "new": fresh,  # do świętowania w aplikacji (konfetti + toast)
        "titles": user.get("titles", []) or [],
    }


# --- ranking sezonowy ---
@app.get("/api/leaderboard/season")
async def leaderboard_season(user: dict = Depends(get_current_user)):
    await finalize_past_seasons()
    n = season_number()
    start, end = season_bounds(n)

    players = await db.users.find(
        {"season_n": n}, {"_id": 0, "user_id": 1, "username": 1, "avatar": 1, "season_pnl": 1}
    ).sort("season_pnl", -1).to_list(500)
    total = len(players)

    rows = [{
        "user_id": p["user_id"], "username": p["username"], "avatar": p.get("avatar", ""),
        "pnl": int(p.get("season_pnl", 0)), "rank": i + 1,
        "league": league_for(i + 1, total),
    } for i, p in enumerate(players[:100])]

    my_pnl = effective_season_pnl(user)
    my_rank = next((i + 1 for i, p in enumerate(players) if p["user_id"] == user["user_id"]), 0)
    me = {
        "user_id": user["user_id"], "username": user["username"], "avatar": user.get("avatar", ""),
        "pnl": my_pnl,
        "rank": my_rank or (total + 1),
        "league": league_for(my_rank, total) if my_rank else "Brąz",
        "played": my_rank > 0,
    }

    return {
        "season": n,
        "starts_at": start,
        "ends_at": end,
        "days_left": max(0, (end - now_utc()).days),
        "players": total,
        "rows": rows,
        "me": me,
        "history": user.get("season_history", [])[-6:],
        "titles": user.get("titles", []) or [],
    }


# --- ranking polecających ---
@app.get("/api/referral/leaderboard")
async def referral_leaderboard(user: dict = Depends(get_current_user)):
    top = await db.users.find(
        {"referrals": {"$gt": 0}}, {"_id": 0, "user_id": 1, "username": 1, "avatar": 1, "referrals": 1}
    ).sort("referrals", -1).limit(50).to_list(50)
    rows = [{
        "user_id": u["user_id"], "username": u["username"], "avatar": u.get("avatar", ""),
        "referrals": int(u.get("referrals", 0)), "rank": i + 1,
    } for i, u in enumerate(top)]
    mine = int(user.get("referrals", 0))
    my_rank = next((r["rank"] for r in rows if r["user_id"] == user["user_id"]), 0)
    return {"rows": rows, "me": {"referrals": mine, "rank": my_rank}}


# --- szybkie zakłady (gra w kartę) ---
@app.get("/api/quick/status")
async def quick_status(user: dict = Depends(get_current_user)):
    used = quick_plays_used(user)
    return {
        "plays_left": max(0, QUICK_MAX_PER_DAY - used),
        "max_per_day": QUICK_MAX_PER_DAY,
        "min_stake": QUICK_MIN_STAKE,
        "coins": user["coins"],
        "multipliers": {"color": QUICK_COLOR_MULT, "suit": QUICK_SUIT_MULT, "rank": QUICK_RANK_MULT},
    }


@app.post("/api/quick/play")
async def quick_play(payload: QuickPlayIn, user: dict = Depends(get_current_user)):
    used = quick_plays_used(user)
    if used >= QUICK_MAX_PER_DAY:
        raise HTTPException(status_code=400, detail=f"Wykorzystałeś już {QUICK_MAX_PER_DAY} szybkie zakłady na dziś. Wróć jutro!")

    if payload.color not in ("red", "black"):
        raise HTTPException(status_code=400, detail="Nieprawidłowy kolor")
    if payload.color_stake < QUICK_MIN_STAKE:
        raise HTTPException(status_code=400, detail=f"Minimalna stawka to {QUICK_MIN_STAKE}")

    # hierarchia: numer wymaga znaku, znak wymaga koloru (kolor jest zawsze)
    legs = [("color", payload.color, payload.color_stake, QUICK_COLOR_MULT)]

    if payload.suit is not None:
        if payload.suit not in SUIT_COLOR:
            raise HTTPException(status_code=400, detail="Nieprawidłowy kolor karty")
        if SUIT_COLOR[payload.suit] != payload.color:
            raise HTTPException(status_code=400, detail="Kolor (kier/karo/trefl/pik) musi pasować do wybranej barwy")
        if not payload.suit_stake or payload.suit_stake < QUICK_MIN_STAKE:
            raise HTTPException(status_code=400, detail=f"Minimalna stawka na kolor to {QUICK_MIN_STAKE}")
        legs.append(("suit", payload.suit, payload.suit_stake, QUICK_SUIT_MULT))

    if payload.rank is not None:
        if payload.suit is None:
            raise HTTPException(status_code=400, detail="Wartość można obstawić tylko razem z kolorem")
        if payload.rank not in CARD_RANKS:
            raise HTTPException(status_code=400, detail="Nieprawidłowa wartość karty")
        if not payload.rank_stake or payload.rank_stake < QUICK_MIN_STAKE:
            raise HTTPException(status_code=400, detail=f"Minimalna stawka na wartość to {QUICK_MIN_STAKE}")
        legs.append(("rank", payload.rank, payload.rank_stake, QUICK_RANK_MULT))

    total_stake = sum(l[2] for l in legs)
    if total_stake > user["coins"]:
        raise HTTPException(status_code=400, detail="Za mało monet na tę stawkę")

    # rozdanie karty
    suit = random.choice(list(SUIT_COLOR.keys()))
    rank = random.choice(CARD_RANKS)
    card = {"suit": suit, "color": SUIT_COLOR[suit], "rank": rank, "label": f"{rank}{SUIT_SYMBOL[suit]}"}

    results = []
    total_payout = 0
    for kind, guess, stake, mult in legs:
        if kind == "color":
            win = guess == card["color"]
        elif kind == "suit":
            win = guess == card["suit"]
        else:
            win = guess == card["rank"]
        payout = int(round(stake * mult)) if win else 0
        total_payout += payout
        results.append({"type": kind, "guess": guess, "stake": stake, "win": win, "payout": payout})

    net = total_payout - total_stake
    inc: dict = {"coins": net}
    # trafiona wartość karty (1/13) — pod odznakę „Król kart”
    if any(r["type"] == "rank" and r["win"] for r in results):
        inc["stats.quick_rank_hits"] = 1
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": inc, "$set": {"quick_state": {"date": warsaw_today(), "count": used + 1}}},
    )
    await add_season_pnl(user["user_id"], net)

    return {
        "card": card,
        "legs": results,
        "total_stake": total_stake,
        "total_payout": total_payout,
        "net": net,
        "coins": user["coins"] + net,
        "plays_left": max(0, QUICK_MAX_PER_DAY - (used + 1)),
    }
