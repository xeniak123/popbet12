"""PopBet iter4 backend tests: password reset (forgot/reset), change-password,
edit profile (PATCH /api/profile), delete account (DELETE /api/account).

Uses conftest.py::api (session) and creates disposable users per-test to avoid
polluting the shared streaker1/tester1 accounts (per review request)."""
import uuid
import time
import pytest

from conftest import auth_headers  # type: ignore

BASE = "https://pop-wager.preview.emergentagent.com"


# ---------- helpers ----------
def _new_user(api, prefix="TEST_iter4"):
    uid = uuid.uuid4().hex[:8]
    email = f"{prefix}_{uid}@popbet.dev"
    username = f"iter4_{uid}"
    password = "secret123"
    r = api.post(f"{BASE}/api/auth/signup",
                 json={"email": email, "password": password, "username": username})
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    body["email"] = email
    body["password"] = password
    body["username"] = username
    return body


# ---------- password reset flow ----------
class TestPasswordReset:
    def test_forgot_password_existing_email_returns_token(self, api):
        u = _new_user(api, "TEST_fp_ex")
        r = api.post(f"{BASE}/api/auth/forgot-password", json={"email": u["email"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("delivery") == "in_app"
        assert isinstance(body.get("token"), str) and len(body["token"]) > 20
        assert body.get("expires_in_minutes") == 60

    def test_forgot_password_unknown_email_no_info_leak(self, api):
        r = api.post(f"{BASE}/api/auth/forgot-password",
                     json={"email": f"nonexistent_{uuid.uuid4().hex[:6]}@popbet.dev"})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body.get("token") is None

    def test_reset_password_success_returns_jwt_and_logs_in(self, api):
        u = _new_user(api, "TEST_rp_ok")
        tok = api.post(f"{BASE}/api/auth/forgot-password",
                       json={"email": u["email"]}).json()["token"]
        new_pw = "newSecret!42"
        r = api.post(f"{BASE}/api/auth/reset-password",
                     json={"token": tok, "new_password": new_pw})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "user" in body
        assert body["user"]["email"].lower() == u["email"].lower()
        # login with new password works
        r2 = api.post(f"{BASE}/api/auth/login",
                      json={"email": u["email"], "password": new_pw})
        assert r2.status_code == 200
        # old password rejected
        r3 = api.post(f"{BASE}/api/auth/login",
                      json={"email": u["email"], "password": u["password"]})
        assert r3.status_code == 401

    def test_reset_password_token_cannot_be_reused(self, api):
        u = _new_user(api, "TEST_rp_reuse")
        tok = api.post(f"{BASE}/api/auth/forgot-password",
                       json={"email": u["email"]}).json()["token"]
        r1 = api.post(f"{BASE}/api/auth/reset-password",
                      json={"token": tok, "new_password": "firstReset!1"})
        assert r1.status_code == 200
        r2 = api.post(f"{BASE}/api/auth/reset-password",
                      json={"token": tok, "new_password": "secondReset!2"})
        assert r2.status_code == 400, r2.text

    def test_reset_password_invalid_token(self, api):
        r = api.post(f"{BASE}/api/auth/reset-password",
                     json={"token": "not-a-real-token-" + uuid.uuid4().hex,
                           "new_password": "whatever!1"})
        assert r.status_code == 400


# ---------- change password ----------
class TestChangePassword:
    def test_change_password_success(self, api):
        u = _new_user(api, "TEST_cp_ok")
        h = auth_headers(u["token"])
        new_pw = "changedPw!99"
        r = api.post(f"{BASE}/api/auth/change-password", headers=h,
                     json={"current_password": u["password"], "new_password": new_pw})
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        # verify by login
        r2 = api.post(f"{BASE}/api/auth/login",
                      json={"email": u["email"], "password": new_pw})
        assert r2.status_code == 200

    def test_change_password_wrong_current(self, api):
        u = _new_user(api, "TEST_cp_wrong")
        r = api.post(f"{BASE}/api/auth/change-password",
                     headers=auth_headers(u["token"]),
                     json={"current_password": "wrongCurrent!", "new_password": "whatever!1"})
        assert r.status_code == 401

    def test_change_password_same_as_current(self, api):
        u = _new_user(api, "TEST_cp_same")
        r = api.post(f"{BASE}/api/auth/change-password",
                     headers=auth_headers(u["token"]),
                     json={"current_password": u["password"], "new_password": u["password"]})
        assert r.status_code == 400


# ---------- PATCH /api/profile ----------
class TestUpdateProfile:
    def test_update_username(self, api):
        u = _new_user(api, "TEST_up_name")
        new_name = f"renamed_{uuid.uuid4().hex[:6]}"
        r = api.patch(f"{BASE}/api/profile", headers=auth_headers(u["token"]),
                      json={"username": new_name})
        assert r.status_code == 200, r.text
        assert r.json()["username"] == new_name

    def test_update_username_conflict_409(self, api):
        a = _new_user(api, "TEST_up_a")
        b = _new_user(api, "TEST_up_b")
        r = api.patch(f"{BASE}/api/profile", headers=auth_headers(b["token"]),
                      json={"username": a["username"]})
        assert r.status_code == 409, r.text

    def test_update_avatar_base64_stored_as_data_uri(self, api):
        u = _new_user(api, "TEST_up_av")
        # 1x1 red pixel jpeg (bare base64, no data-uri prefix)
        raw_b64 = (
            "/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBxdWFsaXR5ID0gOTAK/"
            "9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/"
            "9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/"
            "8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A/f6iiigD//Z"
        )
        r = api.patch(f"{BASE}/api/profile", headers=auth_headers(u["token"]),
                      json={"avatar_base64": raw_b64})
        assert r.status_code == 200, r.text
        av = r.json().get("avatar") or ""
        assert av.startswith("data:image/"), f"avatar not stored as data-URI: {av[:40]}"

    def test_update_phone_updates_normalized(self, api):
        u = _new_user(api, "TEST_up_ph")
        r = api.patch(f"{BASE}/api/profile", headers=auth_headers(u["token"]),
                      json={"phone": "+48 500 111 222"})
        assert r.status_code == 200
        assert r.json()["phone"] == "+48 500 111 222"
        # Verify phone_normalized by having a *different* user search for it
        # (find-by-phones excludes the caller's own user_id).
        searcher = _new_user(api, "TEST_up_ph_searcher")
        r2 = api.post(f"{BASE}/api/friends/find-by-phones",
                      headers=auth_headers(searcher["token"]),
                      json={"phones": ["48500111222"]})
        assert r2.status_code == 200, r2.text
        matches = r2.json().get("matches", [])
        found_ids = [m.get("user_id") for m in matches]
        assert u["user"]["user_id"] in found_ids, f"user not found in matches: {matches}"


# ---------- delete account ----------
class TestDeleteAccount:
    def test_delete_account_success(self, api):
        u = _new_user(api, "TEST_del_ok")
        h = auth_headers(u["token"])
        r = api.request("DELETE", f"{BASE}/api/account", headers=h,
                        json={"password": u["password"]})
        assert r.status_code == 200, r.text
        # subsequent /me returns 401
        r2 = api.get(f"{BASE}/api/auth/me", headers=h)
        assert r2.status_code == 401, r2.text
        # login should also fail
        r3 = api.post(f"{BASE}/api/auth/login",
                      json={"email": u["email"], "password": u["password"]})
        assert r3.status_code == 401

    def test_delete_account_wrong_password(self, api):
        u = _new_user(api, "TEST_del_bad")
        h = auth_headers(u["token"])
        r = api.request("DELETE", f"{BASE}/api/account", headers=h,
                        json={"password": "not-my-password"})
        assert r.status_code == 401
        # /me still works (user not deleted)
        r2 = api.get(f"{BASE}/api/auth/me", headers=h)
        assert r2.status_code == 200
