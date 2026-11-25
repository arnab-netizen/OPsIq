import http.server
import io
import json
import os
import subprocess
import sys
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gsc_probe as P  # noqa: E402

TOKEN = "ya29.SECRET-TOKEN-VALUE-123"
SECRET_Q = "SECRET-QUERY-STRING"
OTHER = "sc-domain:unrelated-private.example"


def sites(level="siteRestrictedUser", target=True, other=True):
    e = []
    if other:
        e.append({"siteUrl": OTHER, "permissionLevel": "siteOwner"})
    if target:
        e.append({"siteUrl": P.TARGET, "permissionLevel": level})
    return {"siteEntry": e}


ROWS = {"rows": [{"keys": [SECRET_Q], "clicks": 7, "impressions": 99, "ctr": 0.07, "position": 4.2}]}


DEFAULT = object()


def fake(sites_resp=DEFAULT, qa=("OK", 200, ROWS), insp=("OK", 200, {"inspectionResult": {"x": 1}})):
    sites_resp = ("OK", 200, sites()) if sites_resp is DEFAULT else sites_resp

    def f(method, url, token, body=None):
        assert token == TOKEN
        if url.endswith("/sites"):
            return sites_resp
        if "searchAnalytics" in url:
            return qa
        return insp
    return f


def run(f, token=TOKEN):
    lines = []
    code = P.run(token, fetch=f, out=lines.append)
    return code, lines


class UnitTests(unittest.TestCase):
    def test_success_with_rows(self):
        code, l = run(fake())
        self.assertEqual(code, 0)
        for t in ("WIF_AUTHENTICATION=PASS", "TARGET_PROPERTY_FOUND=YES", "PROPERTY_READ_PERMISSION=VERIFIED", "SEARCH_ANALYTICS_HTTP_STATUS=200",
                  "SEARCH_ANALYTICS_SCHEMA=PASS", "SEARCH_ANALYTICS_RESULT=ROWS_PRESENT", "SEARCH_ANALYTICS_ACCESS=PASS", "OPTIONAL_URL_INSPECTION=PASS"):
            self.assertIn(t, l)

    def test_zero_rows_is_valid_success_not_failure(self):
        code, l = run(fake(qa=("OK", 200, {})))
        self.assertEqual(code, 0)
        self.assertIn("SEARCH_ANALYTICS_RESULT=EMPTY_VALID_NO_ROWS", l)
        code, l = run(fake(qa=("OK", 200, {"rows": []})))
        self.assertEqual((code, "SEARCH_ANALYTICS_ACCESS=PASS" in l), (0, True))

    def test_missing_configuration(self):
        self.assertEqual(run(fake(), token="")[0], 10)
        self.assertEqual(run(fake(), token=None)[0], 10)

    def test_missing_target_property(self):
        code, l = run(fake(sites_resp=("OK", 200, sites(target=False))))
        self.assertEqual(code, 12); self.assertIn("TARGET_PROPERTY_FOUND=NO", l)
        code, l = run(fake(sites_resp=("OK", 200, {})))  # no siteEntry at all: valid but target absent
        self.assertEqual(code, 12)

    def test_insufficient_permission(self):
        for lvl in ("siteUnverifiedUser", None, "other"):
            code, l = run(fake(sites_resp=("OK", 200, sites(level=lvl))))
            self.assertEqual(code, 13); self.assertIn("PROPERTY_READ_PERMISSION=INSUFFICIENT", l)

    def test_restricted_user_is_sufficient(self):
        self.assertEqual(run(fake(sites_resp=("OK", 200, sites("siteRestrictedUser"))))[0], 0)

    def test_http_errors_distinct_on_sites_and_query(self):
        cases = {("HTTP", 401, None): "HTTP_401_UNAUTHENTICATED", ("HTTP", 429, None): "HTTP_429_RATE_LIMITED", ("HTTP", 500, None): "HTTP_5XX_SERVER_ERROR",
                 ("HTTP", 503, None): "HTTP_5XX_SERVER_ERROR", ("TIMEOUT", 0, None): "TIMEOUT", ("NETWORK", 0, None): "NETWORK_ERROR",
                 ("OK", 200, None): "MALFORMED_SCHEMA", ("MALFORMED", 200, None): "MALFORMED_JSON"}
        for resp, token_name in cases.items():
            code, l = run(fake(sites_resp=resp))
            self.assertNotEqual(code, 0, resp)
            self.assertTrue(any(token_name in x for x in l), (resp, l))
            code, l = run(fake(qa=resp))
            self.assertNotEqual(code, 0, resp)

    def test_403_reasons_distinguished(self):
        def b(**k): return {"error": k}
        cases = [(b(status="PERMISSION_DENIED"), "HTTP_403_PERMISSION_DENIED"), (b(errors=[{"reason": "forbidden"}]), "HTTP_403_PERMISSION_DENIED"),
                 (b(details=[{"reason": "SERVICE_DISABLED"}]), "HTTP_403_API_DISABLED"), (b(errors=[{"reason": "accessNotConfigured"}]), "HTTP_403_API_DISABLED"),
                 (b(details=[{"reason": "ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]), "HTTP_403_SCOPE_INSUFFICIENT"), (b(status="SOMETHING_ELSE"), "HTTP_403_OTHER"), (None, "HTTP_403_OTHER")]
        for body, want in cases:
            code, l = run(fake(sites_resp=("HTTP", 403, body)))
            self.assertEqual(code, 11); self.assertIn("SITES_LIST=" + want, l)
            code, l = run(fake(qa=("HTTP", 403, body)))
            self.assertEqual(code, 14); self.assertIn("SEARCH_ANALYTICS_ACCESS=FAIL_" + want, l)

    def test_malformed_query_schema(self):
        for bad in ({"rows": "x"}, {"rows": [{"clicks": "7"}]}, {"rows": [1]}, []):
            code, l = run(fake(qa=("OK", 200, bad)))
            self.assertEqual(code, 15); self.assertIn("SEARCH_ANALYTICS_SCHEMA=FAIL", l)

    def test_optional_inspection_failure_does_not_mask_analytics(self):
        for insp in (("HTTP", 403, {"error": {"status": "PERMISSION_DENIED"}}), ("TIMEOUT", 0, None), ("OK", 200, {"x": 1})):
            code, l = run(fake(insp=insp))
            self.assertEqual(code, 0); self.assertIn("SEARCH_ANALYTICS_ACCESS=PASS", l)
            self.assertTrue(any(x.startswith("OPTIONAL_URL_INSPECTION=") and x != "OPTIONAL_URL_INSPECTION=PASS" for x in l))

    def test_no_raw_data_or_token_or_other_property_ever_printed(self):
        scenarios = [fake(), fake(qa=("HTTP", 403, {"error": {"message": TOKEN + " " + SECRET_Q + " " + OTHER}})),
                     fake(sites_resp=("OK", 200, sites(target=False))), fake(sites_resp=("OK", 200, sites(level="siteUnverifiedUser")))]
        for f in scenarios:
            _, l = run(f)
            blob = "\n".join(l)
            for s in (TOKEN, SECRET_Q, OTHER, "siteOwner", "impressions", "clicks", "inspectionResult"):
                self.assertNotIn(s, blob)
        # only fixed tokens (KEY=VALUE with a bounded value alphabet)
        for line in run(fake())[1]:
            self.assertRegex(line, r"^[A-Z_]+=[A-Za-z0-9_]+$")

    def test_redact_strips_token(self):
        self.assertNotIn(TOKEN, P.redact("x " + TOKEN + " y", TOKEN))
        self.assertEqual(P.redact("a Bearer " + TOKEN, TOKEN), "a Bearer [REDACTED]")

    def test_window_ends_three_days_before_today(self):
        import datetime
        s, e = P.window(datetime.date(2026, 11, 25))
        self.assertEqual((s, e), ("2026-10-25", "2026-11-22"))


class Handler(http.server.BaseHTTPRequestHandler):
    plan = {}

    def _send(self, key):
        status, body = Handler.plan[key]
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(body if isinstance(body, bytes) else json.dumps(body).encode())

    def do_GET(self): self._send("sites")
    def do_POST(self): self._send("inspect" if self.path.endswith("/inspect") else "qa")
    def log_message(self, *a): pass


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()

    def go(self, plan, token=TOKEN, test_mode=True):
        Handler.plan = plan
        env = dict(os.environ, GSC_ACCESS_TOKEN=token, GSC_PROBE_TEST="1" if test_mode else "0",
                   GSC_PROBE_TEST_BASE="http://127.0.0.1:%d" % self.srv.server_port)
        env.pop("GITHUB_STEP_SUMMARY", None)
        p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "gsc_probe.py")], env=env, capture_output=True, text=True, timeout=60)
        return p

    def test_exit_zero_only_when_all_mandatory_pass(self):
        p = self.go({"sites": (200, sites()), "qa": (200, ROWS), "inspect": (200, {"inspectionResult": {}})})
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn("PROBE_EXIT_CODE=0", p.stdout)
        self.assertNotIn(TOKEN, p.stdout + p.stderr); self.assertNotIn(SECRET_Q, p.stdout + p.stderr)

    def test_mandatory_failures_exit_nonzero(self):
        for name, plan, code in [("sites500", {"sites": (500, b"oops"), "qa": (200, ROWS), "inspect": (200, {})}, 11),
                                 ("sites403", {"sites": (403, {"error": {"status": "PERMISSION_DENIED"}}), "qa": (200, ROWS), "inspect": (200, {})}, 11),
                                 ("qa429", {"sites": (200, sites()), "qa": (429, {}), "inspect": (200, {})}, 14),
                                 ("qa500", {"sites": (200, sites()), "qa": (500, b"x"), "inspect": (200, {})}, 14),
                                 ("malformed", {"sites": (200, b"not json"), "qa": (200, ROWS), "inspect": (200, {})}, 11),
                                 ("noprop", {"sites": (200, sites(target=False)), "qa": (200, ROWS), "inspect": (200, {})}, 12),
                                 ("noperm", {"sites": (200, sites(level="siteUnverifiedUser")), "qa": (200, ROWS), "inspect": (200, {})}, 13)]:
            p = self.go(plan)
            self.assertEqual(p.returncode, code, (name, p.stdout))
            self.assertNotIn(TOKEN, p.stdout + p.stderr)
            self.assertIn("PROBE_EXIT_CODE=%d" % code, p.stdout)

    def test_missing_token_exits_nonzero(self):
        p = self.go({"sites": (200, sites())}, token="")
        self.assertEqual(p.returncode, 10)

    def test_inspection_failure_still_exit_zero(self):
        p = self.go({"sites": (200, sites()), "qa": (200, {}), "inspect": (403, {"error": {"status": "PERMISSION_DENIED"}})})
        self.assertEqual(p.returncode, 0); self.assertIn("SEARCH_ANALYTICS_RESULT=EMPTY_VALID_NO_ROWS", p.stdout)

    def test_test_base_ignored_without_test_flag(self):
        # With GSC_PROBE_TEST unset the loopback override must not be honoured: the real Google API is used,
        # so the fake plan cannot make this pass. Network may be blocked here: any non-success is fine.
        p = self.go({"sites": (200, sites()), "qa": (200, ROWS), "inspect": (200, {})}, test_mode=False)
        self.assertNotIn("SEARCH_ANALYTICS_ACCESS=PASS", p.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=1)
