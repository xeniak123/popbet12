"""End-to-end backend tests for PopBet."""
import pytest
import requests
import uuid
from conftest import BASE_URL, auth_headers


# ---------- health ----------
class TestHealth:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True


# ---------- auth ----------
class TestAuth:
    def test_signup_returns_jwt_and_1000_coins(self, api):
        uid = uuid.uuid4().hex[:6]
        payload = {"email": f"TEST_signup_{uid}@popbet.com", "password": "secret123",
                   "username": f"TESTsu{uid}"}
        r = api.post(f"{BASE_URL}/api/auth/signup", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert "token" in data and data["token"]
        # backend lower-cases the email deliberately
        assert data["user"]["email"] == payload["email"].lower()
        assert data["user"]["username"] == payload["username"]
        assert data["user"]["coins"] == 1000

    def test_signup_duplicate_returns_409(self, api, user_a):
        r = api.post(f"{BASE_URL}/api/auth/signup",
                     json={"email": user_a["user"]["email"], "password": "secret123",
                           "username": user_a["user"]["username"]})
        assert r.status_code == 409

    def test_login_success(self, api, user_a):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": user_a["user"]["email"], "password": "secret123"})
        assert r.status_code == 200
        assert r.json()["user"]["user_id"] == user_a["user"]["user_id"]

    def test_login_wrong_password(self, api, user_a):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": user_a["user"]["email"], "password": "WRONGpw"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["email"] == user_a["user"]["email"]

    def test_me_missing_token(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": "Bearer nonsense.token.here"})
        assert r.status_code == 401


# ---------- bets listing / filter ----------
class TestBetsListing:
    def test_list_bets_all_categories(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/bets", headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        bets = r.json()
        assert isinstance(bets, list)
        assert len(bets) >= 5, f"expected active bets, got {len(bets)}"
        cats = {b["category"] for b in bets}
        expected = {"sport", "awards", "reality_tv", "gossip", "music"}
        assert expected.issubset(cats), f"missing categories: {expected - cats}"
        b0 = bets[0]
        assert "total_pool" in b0
        assert "user_choice" in b0
        assert "options" in b0 and len(b0["options"]) == 2

    def test_filter_by_category_sport(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/bets?category=sport",
                    headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        bets = r.json()
        assert len(bets) >= 1
        for b in bets:
            assert b["category"] == "sport"


# ---------- placements ----------
class TestPlaceBet:
    def test_place_bet_success_and_userchoice_set(self, api, user_b):
        # get a fresh bet (from list, pick sport)
        r = api.get(f"{BASE_URL}/api/bets", headers=auth_headers(user_b["token"]))
        bets = r.json()
        target = next(b for b in bets if b["user_choice"] is None)
        bet_id = target["bet_id"]
        prev_stake_a = next(o["stake_total"] for o in target["options"] if o["key"] == "a")

        # me: coins before
        me1 = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(user_b["token"])).json()

        r = api.post(f"{BASE_URL}/api/bets/{bet_id}/place",
                     headers=auth_headers(user_b["token"]),
                     json={"option": "a", "stake": 100})
        assert r.status_code == 200, r.text
        bet = r.json()
        assert bet["user_choice"] == "a"
        assert bet["user_stake"] == 100
        new_stake_a = next(o["stake_total"] for o in bet["options"] if o["key"] == "a")
        assert new_stake_a == prev_stake_a + 100

        me2 = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(user_b["token"])).json()
        assert me2["coins"] == me1["coins"] - 100

    def test_place_bet_duplicate_returns_409(self, api, user_b):
        # find placed bet from previous test
        r = api.get(f"{BASE_URL}/api/my-bets?status=active",
                    headers=auth_headers(user_b["token"]))
        active = r.json()
        assert len(active) >= 1
        bet_id = active[0]["bet_id"]
        r = api.post(f"{BASE_URL}/api/bets/{bet_id}/place",
                     headers=auth_headers(user_b["token"]),
                     json={"option": "b", "stake": 50})
        assert r.status_code == 409

    def test_place_bet_insufficient_coins_returns_400(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/bets", headers=auth_headers(user_a["token"]))
        bets = r.json()
        target = next(b for b in bets if b["user_choice"] is None)
        # stake below max 100000 but above user's coins (1000)
        r = api.post(f"{BASE_URL}/api/bets/{target['bet_id']}/place",
                     headers=auth_headers(user_a["token"]),
                     json={"option": "a", "stake": 99999})
        assert r.status_code == 400


# ---------- my-bets ----------
class TestMyBets:
    def test_active_placements_returned(self, api, user_b):
        r = api.get(f"{BASE_URL}/api/my-bets?status=active",
                    headers=auth_headers(user_b["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        row = rows[0]
        for k in ("bet_id", "category", "question", "choice", "stake", "resolved"):
            assert k in row


# ---------- resolve + payout ----------
class TestResolveFlow:
    def test_resolve_pari_mutuel_payout(self, api, user_a, user_b, user_c):
        # need a fresh bet - only user_c hasn't placed anything yet.
        # Actually we need a bet no one placed on. Use user_c's list.
        r = api.get(f"{BASE_URL}/api/bets", headers=auth_headers(user_c["token"]))
        bets = r.json()
        # pick a music bet (unlikely used in earlier tests)
        target = next(b for b in bets if b["category"] == "music" and b["user_choice"] is None
                      and b["total_pool"] == 0)
        bet_id = target["bet_id"]

        # user_c bets 200 on 'a' (winner)
        r1 = api.post(f"{BASE_URL}/api/bets/{bet_id}/place",
                      headers=auth_headers(user_c["token"]),
                      json={"option": "a", "stake": 200})
        assert r1.status_code == 200, r1.text

        # user_a bets 300 on 'b' (loser)
        # (user_a may or may not have placed on other bets, but this bet is new)
        me_a_before = api.get(f"{BASE_URL}/api/auth/me",
                              headers=auth_headers(user_a["token"])).json()
        # ensure a has enough coins; if not, skip
        if me_a_before["coins"] < 300:
            pytest.skip("user_a not enough coins")

        r2 = api.post(f"{BASE_URL}/api/bets/{bet_id}/place",
                      headers=auth_headers(user_a["token"]),
                      json={"option": "b", "stake": 300})
        assert r2.status_code == 200, r2.text

        me_c_before = api.get(f"{BASE_URL}/api/auth/me",
                              headers=auth_headers(user_c["token"])).json()

        # resolve with 'a' as winner
        rr = api.post(f"{BASE_URL}/api/bets/{bet_id}/resolve",
                      json={"winning_option": "a"})
        assert rr.status_code == 200, rr.text
        body = rr.json()
        assert body["winning_option"] == "a"
        assert body["winners"] == 1

        # user_c should have earned stake back (200) + share of losers pool (300)
        me_c_after = api.get(f"{BASE_URL}/api/auth/me",
                             headers=auth_headers(user_c["token"])).json()
        expected_payout = 200 + 300  # winner takes all losers since only 1 winner
        assert me_c_after["coins"] == me_c_before["coins"] + expected_payout, (
            f"coins_before={me_c_before['coins']} after={me_c_after['coins']}")

        # user_c my-bets?status=resolved shows won=true
        r = api.get(f"{BASE_URL}/api/my-bets?status=resolved",
                    headers=auth_headers(user_c["token"]))
        resolved = r.json()
        winning_row = next((x for x in resolved if x["bet_id"] == bet_id), None)
        assert winning_row is not None
        assert winning_row["won"] is True
        assert winning_row["payout"] == expected_payout

        # user_a resolved shows won=false payout=0
        r = api.get(f"{BASE_URL}/api/my-bets?status=resolved",
                    headers=auth_headers(user_a["token"]))
        resolved_a = r.json()
        losing_row = next((x for x in resolved_a if x["bet_id"] == bet_id), None)
        assert losing_row is not None
        assert losing_row["won"] is False
        assert losing_row["payout"] == 0


# ---------- leaderboard + friends ----------
class TestLeaderboardAndFriends:
    def test_global_leaderboard_sorted_and_has_me(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/leaderboard/global",
                    headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "me" in data
        rows = data["rows"]
        coins_seq = [r["coins"] for r in rows]
        assert coins_seq == sorted(coins_seq, reverse=True)
        assert data["me"]["user_id"] == user_a["user"]["user_id"]
        assert data["me"]["rank"] >= 1

    def test_add_friend_success(self, api, user_a, user_b):
        r = api.post(f"{BASE_URL}/api/friends/add",
                     headers=auth_headers(user_a["token"]),
                     json={"username": user_b["user"]["username"]})
        # 200 or 409 if already friends
        assert r.status_code in (200, 409), r.text

    def test_add_friend_unknown_returns_404(self, api, user_a):
        r = api.post(f"{BASE_URL}/api/friends/add",
                     headers=auth_headers(user_a["token"]),
                     json={"username": f"nobody_{uuid.uuid4().hex[:6]}"})
        assert r.status_code == 404

    def test_add_friend_self_returns_400(self, api, user_a):
        r = api.post(f"{BASE_URL}/api/friends/add",
                     headers=auth_headers(user_a["token"]),
                     json={"username": user_a["user"]["username"]})
        assert r.status_code == 400

    def test_friends_leaderboard_includes_me_and_friend(self, api, user_a, user_b):
        # ensure friendship
        api.post(f"{BASE_URL}/api/friends/add",
                 headers=auth_headers(user_a["token"]),
                 json={"username": user_b["user"]["username"]})
        r = api.get(f"{BASE_URL}/api/leaderboard/friends",
                    headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        ids = {row["user_id"] for row in r.json()["rows"]}
        assert user_a["user"]["user_id"] in ids
        assert user_b["user"]["user_id"] in ids


# ---------- push registration ----------
class TestPushRegistration:
    def test_register_push_accepts_even_when_provider_401(self, api, user_a):
        r = api.post(f"{BASE_URL}/api/register-push",
                     headers=auth_headers(user_a["token"]),
                     json={"platform": "ios", "device_token": "TEST_devicetoken_ABC"})
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "registered"


# ---------- serialization: ensure no MongoDB _id leaks ----------
class TestSerialization:
    def test_no_underscore_id_in_bets(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/bets", headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        for b in r.json():
            assert "_id" not in b

    def test_no_underscore_id_in_leaderboard(self, api, user_a):
        r = api.get(f"{BASE_URL}/api/leaderboard/global",
                    headers=auth_headers(user_a["token"]))
        for row in r.json()["rows"]:
            assert "_id" not in row
