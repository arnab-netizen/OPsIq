import http from "k6/http";
import { check, sleep, group } from "k6";
import { v4 as uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

// Configuration
export const options = {
  stages: [
    { duration: "30s", target: 10, name: "warm-up" },
    { duration: "1m", target: 10, name: "baseline" },
    { duration: "1m", target: 25, name: "ramp-up-1" },
    { duration: "1m", target: 50, name: "ramp-up-2" },
    { duration: "1m", target: 100, name: "peak-load" },
    { duration: "30s", target: 0, name: "cool-down" },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.05"],
  },
  // External environment for staging
  ext: {
    loadimpact: {
      projectID: 0,
      name: "OpsIQ Load Test",
    },
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const WORKSPACE_ID = __ENV.WORKSPACE_ID || "30000000-0000-0000-0000-000000000002";

// Global tracking
let authTokens = [];
let engagementIds = [];
let actionIds = [];
const metricsData = {
  loginLatencies: [],
  createEngagementLatencies: [],
  createActionLatencies: [],
  updateActionLatencies: [],
  idempotencyCollisions: 0,
};

// Helper: Generate deterministic session ID for user
function getUserEmail(userId) {
  const emails = [
    "test1@staging.local",
    "test2@staging.local",
    "test3@staging.local",
  ];
  return emails[userId % emails.length];
}

// Helper: Authenticate and get session token
function authenticate(userId) {
  return group("authenticate", () => {
    const startTime = new Date().getTime();

    const payload = JSON.stringify({
      email: getUserEmail(userId),
      password: "password123",
    });

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const latency = new Date().getTime() - startTime;
    metricsData.loginLatencies.push(latency);

    check(res, {
      "login status is 200 or 302": (r) =>
        r.status === 200 || r.status === 302,
      "login returns session": (r) => r.headers["Set-Cookie"] !== undefined,
    });

    return res.headers["Set-Cookie"]?.[0]?.split(";")?.[0];
  });
}

// Scenario 1: Auth Flood
export function authFlood() {
  group("auth_flood", () => {
    const token = authenticate(__VU);
    authTokens.push(token);
    sleep(0.5);
  });
}

// Scenario 2: Concurrent Engagement Creation
export function concurrentEngagementCreation() {
  group("concurrent_engagement_creation", () => {
    const token = authenticate(__VU);

    const payload = JSON.stringify({
      title: `Engagement ${__VU}-${__ITER}`,
      description: "Load test engagement",
      clientId: "50000000-0000-0000-0000-000000000001",
      engagementMode: "ADVISORY",
      interventionMode: "DIRECT",
      serviceTier: "CORE",
    });

    const startTime = new Date().getTime();

    const res = http.post(`${BASE_URL}/api/engagements`, payload, {
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": `eng-${__VU}-${__ITER}`,
        "x-workspace-id": WORKSPACE_ID,
        Cookie: token,
      },
    });

    const latency = new Date().getTime() - startTime;
    metricsData.createEngagementLatencies.push(latency);

    check(res, {
      "create engagement status is 201": (r) => r.status === 201,
      "engagement has id": (r) => r.json("id") !== undefined,
    });

    const engagementId = res.json("id");
    if (engagementId) {
      engagementIds.push(engagementId);
    }

    sleep(0.1);
  });
}

// Scenario 3: Concurrent Action Updates
export function concurrentActionUpdates() {
  group("concurrent_action_updates", () => {
    const token = authenticate(__VU);

    if (engagementIds.length === 0) {
      return; // Skip if no engagements
    }

    const engagementId =
      engagementIds[Math.floor(Math.random() * engagementIds.length)];

    const payload = JSON.stringify({
      status: "IN_PROGRESS",
      title: `Action ${__VU}`,
    });

    const startTime = new Date().getTime();

    const res = http.patch(
      `${BASE_URL}/api/actions/${actionIds[0] || "dummy"}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": `action-${__VU}-${__ITER}`,
          "x-workspace-id": WORKSPACE_ID,
          Cookie: token,
        },
      }
    );

    const latency = new Date().getTime() - startTime;
    metricsData.updateActionLatencies.push(latency);

    sleep(0.1);
  });
}

// Scenario 4: Idempotency Key Pressure (Duplicates)
export function idempotencyKeyPressure() {
  group("idempotency_key_pressure", () => {
    const token = authenticate(__VU);

    // Use SAME idempotency key for group of requests
    const sharedKey = `dup-test-${Math.floor(__ITER / 5)}`;

    const payload = JSON.stringify({
      title: `Duplicate Test Engagement`,
      description: "Testing idempotency",
      clientId: "50000000-0000-0000-0000-000000000001",
      engagementMode: "ADVISORY",
      interventionMode: "DIRECT",
      serviceTier: "CORE",
    });

    const res = http.post(`${BASE_URL}/api/engagements`, payload, {
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": sharedKey,
        "x-workspace-id": WORKSPACE_ID,
        Cookie: token,
      },
    });

    // Track if we got a collision (cached response)
    if (res.status === 201) {
      const responseBody = res.json();
      if (responseBody.cached === true) {
        metricsData.idempotencyCollisions++;
      }
    }

    check(res, {
      "idempotency request succeeded": (r) =>
        r.status === 201 || r.status === 200,
    });

    sleep(0.1);
  });
}

// Scenario 5: Readiness Endpoint Pressure
export function readinessEndpointPressure() {
  group("readiness_endpoint_pressure", () => {
    const res = http.get(`${BASE_URL}/api/ops/readiness`, {
      headers: {
        "x-workspace-id": WORKSPACE_ID,
      },
    });

    check(res, {
      "readiness endpoint returns 200": (r) => r.status === 200,
      "readiness status present": (r) => r.json("current.status") !== undefined,
    });

    sleep(0.05);
  });
}

// Scenario 6: Metrics Endpoint Pressure
export function metricsEndpointPressure() {
  group("metrics_endpoint_pressure", () => {
    const res = http.get(`${BASE_URL}/api/ops/metrics`, {
      headers: {
        "x-workspace-id": WORKSPACE_ID,
      },
    });

    check(res, {
      "metrics endpoint returns 200": (r) => r.status === 200,
      "metrics data present": (r) => r.json("gauges") !== undefined,
    });

    sleep(0.05);
  });
}

// Default export cycles through all scenarios
export default function () {
  const scenario = __VU % 6;

  switch (scenario) {
    case 0:
      authFlood();
      break;
    case 1:
      concurrentEngagementCreation();
      break;
    case 2:
      concurrentActionUpdates();
      break;
    case 3:
      idempotencyKeyPressure();
      break;
    case 4:
      readinessEndpointPressure();
      break;
    case 5:
      metricsEndpointPressure();
      break;
  }
}

// Custom summary function
export function handleSummary(data) {
  console.log("=== LOAD TEST SUMMARY ===");
  console.log(
    `Login Latencies: avg=${Math.round(metricsData.loginLatencies.reduce((a, b) => a + b, 0) / metricsData.loginLatencies.length)}ms`
  );
  console.log(
    `Create Engagement Latencies: avg=${Math.round(metricsData.createEngagementLatencies.reduce((a, b) => a + b, 0) / metricsData.createEngagementLatencies.length)}ms`
  );
  console.log(`Idempotency Collisions: ${metricsData.idempotencyCollisions}`);

  return {
    "summary.json": JSON.stringify(data, null, 2),
  };
}
