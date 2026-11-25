#!/usr/bin/env python3
"""Fail-closed, sanitized Search Console read-only capability probe.

Prints ONLY fixed status tokens. It never prints the access token, raw API bodies, other
properties, queries, pages, metric values or URL-inspection details (this repository is public).
Exit codes (mandatory checks): 0 pass | 10 config | 11 sites.list failure | 12 target property
absent | 13 insufficient permission | 14 search analytics failure | 15 malformed response.
Optional URL inspection is graded separately and never changes the exit status.
"""
import datetime
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request

TARGET = "sc-domain:opsiq.solutions"
BASE = "https://www.googleapis.com/webmasters/v3"
INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
READ_LEVELS = ("siteRestrictedUser", "siteFullUser", "siteOwner")
TIMEOUT_S = 30


def _test_base():
    """Local-test override, honoured only for a loopback host when GSC_PROBE_TEST=1."""
    b = os.environ.get("GSC_PROBE_TEST_BASE", "")
    if os.environ.get("GSC_PROBE_TEST") == "1" and b.startswith("http://127.0.0.1:"):
        return b
    return None


def http(method, url, token, body=None):
    """Returns (kind, status, parsed_json_or_None). kind: OK | HTTP | TIMEOUT | NETWORK | MALFORMED."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
        try:
            return "HTTP", status, json.loads(raw.decode("utf-8", "replace"))
        except Exception:
            return "HTTP", status, None
    except (socket.timeout, TimeoutError):
        return "TIMEOUT", 0, None
    except urllib.error.URLError as e:
        return ("TIMEOUT", 0, None) if isinstance(e.reason, (socket.timeout, TimeoutError)) else ("NETWORK", 0, None)
    except Exception:
        return "NETWORK", 0, None
    try:
        return "OK", status, json.loads(raw.decode("utf-8"))
    except Exception:
        return "MALFORMED", status, None


def classify_error(kind, status, body):
    """Distinct, whitelisted outcome tokens. Raw Google error text is never returned."""
    if kind == "TIMEOUT":
        return "TIMEOUT"
    if kind == "NETWORK":
        return "NETWORK_ERROR"
    if kind == "MALFORMED":
        return "MALFORMED_JSON"
    if status == 401:
        return "HTTP_401_UNAUTHENTICATED"
    if status == 429:
        return "HTTP_429_RATE_LIMITED"
    if 500 <= status <= 599:
        return "HTTP_5XX_SERVER_ERROR"
    if status == 403:
        reasons = set()
        err = body.get("error") if isinstance(body, dict) else None
        if isinstance(err, dict):
            if isinstance(err.get("status"), str):
                reasons.add(err["status"])
            for e in err.get("errors", []) if isinstance(err.get("errors"), list) else []:
                if isinstance(e, dict) and isinstance(e.get("reason"), str):
                    reasons.add(e["reason"])
            for d in err.get("details", []) if isinstance(err.get("details"), list) else []:
                if isinstance(d, dict) and isinstance(d.get("reason"), str):
                    reasons.add(d["reason"])
        if reasons & {"SERVICE_DISABLED", "accessNotConfigured"}:
            return "HTTP_403_API_DISABLED"
        if reasons & {"ACCESS_TOKEN_SCOPE_INSUFFICIENT", "insufficientPermissions"} and "forbidden" not in reasons:
            return "HTTP_403_SCOPE_INSUFFICIENT"
        if reasons & {"PERMISSION_DENIED", "forbidden", "insufficientPermissions"}:
            return "HTTP_403_PERMISSION_DENIED"
        return "HTTP_403_OTHER"
    return "HTTP_%d_OTHER" % status


def window(today=None):
    t = today or datetime.datetime.now(datetime.timezone.utc).date()
    return (t - datetime.timedelta(days=31)).isoformat(), (t - datetime.timedelta(days=3)).isoformat()


def run(token, fetch=http, out=print, today=None):
    """Returns the exit status. `out` receives only fixed tokens."""
    if not token or not isinstance(token, str):
        out("WIF_AUTHENTICATION=FAIL_NO_TOKEN")
        return 10
    out("WIF_AUTHENTICATION=PASS")
    base = _test_base() or BASE
    kind, status, body = fetch("GET", base + "/sites", token)
    if kind != "OK" or status != 200:
        out("SITES_LIST=" + classify_error(kind, status, body))
        return 11
    entries = body.get("siteEntry", []) if isinstance(body, dict) else None
    if not isinstance(body, dict) or not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        out("SITES_LIST=MALFORMED_SCHEMA")
        return 15
    out("SITES_LIST=PASS")
    mine = [e for e in entries if e.get("siteUrl") == TARGET]
    if not mine:
        out("TARGET_PROPERTY_FOUND=NO")
        return 12
    out("TARGET_PROPERTY_FOUND=YES")
    level = mine[0].get("permissionLevel")
    if level not in READ_LEVELS:
        out("PROPERTY_READ_PERMISSION=INSUFFICIENT")
        return 13
    out("PROPERTY_READ_PERMISSION=VERIFIED")
    start, end = window(today)
    kind, status, body = fetch("POST", base + "/sites/sc-domain%3Aopsiq.solutions/searchAnalytics/query", token,
                               {"startDate": start, "endDate": end})
    out("SEARCH_ANALYTICS_HTTP_STATUS=%s" % (status if kind in ("OK", "HTTP") else classify_error(kind, status, body)))
    if kind != "OK" or status != 200:
        out("SEARCH_ANALYTICS_ACCESS=FAIL_" + classify_error(kind, status, body))
        return 14
    rows = body.get("rows", []) if isinstance(body, dict) else None
    ok = isinstance(body, dict) and isinstance(rows, list) and all(
        isinstance(r, dict) and all(isinstance(r.get(k), (int, float)) for k in ("clicks", "impressions", "ctr", "position")) for r in rows)
    if not ok:
        out("SEARCH_ANALYTICS_SCHEMA=FAIL")
        return 15
    out("SEARCH_ANALYTICS_SCHEMA=PASS")
    out("SEARCH_ANALYTICS_RESULT=" + ("ROWS_PRESENT" if rows else "EMPTY_VALID_NO_ROWS"))
    out("SEARCH_ANALYTICS_ACCESS=PASS")
    # Optional, independently graded; never affects the exit status and never prints details.
    ikind, istatus, ibody = fetch("POST", _test_base() and (_test_base() + "/inspect") or INSPECT, token,
                                  {"inspectionUrl": "https://opsiq.solutions/", "siteUrl": TARGET})
    if ikind == "OK" and istatus == 200 and isinstance(ibody, dict) and isinstance(ibody.get("inspectionResult"), dict):
        out("OPTIONAL_URL_INSPECTION=PASS")
    else:
        out("OPTIONAL_URL_INSPECTION=" + ("MALFORMED_SCHEMA" if ikind == "OK" else "FAIL_" + classify_error(ikind, istatus, ibody)))
    return 0


def redact(s, token):
    """Defence in depth: the token is never emitted, but strip it (and any bearer text) if it ever were."""
    if token:
        s = s.replace(token, "[REDACTED]")
    return re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", s)


def main():
    token = os.environ.get("GSC_ACCESS_TOKEN", "")
    lines = []

    def out(s):
        s = redact(s, token)
        lines.append(s)
        print(s, flush=True)

    code = run(token, out=out)
    out("PROBE_EXIT_CODE=%d" % code)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write("\n".join(["### Search Console read-only probe (sanitized)"] + ["- `%s`" % l for l in lines]) + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
