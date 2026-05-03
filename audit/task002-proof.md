# TASK 002 Verification - All Prisma Reads

✗ VIOLATION: /home/user/OPsIq/src/services/role-assignment.ts:77
    const targetUser = await db.user.findUnique({
    where: { id: input.userId },
  });...

✗ VIOLATION: /home/user/OPsIq/src/services/workspace/activation-context.ts:24
    const membership = await db.workspaceMembership.findFirst({
    where: {
      userId,
      isActive: true,
    },
    include: {
      workspace: ...

✗ VIOLATION: /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:39
      db.finding.findMany({
      where: findingWhere,
    }),...

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
Violations found: 24

## Violations
- /home/user/OPsIq/src/services/role-assignment.ts:77
- /home/user/OPsIq/src/services/workspace/activation-context.ts:24
- /home/user/OPsIq/src/services/execution-drift/execution-drift.service.ts:39
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
