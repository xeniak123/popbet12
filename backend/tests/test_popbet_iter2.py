"""PopBet iteration-2 backend tests: streak, mutual friends, phone, transfer, google."""
import uuid
import pytest
import requests
from conftest import BASE_URL, auth_headers


def _signup(api, phone=None):
    uid = uuid.uuid4().hex[:6]
    email = f"TEST_i2_{uid}@popbet.com"
    payload = {"email": email, "password": "secret123", "username": f"TESTi2{uid}"}
    if phone is not None:
        payload["phone"] = phone
    r = api.post(f"{BASE_URL}/api/auth/signup", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# ---------- signup + /me with new fields ----------
class TestAuthNewFields:
    def test_signup_with_phone_and_me_returns_streak_fields(self, api):
        u = _signup(api, phone="+48 501 234 567")
        assert u["user"]["phone"] == "+48 501 234 567"
        r = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(u["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["streak_days"] == 0
        assert body["best_streak"] == 0
        assert body["phone"] == "+48 501 234 567"

    def test_signup_without_phone_returns_null(self, api):
        u = _signup(api)
        assert u["user"].get("phone") in (None, "")


# ---------- streak ----------
class TestStreak:
    def test_status_fresh_user(self, api):
        u = _signup(api)
        r = api.get(f"{BASE_URL}/api/streak/status", headers=auth_headers(u["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["current"] == 0
        assert body["best"] == 0
        assert body["can_checkin"] is True
        assert body["next_bonus"] == 50

    def test_checkin_grants_bonus_and_second_call_409(self, api):
        u = _signup(api)
        me1 = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(u["token"])).json()
        r = api.post(f"{BASE_URL}/api/streak/checkin", headers=auth_headers(u["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["bonus"] == 50
        assert body["current"] == 1
        assert body["best"] == 1
        # coins increased by 50
        me2 = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(u["token"])).json()
        assert me2["coins"] == me1["coins"] + 50
        # /me reports streak_days=1
        assert me2["streak_days"] == 1
        # second call same day -> 409
        r2 = api.post(f"{BASE_URL}/api/streak/checkin", headers=auth_headers(u["token"]))
        assert r2.status_code == 409
        # status now can_checkin=false
        st = api.get(f"{BASE_URL}/api/streak/status", headers=auth_headers(u["token"])).json()
        assert st["can_checkin"] is False


# ---------- mutual friend requests ----------
class TestFriendRequests:
    def test_request_unknown_returns_404(self, api):
        u = _signup(api)
        r = api.post(f"{BASE_URL}/api/friends/request",
                     headers=auth_headers(u["token"]),
                     json={"username": f"nouser_{uuid.uuid4().hex[:6]}"})
        assert r.status_code == 404

    def test_request_self_returns_400(self, api):
        u = _signup(api)
        r = api.post(f"{BASE_URL}/api/friends/request",
                     headers=auth_headers(u["token"]),
                     json={"username": u["user"]["username"]})
        assert r.status_code == 400

    def test_pending_incoming_and_reject(self, api):
        a = _signup(api)
        b = _signup(api)
        # a -> b
        r = api.post(f"{BASE_URL}/api/friends/request",
                     headers=auth_headers(a["token"]),
                     json={"username": b["user"]["username"]})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"
        # b sees incoming
        r = api.get(f"{BASE_URL}/api/friends/pending", headers=auth_headers(b["token"]))
        assert r.status_code == 200
        incoming = r.json()["incoming"]
        req = next((x for x in incoming if x["from_id"] == a["user"]["user_id"]), None)
        assert req is not None
        # reject
        rj = api.post(f"{BASE_URL}/api/friends/reject",
                      headers=auth_headers(b["token"]),
                      json={"request_id": req["request_id"]})
        assert rj.status_code == 200
        # incoming empty
        r = api.get(f"{BASE_URL}/api/friends/pending", headers=auth_headers(b["token"]))
        assert not any(x["request_id"] == req["request_id"] for x in r.json()["incoming"])

    def test_accept_creates_mutual_friendship(self, api):
        a = _signup(api)
        b = _signup(api)
        r = api.post(f"{BASE_URL}/api/friends/request",
                     headers=auth_headers(a["token"]),
                     json={"username": b["user"]["username"]})
        assert r.status_code == 200
        req = api.get(f"{BASE_URL}/api/friends/pending",
                      headers=auth_headers(b["token"])).json()["incoming"][0]
        r = api.post(f"{BASE_URL}/api/friends/accept",
                     headers=auth_headers(b["token"]),
                     json={"request_id": req["request_id"]})
        assert r.status_code == 200, r.text
        # both see each other in /friends/list
        a_list = api.get(f"{BASE_URL}/api/friends/list", headers=auth_headers(a["token"])).json()
        b_list = api.get(f"{BASE_URL}/api/friends/list", headers=auth_headers(b["token"])).json()
        assert any(f["user_id"] == b["user"]["user_id"] for f in a_list)
        assert any(f["user_id"] == a["user"]["user_id"] for f in b_list)
        # leaderboard/friends includes each other
        a_lb = api.get(f"{BASE_URL}/api/leaderboard/friends",
                       headers=auth_headers(a["token"])).json()
        ids = {row["user_id"] for row in a_lb["rows"]}
        assert b["user"]["user_id"] in ids and a["user"]["user_id"] in ids

    def test_reverse_request_auto_accepts(self, api):
        a = _signup(api)
        b = _signup(api)
        # a -> b (pending)
        r = api.post(f"{BASE_URL}/api/friends/request",
                     headers=auth_headers(a["token"]),
                     json={"username": b["user"]["username"]})
        assert r.status_code == 200 and r.json()["status"] == "pending"
        # b -> a should auto-accept
        r = api.post(f"{BASE_URL}/api/friends/request",
                     headers=auth_headers(b["token"]),
                     json={"username": a["user"]["username"]})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "accepted"
        a_list = api.get(f"{BASE_URL}/api/friends/list", headers=auth_headers(a["token"])).json()
        assert any(f["user_id"] == b["user"]["user_id"] for f in a_list)


# ---------- phone matching ----------
class TestFindByPhones:
    def test_matches_by_last_9_digits(self, api):
        # signup with a compact (digits-only) phone so the last-9-digit regex hits
        digits = uuid.uuid4().int
        phone = f"+48{500000000 + digits % 100000000}"  # e.g. +48555123456
        u = _signup(api, phone=phone)
        searcher = _signup(api)
        # search with a differently formatted variant containing same last 9 digits
        last9 = phone[-9:]
        variant = f"0{last9[:3]}-{last9[3:6]}-{last9[6:]}"
        r = api.post(f"{BASE_URL}/api/friends/find-by-phones",
                     headers=auth_headers(searcher["token"]),
                     json={"phones": [variant, "+00 000"]})
        assert r.status_code == 200, r.text
        matches = r.json()["matches"]
        assert any(m["user_id"] == u["user"]["user_id"] for m in matches), (
            f"expected match on last9={last9}, got {matches}")

    def test_stored_phone_with_spaces_now_matches(self, api):
        """FIX VERIFICATION (iter3): user signs up with formatted phone; searcher with any
        formatting must find them because signup now stores phone_normalized (digits only)."""
        # unique last 9 digits so we don't collide with other test users
        tail = f"6{uuid.uuid4().int % 10**8:08d}"  # 9 digits starting with 6
        stored = f"+48 {tail[:3]} {tail[3:6]} {tail[6:]}"
        u = _signup(api, phone=stored)
        searcher = _signup(api)
        # search with a completely different formatting (parens, dashes)
        variant = f"(+48) {tail[:3]}-{tail[3:6]}-{tail[6:]}"
        r = api.post(f"{BASE_URL}/api/friends/find-by-phones",
                     headers=auth_headers(searcher["token"]),
                     json={"phones": [variant]})
        assert r.status_code == 200, r.text
        matches = r.json()["matches"]
        assert any(m["user_id"] == u["user"]["user_id"] for m in matches), (
            f"expected match on last9={tail}, got {matches}")

    def test_irrelevant_phone_returns_empty(self, api):
        """Search with a phone that no user owns must return empty matches."""
        searcher = _signup(api)
        # use random 9-digit tail starting with 9 (very unlikely to collide)
        rand_tail = f"9{uuid.uuid4().int % 10**8:08d}"
        r = api.post(f"{BASE_URL}/api/friends/find-by-phones",
                     headers=auth_headers(searcher["token"]),
                     json={"phones": [f"+48 {rand_tail}"]})
        assert r.status_code == 200
        assert r.json()["matches"] == []

    def test_backfill_matches_legacy_user(self, api):
        """Insert a legacy-shape user (phone set, phone_normalized MISSING) directly into
        MongoDB, restart backend to trigger lifespan backfill, then verify the user is
        findable via find-by-phones with a differently formatted variant."""
        import os
        import subprocess
        import time
        from pymongo import MongoClient

        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mongo_url = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME") or env.get("DB_NAME")
        assert mongo_url and db_name, f"MONGO_URL/DB_NAME not resolvable: {mongo_url!r} {db_name!r}"

        mc = MongoClient(mongo_url)
        try:
            uid = uuid.uuid4().hex[:6]
            tail = f"7{uuid.uuid4().int % 10**8:08d}"
            legacy_phone = f"+48 {tail[:3]} {tail[3:6]} {tail[6:]}"
            legacy = {
                "user_id": f"usr_legacy{uid}",
                "email": f"TEST_legacy_{uid}@popbet.com",
                "username": f"TESTleg{uid}",
                "phone": legacy_phone,
                # NOTE: no phone_normalized field — mimics pre-fix state
                "password_hash": "x",
                "coins": 1000,
                "avatar": "",
                "created_at": __import__("datetime").datetime.utcnow(),
                "stats": {},
                "streak": {"current": 0, "best": 0, "last_checkin": None},
                "push_tokens": [],
            }
            mc[db_name].users.insert_one(legacy)
            # sanity: no phone_normalized yet
            doc = mc[db_name].users.find_one({"user_id": legacy["user_id"]})
            assert "phone_normalized" not in doc

            # restart backend to fire lifespan backfill
            subprocess.run(["sudo", "supervisorctl", "restart", "backend"],
                           check=True, capture_output=True)
            # wait for backend to come back up
            for _ in range(30):
                try:
                    if api.get(f"{BASE_URL}/api/health", timeout=2).status_code == 200:
                        break
                except requests.RequestException:
                    pass
                time.sleep(1)
            else:
                pytest.fail("backend did not restart in time")

            # verify backfill populated phone_normalized
            doc2 = mc[db_name].users.find_one({"user_id": legacy["user_id"]})
            assert doc2.get("phone_normalized") is not None, doc2

            # now searcher signs up & queries with a variant
            searcher = _signup(api)
            variant = f"0{tail[:3]}-{tail[3:6]}-{tail[6:]}"
            r = api.post(f"{BASE_URL}/api/friends/find-by-phones",
                         headers=auth_headers(searcher["token"]),
                         json={"phones": [variant]})
            assert r.status_code == 200, r.text
            matches = r.json()["matches"]
            assert any(m["user_id"] == legacy["user_id"] for m in matches), (
                f"backfilled legacy user not matched. matches={matches}")
        finally:
            # cleanup
            try:
                mc[db_name].users.delete_one({"user_id": legacy["user_id"]})
            except Exception:
                pass
            mc.close()


# ---------- coin transfer ----------
class TestCoinTransfer:
    def test_transfer_success_updates_balances_and_history(self, api):
        a = _signup(api)
        b = _signup(api)
        amount = 300
        r = api.post(f"{BASE_URL}/api/coins/transfer",
                     headers=auth_headers(a["token"]),
                     json={"to_username": b["user"]["username"], "amount": amount})
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == amount
        me_a = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(a["token"])).json()
        me_b = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(b["token"])).json()
        assert me_a["coins"] == 1000 - amount
        assert me_b["coins"] == 1000 + amount
        # both parties see it in /coins/transfers
        tr_a = api.get(f"{BASE_URL}/api/coins/transfers", headers=auth_headers(a["token"])).json()
        tr_b = api.get(f"{BASE_URL}/api/coins/transfers", headers=auth_headers(b["token"])).json()
        assert any(t["amount"] == amount for t in tr_a["outgoing"])
        assert any(t["amount"] == amount for t in tr_b["incoming"])

    def test_transfer_to_self_400(self, api):
        a = _signup(api)
        r = api.post(f"{BASE_URL}/api/coins/transfer",
                     headers=auth_headers(a["token"]),
                     json={"to_username": a["user"]["username"], "amount": 50})
        assert r.status_code == 400

    def test_transfer_insufficient_400(self, api):
        a = _signup(api)
        b = _signup(api)
        r = api.post(f"{BASE_URL}/api/coins/transfer",
                     headers=auth_headers(a["token"]),
                     json={"to_username": b["user"]["username"], "amount": 999999})
        assert r.status_code == 400

    def test_transfer_unknown_user_404(self, api):
        a = _signup(api)
        r = api.post(f"{BASE_URL}/api/coins/transfer",
                     headers=auth_headers(a["token"]),
                     json={"to_username": f"nobody_{uuid.uuid4().hex[:6]}", "amount": 50})
        assert r.status_code == 404


# ---------- google session ----------
class TestGoogleSession:
    def test_invalid_session_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/google-session",
                     json={"session_id": "obviously-not-a-valid-session"})
        # Emergent demobackend should reject → 401 (or 502 if unreachable)
        assert r.status_code in (401, 502), r.text
