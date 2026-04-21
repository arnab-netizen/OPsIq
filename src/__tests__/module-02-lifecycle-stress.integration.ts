import { db } from "@/lib/db";
import { createClient } from "@/services/client-account";
import { createContact, updateContact } from "@/services/client-contact";
import { createLead, updateLead, linkLeadToEngagement } from "@/services/lead";
import { createEngagement } from "@/services/engagement";
import { ValidationError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const ACTOR_ID = "stress-test-actor";

async function runStressTests() {
  console.log("=== Module 02 Stress Tests ===\n");

  // TEST 1: IDEMPOTENCY FAILURE TEST
  console.log("TEST 1: Idempotency - Repeat createLead 3 times with same input\n");
  const leadInput = {
    companyName: "Stress Test Corp",
    contactName: "Jane Doe",
    contactEmail: "jane@stresstest.com",
    source: "referral",
  };

  const lead1 = await createLead(leadInput, ACTOR_ID);
  const lead2 = await createLead(leadInput, ACTOR_ID);
  const lead3 = await createLead(leadInput, ACTOR_ID);

  if (lead1.id === lead2.id && lead2.id === lead3.id) {
    console.log("✓ PASS: Same ID returned on retry (idempotency key deduplication)\n");
  } else {
    console.log("✗ FAIL: Different IDs generated - duplicates created");
    console.log(`  Lead1: ${lead1.id}\n  Lead2: ${lead2.id}\n  Lead3: ${lead3.id}\n`);
  }

  // Verify only 1 record exists in database
  const leadCount = await db.leadRecord.count({
    where: { companyName: "Stress Test Corp" },
  });
  if (leadCount === 1) {
    console.log("✓ PASS: Only 1 record in database (no duplicates)\n");
  } else {
    console.log(`✗ FAIL: ${leadCount} records found (duplicates created)\n`);
  }

  // TEST 2: RETRY SCENARIO - updateLead
  console.log("TEST 2: Retry Scenario - updateLead called 5 times with same data\n");
  const updateData = { status: "qualifying" };
  for (let i = 1; i <= 5; i++) {
    await updateLead(lead1.id, updateData, ACTOR_ID);
    console.log(`  Retry ${i}: updateLead called`);
  }

  const finalLead = await db.leadRecord.findUnique({ where: { id: lead1.id } });
  if (finalLead?.status === "qualifying") {
    console.log("✓ PASS: Lead status correct after 5 retries\n");
  } else {
    console.log(`✗ FAIL: Lead status is ${finalLead?.status}, expected qualifying\n`);
  }

  // TEST 3: INVALID TRANSITION TEST
  console.log("TEST 3: Invalid Status Transitions\n");
  const test3Lead = await createLead(
    {
      companyName: "Invalid Transition Test",
      contactName: "Test User",
      contactEmail: "test@invalid.com",
    },
    ACTOR_ID
  );

  const invalidTransitions = [
    { from: "new", invalid: ["active", "converted"], valid: ["qualifying"] },
    { from: "qualified", invalid: ["new", "qualifying"], valid: ["converted"] },
  ];

  for (const transition of invalidTransitions) {
    // First move to starting state
    await updateLead(test3Lead.id, { status: transition.from }, ACTOR_ID);

    // Try invalid transition
    for (const invalidStatus of transition.invalid) {
      try {
        await updateLead(test3Lead.id, { status: invalidStatus as any }, ACTOR_ID);
        console.log(
          `✗ FAIL: ${transition.from} → ${invalidStatus} should have been rejected`
        );
      } catch (e) {
        if (e instanceof ValidationError) {
          console.log(
            `✓ PASS: ${transition.from} → ${invalidStatus} correctly rejected`
          );
        }
      }
    }
  }
  console.log();

  // TEST 4: CONCURRENT MUTATION TEST
  console.log("TEST 4: Concurrent Mutations - Update same contact twice\n");
  const client = await createClient(
    { name: "Concurrent Test Client" },
    ACTOR_ID
  );
  const contact = await createContact(
    { clientId: client.id, name: "Test Contact", role: "owner" },
    ACTOR_ID
  );

  // Simulate two concurrent updates
  const update1 = updateContact(contact.id, { email: "first@test.com" }, ACTOR_ID);
  const update2 = updateContact(contact.id, { email: "second@test.com" }, ACTOR_ID);

  try {
    await Promise.all([update1, update2]);
    const finalContact = await db.clientContact.findUnique({
      where: { id: contact.id },
    });
    console.log(`✓ PASS: Concurrent updates handled (final email: ${finalContact?.email})\n`);
  } catch (e) {
    console.log(`✗ FAIL: Concurrent updates caused error\n`);
  }

  // TEST 5: PARTIAL FAILURE TEST - Lead conversion without engagement
  console.log("TEST 5: Partial Failure - Try linking non-existent engagement\n");
  const orphanLead = await createLead(
    {
      companyName: "Orphan Lead",
      contactName: "Orphan User",
      contactEmail: "orphan@test.com",
    },
    ACTOR_ID
  );

  await updateLead(orphanLead.id, { status: "qualified" }, ACTOR_ID);

  const fakeEngagementId = "00000000-0000-0000-0000-000000000000";
  const fakeClientId = "00000000-0000-0000-0000-000000000000";

  try {
    await linkLeadToEngagement(orphanLead.id, fakeEngagementId, fakeClientId, ACTOR_ID);
    console.log("✗ FAIL: Should have rejected invalid engagement\n");
  } catch (e) {
    console.log("✓ PASS: Invalid engagement link correctly rejected\n");
  }

  // Verify lead still in qualified state (not corrupted)
  const orphanCheckLead = await db.leadRecord.findUnique({
    where: { id: orphanLead.id },
  });
  if (orphanCheckLead?.status === "qualified" && !orphanCheckLead.engagementId) {
    console.log("✓ PASS: Lead state preserved after failed link attempt\n");
  } else {
    console.log("✗ FAIL: Lead state corrupted\n");
  }

  // TEST 6: AUDIT INTEGRITY
  console.log("TEST 6: Audit Integrity - Check all mutations logged\n");
  const auditEvents = await db.auditEvent.findMany({
    where: { actorId: ACTOR_ID },
    orderBy: { occurredAt: "asc" },
  });

  const eventCounts: Record<string, number> = {};
  for (const event of auditEvents) {
    eventCounts[event.eventName] = (eventCounts[event.eventName] || 0) + 1;
  }

  console.log("Audit Events Logged:");
  for (const [eventName, count] of Object.entries(eventCounts).sort()) {
    console.log(`  ${eventName}: ${count}`);
  }

  const hasLeadCreated = eventCounts[AUDIT_EVENTS.LEAD_CREATED] || 0;
  const hasLeadUpdated = eventCounts[AUDIT_EVENTS.LEAD_UPDATED] || 0;
  const hasContactCreated = eventCounts[AUDIT_EVENTS.CLIENT_CONTACT_CREATED] || 0;
  const hasContactUpdated = eventCounts[AUDIT_EVENTS.CLIENT_CONTACT_UPDATED] || 0;

  if (hasLeadCreated >= 3 && hasLeadUpdated >= 7 && hasContactCreated >= 1 && hasContactUpdated >= 2) {
    console.log("\n✓ PASS: All mutations audit-logged correctly\n");
  } else {
    console.log(
      `\n✗ FAIL: Audit logging incomplete\n` +
        `  Expected LEAD_CREATED >= 3, got ${hasLeadCreated}\n` +
        `  Expected LEAD_UPDATED >= 7, got ${hasLeadUpdated}\n` +
        `  Expected CLIENT_CONTACT_CREATED >= 1, got ${hasContactCreated}\n` +
        `  Expected CLIENT_CONTACT_UPDATED >= 2, got ${hasContactUpdated}\n`
    );
  }

  console.log("=== Stress Tests Complete ===");
  return {
    testsPassed:
      leadCount === 1 &&
      finalLead?.status === "qualifying" &&
      orphanCheckLead?.status === "qualified",
    auditLogged: hasLeadCreated >= 3,
  };
}

// Execute tests
runStressTests()
  .then((result) => {
    console.log("\n=== Stress Test Summary ===");
    console.log(`All tests passed: ${result.testsPassed ? "YES" : "NO"}`);
    console.log(`Audit logged: ${result.auditLogged ? "YES" : "NO"}`);
    console.log(
      `System safe: ${result.testsPassed && result.auditLogged ? "YES" : "NO"}`
    );
    process.exit(result.testsPassed && result.auditLogged ? 0 : 1);
  })
  .catch((error) => {
    console.error("✗ Stress tests failed:", error);
    process.exit(1);
  });
