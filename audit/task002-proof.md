# TASK 002 Verification - All Prisma Reads

✗ VIOLATION: /home/user/OPsIq/src/services/role-assignment.ts:77
    const targetUser = await db.user.findUnique({
    where: { id: input.userId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/shock-detection.ts:192
    const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      conditionProfiles: {
      ...

✗ VIOLATION: /home/user/OPsIq/src/services/shock-event.ts:38
    const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true, status: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/shock-event.ts:129
    const events = await db.shockEvent.findMany({
    where: { engagementId },
    select: {
      id: true,
      type: true,
      severity: true,
   ...

✗ VIOLATION: /home/user/OPsIq/src/services/shock-event.ts:158
    const shockEvent = await db.shockEvent.findUnique({
    where: { id: shockEventId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/stage.ts:89
    const stage = await db.stage.findUnique({
    where: { id },
    include: {
      engagement: true,
    },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/stage.ts:127
    const stage = await db.stage.findUnique({
    where: { id },
    include: { engagement: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/stage.ts:204
    const stage = await db.stage.findUnique({
    where: { id },
    include: { engagement: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/stage.ts:290
    const stage = await db.stage.findUnique({
    where: { id },
    include: { engagement: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-control/enforcement.service.ts:253
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-evidence/decision-evidence.service.ts:111
      db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true },
      orderBy: { createdAt: "desc" },
    }),...

✗ VIOLATION: /home/user/OPsIq/src/services/workspace/activation-context.ts:24
    const membership = await db.workspaceMembership.findFirst({
    where: {
      userId,
      isActive: true,
    },
    include: {
      workspace: ...

✗ VIOLATION: /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:34
    const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:45
        db.finding.findMany({
        where: { engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:48
        db.recommendation.findMany({
        where: { engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:51
        db.action.findMany({
        where: { engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:54
        db.businessConditionProfile.findFirst({
        where: { engagementId, isCurrent: true },
        orderBy: { createdAt: "desc" },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/business-impact/decision-impact.service.ts:51
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:22
        db.engagement.findUnique({
        where: { id: engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:25
        db.finding.findMany({
        where: { engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:28
        db.recommendation.findMany({
        where: { engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:31
        db.action.findMany({
        where: { engagementId },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:34
        db.businessConditionProfile.findFirst({
        where: { engagementId, isCurrent: true },
        orderBy: { createdAt: "desc" },
      }),...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/decision-timeline.ts:44
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/execution-stub.ts:19
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/execution-stub.ts:110
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/status-management.ts:132
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/status-management.ts:245
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/transaction-actions.ts:16
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/transaction-detail.ts:13
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/transaction-detail.ts:89
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/transaction-execution.ts:21
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/decision/transaction-execution.ts:80
    const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:20
    const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:30
      db.finding.findMany({
      where: { engagementId },
    }),...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:33
      db.recommendation.findMany({
      where: { engagementId },
    }),...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:36
      db.action.findMany({
      where: { engagementId },
    }),...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:39
      db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true },
      orderBy: { createdAt: "desc" },
    }),...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/next-action.service.ts:240
      const dbAction = await db.action.findUnique({
      where: { id: action.entityId },
      select: { status: true, startedAt: true, updatedAt: true...

✗ VIOLATION: /home/user/OPsIq/src/services/consulting-engine/pipeline.ts:28
      const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      include: {
        client: {
          select: { indu...

✗ VIOLATION: /home/user/OPsIq/src/services/consulting-engine/pipeline.ts:53
      const findings = await db.finding.findMany({
      where: {
        engagementId,
        status: "approved", // Align with main's approval flow
 ...

✗ VIOLATION: /home/user/OPsIq/src/services/alerts/alert-service.ts:115
      const existingAlert = await db.alert.findUnique({
      where: { id: alertId },
    });...

✗ VIOLATION: /home/user/OPsIq/src/app/api/auth/logout/route.ts:16
      const membership = await db.workspaceMembership.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { addedAt: "a...

✗ VIOLATION: /home/user/OPsIq/src/app/api/auth/login/route.ts:30
    const user = await db.user.findUnique({ where: { email } });...

✗ VIOLATION: /home/user/OPsIq/src/app/api/auth/login/route.ts:42
    const membership = await db.workspaceMembership.findFirst({
    where: { userId: user.id, isActive: true },
    orderBy: { addedAt: "asc" },
  });...

✗ VIOLATION: /home/user/OPsIq/src/app/api/decisions/intake/route.ts:43
        const membership = await db.workspaceMembership.findFirst({
        where: {
          userId,
          isActive: true,
        },
      });...

✗ VIOLATION: /home/user/OPsIq/src/app/api/onboarding/workspace/route.ts:25
      const existing = await db.workspace.findUnique({
      where: { slug: input.slug },
    });...

✗ VIOLATION: /home/user/OPsIq/src/app/api/onboarding/invite/route.ts:29
      const workspace = await db.workspace.findUnique({
      where: { slug: input.workspaceSlug },
    });...

✗ VIOLATION: /home/user/OPsIq/src/app/api/onboarding/invite/route.ts:58
          let user = await db.user.findUnique({
          where: { email: member.email },
        });...

✗ VIOLATION: /home/user/OPsIq/src/lib/visibility.ts:8
    const membership = await db.engagementMembership.findFirst({
    where: {
      userId,
      engagementId,
      isActive: true,
    },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/idempotency.ts:32
    const existing = await db.idempotencyRecord.findUnique({
    where: { idempotencyKey },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/scheduler.ts:64
      const dueTasks = await db.scheduledTask.findMany({
      where: {
        status: "pending",
        scheduledFor: { lte: now },
      },
      or...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:10
    let user = await db.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:27
    let client = await db.clientAccount.findFirst({
    where: { name: "Demo Manufacturing Corp" },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:47
    let engagement = await db.engagement.findFirst({
    where: { code: "ENG-001" },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:71
    let condition = await db.businessConditionProfile.findFirst({
    where: { engagementId: engagement.id, isCurrent: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:124
      const exists = await db.finding.findFirst({
      where: { engagementId: engagement.id, title: fd.title },
    });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:177
    const findings = await db.finding.findMany({
    where: { engagementId: engagement.id },
    select: { id: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:184
      const exists = await db.recommendation.findFirst({
      where: { engagementId: engagement.id, title: rd.title },
    });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:242
    const recommendations = await db.recommendation.findMany({
    where: { engagementId: engagement.id },
    select: { id: true },
  });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:249
      const exists = await db.action.findFirst({
      where: { engagementId: engagement.id, title: ad.title },
    });...

✗ VIOLATION: /home/user/OPsIq/src/infra/seed.ts:311
      const exists = await db.kPI.findFirst({
      where: { engagementId: engagement.id, name: kd.name },
    });...


## Summary
Files checked: 363
Reads checked: 328
Violations found: 62

## Violations
- /home/user/OPsIq/src/services/role-assignment.ts:77
- /home/user/OPsIq/src/services/shock-detection.ts:192
- /home/user/OPsIq/src/services/shock-event.ts:38
- /home/user/OPsIq/src/services/shock-event.ts:129
- /home/user/OPsIq/src/services/shock-event.ts:158
- /home/user/OPsIq/src/services/stage.ts:89
- /home/user/OPsIq/src/services/stage.ts:127
- /home/user/OPsIq/src/services/stage.ts:204
- /home/user/OPsIq/src/services/stage.ts:290
- /home/user/OPsIq/src/services/decision-control/enforcement.service.ts:253
- /home/user/OPsIq/src/services/decision-evidence/decision-evidence.service.ts:111
- /home/user/OPsIq/src/services/workspace/activation-context.ts:24
- /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:34
- /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:45
- /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:48
- /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:51
- /home/user/OPsIq/src/services/business-impact/business-impact.service.ts:54
- /home/user/OPsIq/src/services/business-impact/decision-impact.service.ts:51
- /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:22
- /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:25
- /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:28
- /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:31
- /home/user/OPsIq/src/services/decision-confidence/decision-confidence.service.ts:34
- /home/user/OPsIq/src/services/decision/decision-timeline.ts:44
- /home/user/OPsIq/src/services/decision/execution-stub.ts:19
- /home/user/OPsIq/src/services/decision/execution-stub.ts:110
- /home/user/OPsIq/src/services/decision/status-management.ts:132
- /home/user/OPsIq/src/services/decision/status-management.ts:245
- /home/user/OPsIq/src/services/decision/transaction-actions.ts:16
- /home/user/OPsIq/src/services/decision/transaction-detail.ts:13
- /home/user/OPsIq/src/services/decision/transaction-detail.ts:89
- /home/user/OPsIq/src/services/decision/transaction-execution.ts:21
- /home/user/OPsIq/src/services/decision/transaction-execution.ts:80
- /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:20
- /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:30
- /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:33
- /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:36
- /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:39
- /home/user/OPsIq/src/services/execution-drift/next-action.service.ts:240
- /home/user/OPsIq/src/services/consulting-engine/pipeline.ts:28
- /home/user/OPsIq/src/services/consulting-engine/pipeline.ts:53
- /home/user/OPsIq/src/services/alerts/alert-service.ts:115
- /home/user/OPsIq/src/app/api/auth/logout/route.ts:16
- /home/user/OPsIq/src/app/api/auth/login/route.ts:30
- /home/user/OPsIq/src/app/api/auth/login/route.ts:42
- /home/user/OPsIq/src/app/api/decisions/intake/route.ts:43
- /home/user/OPsIq/src/app/api/onboarding/workspace/route.ts:25
- /home/user/OPsIq/src/app/api/onboarding/invite/route.ts:29
- /home/user/OPsIq/src/app/api/onboarding/invite/route.ts:58
- /home/user/OPsIq/src/lib/visibility.ts:8
- /home/user/OPsIq/src/infra/idempotency.ts:32
- /home/user/OPsIq/src/infra/scheduler.ts:64
- /home/user/OPsIq/src/infra/seed.ts:10
- /home/user/OPsIq/src/infra/seed.ts:27
- /home/user/OPsIq/src/infra/seed.ts:47
- /home/user/OPsIq/src/infra/seed.ts:71
- /home/user/OPsIq/src/infra/seed.ts:124
- /home/user/OPsIq/src/infra/seed.ts:177
- /home/user/OPsIq/src/infra/seed.ts:184
- /home/user/OPsIq/src/infra/seed.ts:242
- /home/user/OPsIq/src/infra/seed.ts:249
- /home/user/OPsIq/src/infra/seed.ts:311
