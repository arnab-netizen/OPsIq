import { runSystem } from "../services/system/run";

console.log("=== BACKBONE SYSTEM TEST ===\n");

try {
  // Test case 1: Valid metrics with high risk
  console.log("Test 1: High risk scenario");
  const result1 = runSystem({
    risk: 8,
    revenueChange: 2000,
    costChange: 800,
    confidence: 0.85,
  });
  console.log("✓ Result:", JSON.stringify(result1, null, 2));
  console.log("");

  // Test case 2: Valid metrics with context only
  console.log("Test 2: Context available scenario");
  const result2 = runSystem({
    revenueChange: 1500,
    costChange: 600,
    confidence: 0.75,
  });
  console.log("✓ Result:", JSON.stringify(result2, null, 2));
  console.log("");

  // Test case 3: Fail-closed — low confidence
  console.log("Test 3: Low confidence (should fail)");
  try {
    runSystem({
      risk: 5,
      revenueChange: 1000,
      costChange: 500,
      confidence: 0.3,
    });
    console.log("✗ Should have thrown LOW_CONFIDENCE_BLOCKED");
  } catch (e) {
    console.log("✓ Correctly caught error:", (e as Error).message);
  }
  console.log("");

  // Test case 4: Fail-closed — zero impact
  console.log("Test 4: Zero impact (should fail)");
  try {
    runSystem({
      risk: 5,
      revenueChange: 0,
      costChange: 0,
      confidence: 0.8,
    });
    console.log("✗ Should have thrown NO_IMPACT");
  } catch (e) {
    console.log("✓ Correctly caught error:", (e as Error).message);
  }

  console.log("\n=== ALL TESTS PASSED ===");
} catch (error) {
  console.error("✗ Test failed:", error);
  throw error;
}
