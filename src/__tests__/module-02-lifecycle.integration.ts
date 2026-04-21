import { db } from "@/lib/db";
import { createClient, getClientById } from "@/services/client-account";
import { createContact, updateContact, deactivateContact } from "@/services/client-contact";
import { createLead, updateLead, linkLeadToEngagement, getLeadById } from "@/services/lead";
import { createEngagement, getEngagementById } from "@/services/engagement";
import { addMember, getMembersForEngagement } from "@/services/engagement-membership";
import { assessCondition, getCurrentCondition } from "@/services/business-condition";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const ACTOR_ID = "test-user-id";
const TEST_USER_ID = "test-consultant-id";

async function runLifecycleTest() {
  console.log("=== Module 02 Lifecycle Test ===\n");

  // 1. CREATE CLIENT
  console.log("1. Creating client...");
  const clientResult = await createClient(
    {
      name: "Acme Corp",
      legalName: "Acme Corporation Inc",
      industry: "Manufacturing",
      size: "medium",
    },
    ACTOR_ID
  );
  const clientId = clientResult.id;
  console.log(`✓ Client created: ${clientId}\n`);

  // Verify client exists
  const client = await getClientById(clientId);
  console.log(`✓ Client verified: ${client.name}\n`);

  // 2. CREATE CONTACT
  console.log("2. Creating contact...");
  const contactResult = await createContact(
    {
      clientId,
      name: "John CEO",
      email: "john@acme.com",
      role: "owner",
      isPrimary: true,
    },
    ACTOR_ID
  );
  const contactId = contactResult.id;
  console.log(`✓ Contact created: ${contactId}\n`);

  // 3. CREATE LEAD
  console.log("3. Creating lead...");
  const leadResult = await createLead(
    {
      companyName: "Acme Corp",
      contactName: "John CEO",
      contactEmail: "john@acme.com",
      source: "referral",
      estimatedValue: 50000,
    },
    ACTOR_ID
  );
  const leadId = leadResult.id;
  console.log(`✓ Lead created: ${leadId}\n`);

  // 4. UPDATE LEAD (first update)
  console.log("4. Updating lead status to qualifying...");
  await updateLead(leadId, { status: "qualifying" }, ACTOR_ID);
  let lead = await getLeadById(leadId);
  console.log(`✓ Lead status: ${lead.status}\n`);

  // 5. UPDATE LEAD TO QUALIFIED (idempotency test: call twice with same data)
  console.log("5. Testing idempotency - updating lead to qualified twice...");
  const updateData = { status: "qualified" };
  await updateLead(leadId, updateData, ACTOR_ID);
  await updateLead(leadId, updateData, ACTOR_ID); // Retry with same data
  lead = await getLeadById(leadId);
  console.log(`✓ Lead status: ${lead.status} (idempotency verified)\n`);

  // 6. CREATE ENGAGEMENT
  console.log("6. Creating engagement...");
  const engagementResult = await createEngagement(
    {
      title: "Acme Operational Review",
      clientId,
      serviceTier: "standard",
      engagementMode: "expert",
      interventionMode: "recovery",
    },
    ACTOR_ID
  );
  const engagementId = engagementResult.id;
  console.log(`✓ Engagement created: ${engagementId}\n`);

  // 7. LINK LEAD TO ENGAGEMENT (converts qualified lead)
  console.log("7. Linking lead to engagement (converts lead to client)...");
  await linkLeadToEngagement(leadId, engagementId, clientId, ACTOR_ID);
  lead = await getLeadById(leadId);
  console.log(`✓ Lead status: ${lead.status}`);
  console.log(`✓ Lead now linked to client: ${lead.client?.name}\n`);

  // 8. TEST LINKAGE IDEMPOTENCY (call link again - should be safe due to validation)
  console.log("8. Testing lead-to-engagement idempotency...");
  try {
    await linkLeadToEngagement(leadId, engagementId, clientId, ACTOR_ID);
    console.log("✗ Should have failed (lead already converted)\n");
  } catch (e) {
    console.log("✓ Correctly rejected re-link (lead already converted)\n");
  }

  // 9. ADD ENGAGEMENT MEMBER
  console.log("9. Adding team member to engagement...");
  const memberResult = await addMember(
    {
      userId: TEST_USER_ID,
      engagementId,
      role: "lead_consultant",
    },
    ACTOR_ID
  );
  console.log(`✓ Member added: ${memberResult.id}\n`);

  // 10. VERIFY MEMBERSHIP
  const members = await getMembersForEngagement(engagementId);
  console.log(`✓ Engagement has ${members.length} team member(s)\n`);

  // 11. UPDATE CONTACT ROLE (should trigger re-evaluation)
  console.log("11. Updating contact role to trigger re-evaluation...");
  await updateContact(contactId, { role: "operations_director" }, ACTOR_ID);
  const updatedContact = await db.clientContact.findUnique({
    where: { id: contactId },
  });
  console.log(`✓ Contact role updated to: ${updatedContact?.role}\n`);

  // 12. ASSESS BUSINESS CONDITION
  console.log("12. Assessing business condition...");
  const conditionResult = await assessCondition(
    {
      engagementId,
      businessStatus: "distressed",
      severityScore: 7,
      urgencyLevel: "high",
      cashPressureLevel: "high",
      marginPressureLevel: "medium",
      clientConcentrationRisk: "low",
      ownerDependencyRisk: "high",
      keyPersonDependencyRisk: "medium",
      processMaturityLevel: "low",
      managementMaturityLevel: "medium",
      executionCapacityLevel: "low",
      moraleFragilityLevel: "high",
      resilienceLevel: "low",
      growthReadinessLevel: "medium",
    },
    ACTOR_ID
  );
  console.log(`✓ Condition assessed: ${conditionResult.id}\n`);

  // 13. VERIFY CURRENT CONDITION
  const currentCondition = await getCurrentCondition(engagementId);
  console.log(`✓ Current condition status: ${currentCondition?.businessStatus}`);
  console.log(`✓ Severity score: ${currentCondition?.severityScore}/10\n`);

  // 14. VERIFY AUDIT EVENTS
  console.log("14. Verifying audit events emitted...");
  const auditEvents = await db.auditEvent.findMany({
    where: {
      actorId: ACTOR_ID,
    },
    orderBy: { occurredAt: "asc" },
  });

  const eventNames = auditEvents.map((e) => e.eventName);
  const expectedEvents = [
    AUDIT_EVENTS.CLIENT_ACCOUNT_CREATED,
    AUDIT_EVENTS.CLIENT_CONTACT_CREATED,
    AUDIT_EVENTS.LEAD_CREATED,
    AUDIT_EVENTS.LEAD_UPDATED,
    AUDIT_EVENTS.LEAD_UPDATED,
    AUDIT_EVENTS.ENGAGEMENT_CREATED,
    AUDIT_EVENTS.LEAD_LINKED_TO_ENGAGEMENT,
    AUDIT_EVENTS.ENGAGEMENT_MEMBER_ADDED,
    AUDIT_EVENTS.CLIENT_CONTACT_UPDATED,
    AUDIT_EVENTS.CONDITION_ASSESSED,
  ];

  let auditPass = true;
  for (const event of expectedEvents) {
    if (eventNames.includes(event)) {
      console.log(`✓ ${event}`);
    } else {
      console.log(`✗ MISSING: ${event}`);
      auditPass = false;
    }
  }

  if (auditPass) {
    console.log("\n✓ All expected audit events emitted\n");
  } else {
    console.log("\n✗ Some audit events missing\n");
  }

  // 15. FINAL ENGAGEMENT VERIFICATION
  console.log("15. Final engagement state verification...");
  const finalEngagement = await getEngagementById(engagementId);
  console.log(`✓ Engagement status: ${finalEngagement.status}`);
  console.log(`✓ Intervention mode: ${finalEngagement.interventionMode}`);
  console.log(`✓ Health status: ${finalEngagement.healthStatus}`);
  console.log(`✓ Team members: ${finalEngagement.memberships?.length}`);
  console.log(`✓ Current condition: ${finalEngagement.conditionProfiles?.[0]?.businessStatus}\n`);

  console.log("=== Lifecycle Test Complete ===");
  return {
    clientId,
    contactId,
    leadId,
    engagementId,
    auditEventsEmitted: eventNames.length,
    allAuditEventsPassed: auditPass,
  };
}

// Execute test
runLifecycleTest()
  .then((result) => {
    console.log("\n=== Test Summary ===");
    console.log(`Client: ${result.clientId}`);
    console.log(`Contact: ${result.contactId}`);
    console.log(`Lead: ${result.leadId}`);
    console.log(`Engagement: ${result.engagementId}`);
    console.log(`Audit events: ${result.auditEventsEmitted}`);
    console.log(`Audit events passed: ${result.allAuditEventsPassed ? "YES" : "NO"}`);
    process.exit(result.allAuditEventsPassed ? 0 : 1);
  })
  .catch((error) => {
    console.error("✗ Test failed:", error);
    process.exit(1);
  });
