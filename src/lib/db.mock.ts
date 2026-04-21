const createMockModel = () => {
  const storage = new Map<string, any>();

  return {
    create: ({ data }: any) => {
      const id = data.id || crypto.randomUUID();
      const record = { ...data, id };
      storage.set(id, record);
      return Promise.resolve(record);
    },
    findUnique: ({ where }: any) => {
      const record = storage.get(where.id);
      return Promise.resolve(record || null);
    },
    findFirst: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
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
    count: () => Promise.resolve(0),
  };
};

export const mockDb = {
  user: createMockModel(),
  session: createMockModel(),
  userRoleAssignment: createMockModel(),
  engagementMembership: createMockModel(),
  leadRecord: createMockModel(),
  clientAccount: createMockModel(),
  clientContact: createMockModel(),
  engagement: createMockModel(),
  businessConditionProfile: createMockModel(),
  auditEvent: createMockModel(),
  idempotencyRecord: createMockModel(),
  scheduledTask: createMockModel(),
} as any;
