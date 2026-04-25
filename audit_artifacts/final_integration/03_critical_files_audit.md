# Critical Files Audit Across Branches

## Methodology

For each critical file, check if it exists and differs across:
- main
- claude/audit-opsiq-repo-Zf8hu
- claude/opsiq-domain-foundation-Y7Cqb
- claude/opsiq-integration-mainline-rsxNK
- integrate/diagnosis-engines-v1

Critical areas per mission:
1. Prisma schema + migrations
2. Engagement intervention state fields
3. Diagnosis API/service/engines
4. Package scripts/dependencies
5. Test setup
6. TypeScript/build config

## File Audit Results

### 1. prisma/schema.prisma

main: ✓ exists (543 lines, Engagement model: 2, blocking fields: 0
0)
claude/audit-opsiq-repo-Zf8hu: ✓ exists (616 lines, Engagement model: 2, blocking fields: 1)
claude/opsiq-domain-foundation-Y7Cqb: ✓ exists (295 lines, Engagement model: 2, blocking fields: 0
0)
claude/opsiq-integration-mainline-rsxNK: ✓ exists (613 lines, Engagement model: 2, blocking fields: 0
0)
integrate/diagnosis-engines-v1: ✓ exists (543 lines, Engagement model: 2, blocking fields: 0
0)
