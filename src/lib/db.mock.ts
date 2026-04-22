const SCHEMA_DEFAULTS: Record<string, Record<string, any>> = {
  user: { isActive: true, version: 1 },
  session: {},
  userRoleAssignment: { isActive: true },
  engagementMembership: { isActive: true },
  leadRecord: { status: "new", visibility: "internal" },
  clientAccount: { status: "active", version: 1, visibility: "internal" },
  clientContact: { isActive: true, isPrimary: false, visibility: "internal" },
  engagement: { status: "draft", healthStatus: "healthy", interventionMode: "recovery", version: 1, visibility: "internal" },
  businessConditionProfile: { isCurrent: true, version: 1 },
  auditEvent: { actorType: "user", visibility: "internal" },
  idempotencyRecord: { status: "pending" },
  scheduledTask: { status: "pending", attempts: 0, maxAttempts: 3 },
};

const createMockModel = (modelName: string) => {
  const storage = new Map<string, any>();
  const defaults = SCHEMA_DEFAULTS[modelName] || {};

  return {
    create: ({ data }: any) => {
      const id = data.id || crypto.randomUUID();
      const record = { ...defaults, ...data, id };
      storage.set(id, record);
      return Promise.resolve(record);
    },
    findUnique: ({ where }: any) => {
      const record = storage.get(where.id);
      return Promise.resolve(record || null);
    },
    findFirst: () => Promise.resolve(null),
    findMany: ({ where }: any = {}) => {
      const records = Array.from(storage.values());
      if (!where) return Promise.resolve(records);

      return Promise.resolve(
        records.filter(record => {
          for (const [key, value] of Object.entries(where)) {
            if (key === 'NOT' || key === 'notIn') continue;
            if (record[key] !== value) return false;
          }
          return true;
        })
      );
    },
    update: ({ where, data }: any) => {
      const record = storage.get(where.id);
      if (!record) return Promise.resolve(null);
      const updated = { ...record, ...data };
      storage.set(where.id, updated);
      return Promise.resolve(updated);
    },
    updateMany: () => Promise.resolve({ count: 0 }),
    delete: ({ where }: any) => {
      const record = storage.get(where.id);
      storage.delete(where.id);
      return Promise.resolve(record || null);
    },
    deleteMany: () => Promise.resolve({ count: 0 }),
    count: ({ where }: any = {}) => {
      const records = Array.from(storage.values());
      if (!where) return Promise.resolve(records.length);

      const filtered = records.filter(record => {
        for (const [key, value] of Object.entries(where)) {
          if (key === 'NOT' || key === 'notIn') continue;
          if (record[key] !== value) return false;
        }
        return true;
      });
      return Promise.resolve(filtered.length);
    },
  };
};

export const mockDb = {
  user: createMockModel("user"),
  session: createMockModel("session"),
  userRoleAssignment: createMockModel("userRoleAssignment"),
  engagementMembership: createMockModel("engagementMembership"),
  leadRecord: createMockModel("leadRecord"),
  clientAccount: createMockModel("clientAccount"),
  clientContact: createMockModel("clientContact"),
  engagement: createMockModel("engagement"),
  businessConditionProfile: createMockModel("businessConditionProfile"),
  auditEvent: createMockModel("auditEvent"),
  idempotencyRecord: createMockModel("idempotencyRecord"),
  scheduledTask: createMockModel("scheduledTask"),
} as any;
