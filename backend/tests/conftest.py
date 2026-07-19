"""Shared fixtures for PopBet backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = "https://pop-wager.preview.emergentagent.com"


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup_or_login(api, email, password, username):
    r = api.post(f"{BASE_URL}/api/auth/signup",
                 json={"email": email, "password": password, "username": username})
    if r.status_code == 201:
        return r.json()
    # already exists -> login
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def user_a(api):
    # unique per test run to guarantee isolation for placements
    uid = uuid.uuid4().hex[:6]
    return _signup_or_login(api,
                            email=f"TEST_a_{uid}@popbet.com",
                            password="secret123",
                            username=f"TESTa{uid}")


@pytest.fixture(scope="session")
def user_b(api):
    uid = uuid.uuid4().hex[:6]
    return _signup_or_login(api,
                            email=f"TEST_b_{uid}@popbet.com",
                            password="secret123",
                            username=f"TESTb{uid}")


@pytest.fixture(scope="session")
def user_c(api):
    uid = uuid.uuid4().hex[:6]
    return _signup_or_login(api,
                            email=f"TEST_c_{uid}@popbet.com",
                            password="secret123",
                            username=f"TESTc{uid}")


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
