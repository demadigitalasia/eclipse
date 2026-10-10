"""Uji kontrak + auth backend (P1 #8).

Jalankan dari root repo:  ./.venv/bin/python -m unittest discover -s backend/tests -v
Memakai DB SQLite sementara per run; tidak menyentuh data dev.
"""
import os
import tempfile
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
from http.cookies import SimpleCookie
import unittest
from unittest.mock import patch

_TMP = tempfile.mkdtemp(prefix="eclipse-test-")
os.environ["ECLIPSE_DATA_DIR"] = _TMP
os.environ["ECLIPSE_ALLOW_REGISTRATION"] = "true"
os.environ["ECLIPSE_COOKIE_SECURE"] = "false"
os.environ["ECLIPSE_RESET_CODE_LOGGING"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from backend import db  # noqa: E402
from backend.config import SETTINGS  # noqa: E402
from backend.routes import auth as auth_routes  # noqa: E402
from backend.main import app, _claim_user_quota  # noqa: E402
from backend.core.rate_limit import SlidingWindowLimiter  # noqa: E402


class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def test_health(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")

    def test_limits_match_b0(self):
        body = self.client.get("/api/limits").json()
        self.assertEqual(body["maxBatchClips"], 5)
        self.assertEqual(body["freeDailyAnalyze"], 3)
        self.assertEqual(body["freeDailyRender"], 1)
        self.assertEqual(body["liteDailyRender"], 15)
        self.assertEqual(body["liteMonthlyPriceIdr"], 150000)
        self.assertEqual(body["proDailyRender"], 25)
        self.assertEqual(body["proMonthlyPriceIdr"], 300000)
        self.assertEqual(body["metadataRetentionDays"], 90)
        self.assertEqual(body["mvpAspect"], "9:16")

    def test_cleanup_retensi_metadata(self):
        path = os.path.join(_TMP, "retention.sqlite")
        db.init_db(path)
        conn = db.get_conn(path)
        account = db.create_account(conn, "Retention", "retention@example.test", "hash", "user")
        job = db.create_job(conn, account["id"], "media", "upload", "source.mp4")
        db.log_audit(conn, account["email"], "test", "old")
        conn.execute("UPDATE jobs SET created_at = '2020-01-01T00:00:00Z' WHERE id = ?", (job["id"],))
        conn.execute("UPDATE audit SET created_at = '2020-01-01T00:00:00Z' WHERE actor = ?", (account["email"],))
        conn.commit()
        conn.close()
        removed = db.cleanup_old_metadata(path, 90)
        self.assertEqual(removed, {"jobs": 1, "audit": 1})
        conn = db.get_conn(path)
        self.assertIsNone(db.get_job(conn, job["id"]))
        self.assertEqual(db.list_audit(conn), [])
        conn.close()

    def test_legacy_stub_endpoints_removed(self):
        self.assertEqual(self.client.post("/api/analyze", json={}).status_code, 404)
        self.assertEqual(self.client.post("/api/render-batch", json={}).status_code, 404)

    def test_rate_limiter_window(self):
        rate_limiter = SlidingWindowLimiter()
        self.assertEqual(rate_limiter.allow("ip:/login", 2, 60, now=100), (True, 0))
        self.assertEqual(rate_limiter.allow("ip:/login", 2, 60, now=101), (True, 0))
        allowed, retry = rate_limiter.allow("ip:/login", 2, 60, now=102)
        self.assertFalse(allowed)
        self.assertGreater(retry, 0)
        self.assertEqual(rate_limiter.allow("ip:/login", 2, 60, now=161), (True, 0))


class AuthTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app, headers={"Origin": "http://localhost:5173"})
        cls.client.__enter__()
        admin = cls.client.post(
            "/api/auth/register",
            json={"name": "Admin", "email": "admin@uji.id", "password": "admin123"},
        )
        cls.admin_token = cls.cookie_token(admin)
        cls.admin_id = admin.json()["user"]["id"]
        conn = db.get_conn(SETTINGS.db_path)
        try:
            db.update_role_plan(conn, cls.admin_id, role="admin")
        finally:
            conn.close()
        user = cls.client.post(
            "/api/auth/register",
            json={"name": "User", "email": "user@uji.id", "password": "user1234"},
        )
        cls.user_token = cls.cookie_token(user)
        cls.user_id = user.json()["user"]["id"]

    @staticmethod
    def cookie_token(response):
        parsed = SimpleCookie()
        parsed.load(response.headers["set-cookie"])
        return parsed["eclipse_session"].value

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_bootstrap_admin_dan_user(self):
        login = self.client.post(
            "/api/auth/login", json={"email": "admin@uji.id", "password": "admin123"}
        )
        self.assertNotIn("token", login.json())
        parsed = SimpleCookie()
        parsed.load(login.headers["set-cookie"])
        self.assertTrue(parsed["eclipse_session"]["httponly"])
        self.assertFalse(parsed["eclipse_session"]["secure"])
        self.assertEqual(
            self.client.get("/api/auth/me", headers=self.auth(self.admin_token)).json()["user"]["role"],
            "admin",
        )
        self.assertEqual(
            self.client.get("/api/auth/me", headers=self.auth(self.user_token)).json()["user"]["role"],
            "user",
        )

    def test_production_registration_guard_and_secure_cookie(self):
        production_settings = replace(SETTINGS, allow_registration=False, cookie_secure=True)
        with patch.object(auth_routes, "SETTINGS", production_settings):
            blocked = self.client.post(
                "/api/auth/register",
                json={"name": "Blocked", "email": "blocked@example.test", "password": "password123"},
            )
            self.assertEqual(blocked.status_code, 403)
            login = self.client.post(
                "/api/auth/login", json={"email": "admin@uji.id", "password": "admin123"}
            )
            parsed = SimpleCookie()
            parsed.load(login.headers["set-cookie"])
            self.assertTrue(parsed["eclipse_session"]["secure"])

    def test_duplikat_dan_login_salah(self):
        dup = self.client.post(
            "/api/auth/register",
            json={"name": "X", "email": "user@uji.id", "password": "xxxxxx"},
        )
        self.assertEqual(dup.status_code, 400)
        bad = self.client.post(
            "/api/auth/login", json={"email": "user@uji.id", "password": "salah"}
        )
        self.assertEqual(bad.status_code, 400)

    def test_register_login_cookie_end_to_end(self):
        email = "cookie-flow@uji.id"
        origin = "http://localhost:5173"
        with TestClient(app) as client:
            registered = client.post(
                "/api/auth/register",
                headers={"Origin": origin},
                json={"name": "Cookie Flow", "email": email, "password": "cookie-pass-123"},
            )
            self.assertEqual(registered.status_code, 200)
            self.assertNotIn("token", registered.json())
            self.assertEqual(client.get("/api/auth/me").json()["user"]["email"], email)

            blocked_logout = client.post(
                "/api/auth/logout", headers={"Origin": "http://localhost:5174"}
            )
            self.assertEqual(blocked_logout.status_code, 403)

            logout = client.post("/api/auth/logout", headers={"Origin": origin})
            self.assertEqual(logout.status_code, 200)
            self.assertEqual(client.get("/api/auth/me").status_code, 401)

            login = client.post(
                "/api/auth/login",
                headers={"Origin": origin},
                json={"email": email, "password": "cookie-pass-123"},
            )
            self.assertEqual(login.status_code, 200)
            self.assertEqual(client.get("/api/auth/me").json()["user"]["email"], email)

    def test_me_memuat_kuota_b0(self):
        quota = self.client.get("/api/auth/me", headers=self.auth(self.user_token)).json()["quota"]
        self.assertEqual(quota["analyze"]["limit"], 3)
        self.assertEqual(quota["render"]["limit"], 1)
        self.assertEqual(quota["render"]["period"], "day")
        self.assertTrue(quota["analyze"]["allowed"])

    def test_kuota_free_satu_per_hari(self):
        conn = db.get_conn(SETTINGS.db_path)
        try:
            free_user = db.find_account_by_id(conn, self.user_id)
            self.assertEqual(
                _claim_user_quota(conn, free_user, "render", 1, "2099-01-01"), (True, 1)
            )
            self.assertEqual(
                _claim_user_quota(conn, free_user, "render", 1, "2099-01-01"), (False, 1)
            )
            self.assertEqual(
                _claim_user_quota(conn, free_user, "render", 1, "2099-01-02"), (True, 1)
            )
        finally:
            conn.close()

    def test_kuota_lite_dan_pro_per_bulan(self):
        conn = db.get_conn(SETTINGS.db_path)
        try:
            conn.execute("UPDATE accounts SET plan = 'lite' WHERE id = ?", (self.user_id,))
            conn.commit()
            lite_user = db.find_account_by_id(conn, self.user_id)
            for expected_used in range(1, 16):
                allowed, used = _claim_user_quota(conn, lite_user, "render", 1, "2099-01-05")
                self.assertTrue(allowed)
                self.assertEqual(used, expected_used)
            self.assertEqual(
                _claim_user_quota(conn, lite_user, "render", 1, "2099-01-06"), (False, 15)
            )

            conn.execute("UPDATE accounts SET plan = 'pro' WHERE id = ?", (self.user_id,))
            conn.commit()
            pro_user = db.find_account_by_id(conn, self.user_id)
            for expected_used in range(1, 26):
                allowed, used = _claim_user_quota(
                    conn, pro_user, "render", SETTINGS.free_daily_render, db.month_key()
                )
                self.assertTrue(allowed)
                self.assertEqual(used, expected_used)
            allowed, used = _claim_user_quota(
                conn, pro_user, "render", SETTINGS.free_daily_render, db.month_key()
            )
            self.assertFalse(allowed)
            self.assertEqual(used, 25)
            self.assertEqual(
                db.claim_monthly_render_quota(conn, self.user_id, 25, "2099-02"), (True, 1)
            )
            pro_quota = self.client.get(
                "/api/auth/me", headers=self.auth(self.user_token)
            ).json()["quota"]["render"]
            self.assertEqual(pro_quota["limit"], 25)
            self.assertEqual(pro_quota["period"], "month")
            self.assertEqual(pro_quota["used"], 25)
            conn.execute("UPDATE accounts SET plan = 'free' WHERE id = ?", (self.user_id,))
            conn.commit()
        finally:
            conn.close()

    def test_admin_dapat_menetapkan_paket(self):
        conn = db.get_conn(SETTINGS.db_path)
        try:
            response = self.client.patch(
                f"/api/admin/users/{self.user_id}",
                headers=self.auth(self.admin_token),
                json={"plan": "lite"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"]["plan"], "lite")
            response = self.client.patch(
                f"/api/admin/users/{self.user_id}",
                headers=self.auth(self.admin_token),
                json={"plan": "pro"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"]["plan"], "pro")
            conn.execute("UPDATE accounts SET plan = 'free' WHERE id = ?", (self.user_id,))
            conn.commit()
        finally:
            conn.close()

    def test_rbac_admin(self):
        self.assertEqual(
            self.client.get("/api/admin/users", headers=self.auth(self.user_token)).status_code, 403
        )
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/api/admin/users").status_code, 401)
        ok = self.client.get("/api/admin/users", headers=self.auth(self.admin_token))
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(len(ok.json()["users"]), 2)

    def test_proteksi_admin_terakhir(self):
        res = self.client.patch(
            f"/api/admin/users/{self.admin_id}",
            headers=self.auth(self.admin_token),
            json={"role": "user"},
        )
        self.assertEqual(res.status_code, 400)
        res = self.client.delete(
            f"/api/admin/users/{self.admin_id}", headers=self.auth(self.admin_token)
        )
        self.assertEqual(res.status_code, 400)

    def test_reset_sekali_pakai(self):
        req = self.client.post("/api/auth/reset-request", json={"email": "user@uji.id"})
        self.assertEqual(req.status_code, 200)
        self.assertNotIn("code", req.json())
        conn = db.get_conn(SETTINGS.db_path)
        try:
            _, code = db.create_reset_code(conn, self.user_id)
        finally:
            conn.close()
        bad = self.client.post(
            "/api/auth/reset-confirm",
            json={"email": "user@uji.id", "code": "000000", "password": "baru1234"},
        )
        self.assertEqual(bad.status_code, 400)
        good = self.client.post(
            "/api/auth/reset-confirm",
            json={"email": "user@uji.id", "code": code, "password": "baru1234"},
        )
        self.assertEqual(good.status_code, 200)
        reuse = self.client.post(
            "/api/auth/reset-confirm",
            json={"email": "user@uji.id", "code": code, "password": "lagi1234"},
        )
        self.assertEqual(reuse.status_code, 400)
        login = self.client.post(
            "/api/auth/login", json={"email": "user@uji.id", "password": "baru1234"}
        )
        self.assertEqual(login.status_code, 200)

    def test_kuota_tercatat(self):
        conn = db.get_conn(SETTINGS.db_path)
        try:
            allowed, used = db.check_quota(conn, self.user_id, "analyze", 3)
            self.assertTrue(allowed)
            db.record_usage(conn, self.user_id, "analyze")
            _, used2 = db.check_quota(conn, self.user_id, "analyze", 3)
            self.assertEqual(used2, used + 1)
        finally:
            conn.close()

    def test_quota_claim_is_atomic_under_concurrency(self):
        path = os.path.join(_TMP, "concurrent-quota.sqlite")
        db.init_db(path)
        conn = db.get_conn(path)
        account = db.create_account(
            conn, "Concurrent", "concurrent@example.test", db.hash_password("safe-password"), "user"
        )
        conn.close()

        def claim():
            worker_conn = db.get_conn(path)
            try:
                return db.claim_quota(worker_conn, account["id"], "analyze", 1)[0]
            finally:
                worker_conn.close()

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: claim(), range(8)))
        self.assertEqual(sum(results), 1)
        conn = db.get_conn(path)
        try:
            self.assertEqual(db.check_quota(conn, account["id"], "analyze", 1), (False, 1))
        finally:
            conn.close()

    def test_logout_mencabut_sesi(self):
        response = self.client.post(
            "/api/auth/login", json={"email": "admin@uji.id", "password": "admin123"}
        )
        token = self.cookie_token(response)
        self.assertEqual(
            self.client.post("/api/auth/logout", headers=self.auth(token)).status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/auth/me", headers=self.auth(token)).status_code, 401
        )


if __name__ == "__main__":
    unittest.main()
