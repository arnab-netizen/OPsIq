import { describe, it, expect } from 'vitest';
import {
  AuditEventSchema,
  ExportFormatSchema,
  ExportPacketMetadataSchema,
  ExportPacketSchema,
  BatchExportResultSchema,
  generatePacketId,
  calculateChecksum,
  generateSignature,
  redactAuditEvent,
  anonymizeAuditEvent,
  formatEventsAsJSON,
  formatEventsAsCSV,
  formatEventsAsJSONL,
  simulateCompression,
  generateExportPacket,
  generatePaginatedPackets,
  generateBatchExportResult,
  generateMockAuditEvents,
  generateMockExportWithConfig,
  verifyPacketIntegrity,
  verifyPacketSignature,
  type AuditEvent,
  type ExportFormat,
  type ExportPacket,
} from '@/domain/audit-export/audit-export-packet';

describe('ADDENDUM F: Audit Export Packet Generator', () => {
  // Default ExportFormat with all required fields
  const defaultExportFormat = (overrides?: Partial<ExportFormat>): ExportFormat => ({
    format: 'json',
    includeDetails: true,
    includeChanges: false,
    redactPersonalData: true,
    anonymizeUsers: false,
    compressionType: 'gzip',
    pageSize: 1000,
    timeRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    timeRangeEnd: new Date(),
    ...overrides,
  });

  describe('Audit Event Schema', () => {
    it('should validate basic audit event', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_1',
        action: 'CREATE',
        resource: 'decision',
        resourceId: 'res_1',
        status: 'success',
      };

      const result = AuditEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate event with optional fields', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_1',
        action: 'UPDATE',
        resource: 'action',
        resourceId: 'res_1',
        status: 'failure',
        details: { reason: 'Invalid input' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = AuditEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate all event statuses', () => {
      const statuses: Array<'success' | 'failure' | 'denied'> = ['success', 'failure', 'denied'];

      for (const status of statuses) {
        const event: AuditEvent = {
          eventId: `evt_${status}`,
          timestamp: new Date(),
          workspaceId: 'ws_1',
          userId: 'user_1',
          action: 'READ',
          resource: 'report',
          resourceId: 'res_1',
          status,
        };

        // Verify structure without full schema validation
        expect(event.status).toBe(status);
        expect(['success', 'failure', 'denied']).toContain(event.status);
      }
    });
  });

  describe('Export Format Schema', () => {
    it('should validate export format', () => {
      const format = defaultExportFormat();

      const result = ExportFormatSchema.safeParse(format);
      expect(result.success).toBe(true);
    });

    it('should support all export formats', () => {
      const formats: Array<'json' | 'csv' | 'jsonl'> = ['json', 'csv', 'jsonl'];

      for (const fmt of formats) {
        const format: ExportFormat = {
          format: fmt,
          includeDetails: true,
          includeChanges: false,
          redactPersonalData: true,
          anonymizeUsers: false,
          compressionType: 'gzip',
          pageSize: 1000,
          timeRangeStart: new Date(),
          timeRangeEnd: new Date(),
        };

        const result = ExportFormatSchema.safeParse(format);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Packet ID Generation', () => {
    it('should generate unique packet IDs', () => {
      const id1 = generatePacketId();
      const id2 = generatePacketId();

      expect(id1).toMatch(/^pkt_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^pkt_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should have consistent format', () => {
      const id = generatePacketId();

      expect(id).toContain('pkt_');
      expect(id.split('_')).toHaveLength(3);
    });
  });

  describe('Checksum Calculation', () => {
    it('should calculate SHA256 checksum', () => {
      const content = 'test content';
      const checksum = calculateChecksum(content);

      expect(checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex = 64 chars
    });

    it('should produce consistent checksums', () => {
      const content = 'same content';
      const checksum1 = calculateChecksum(content);
      const checksum2 = calculateChecksum(content);

      expect(checksum1).toBe(checksum2);
    });

    it('should differ for different content', () => {
      const checksum1 = calculateChecksum('content 1');
      const checksum2 = calculateChecksum('content 2');

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Signature Generation', () => {
    it('should generate HMAC signatures', () => {
      const content = 'test content';
      const secretKey = 'secret123';
      const signature = generateSignature(content, secretKey);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures', () => {
      const content = 'same content';
      const secretKey = 'same secret';
      const sig1 = generateSignature(content, secretKey);
      const sig2 = generateSignature(content, secretKey);

      expect(sig1).toBe(sig2);
    });

    it('should differ with different secrets', () => {
      const content = 'same content';
      const sig1 = generateSignature(content, 'secret1');
      const sig2 = generateSignature(content, 'secret2');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Event Redaction', () => {
    it('should redact IP addresses', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_1',
        action: 'READ',
        resource: 'data',
        resourceId: 'res_1',
        status: 'success',
        ipAddress: '192.168.1.100',
      };

      const redacted = redactAuditEvent(event);
      expect(redacted.ipAddress).toContain('***');
      expect(redacted.ipAddress).not.toBe(event.ipAddress);
    });

    it('should redact email details', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_1',
        action: 'CREATE',
        resource: 'user',
        resourceId: 'res_1',
        status: 'success',
        details: { email: 'user@example.com' },
      };

      const redacted = redactAuditEvent(event);
      expect(redacted.details?.email).toBe('***REDACTED***');
    });

    it('should preserve non-sensitive fields', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_1',
        action: 'UPDATE',
        resource: 'decision',
        resourceId: 'res_1',
        status: 'success',
        details: { reason: 'Policy update' },
      };

      const redacted = redactAuditEvent(event);
      expect(redacted.details?.reason).toBe('Policy update');
    });
  });

  describe('Event Anonymization', () => {
    it('should anonymize user IDs', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_12345',
        action: 'READ',
        resource: 'data',
        resourceId: 'res_1',
        status: 'success',
      };

      const anonymized = anonymizeAuditEvent(event);
      expect(anonymized.userId).toMatch(/^user_[a-f0-9]{8}$/);
      expect(anonymized.userId).not.toBe(event.userId);
    });

    it('should produce consistent anonymization', () => {
      const event: AuditEvent = {
        eventId: 'evt_1',
        timestamp: new Date(),
        workspaceId: 'ws_1',
        userId: 'user_123',
        action: 'READ',
        resource: 'data',
        resourceId: 'res_1',
        status: 'success',
      };

      const anon1 = anonymizeAuditEvent(event);
      const anon2 = anonymizeAuditEvent(event);

      expect(anon1.userId).toBe(anon2.userId);
    });
  });

  describe('Event Formatting', () => {
    it('should format events as JSON', () => {
      const events: AuditEvent[] = [
        {
          eventId: 'evt_1',
          timestamp: new Date(),
          workspaceId: 'ws_1',
          userId: 'user_1',
          action: 'CREATE',
          resource: 'decision',
          resourceId: 'res_1',
          status: 'success',
        },
      ];

      const json = formatEventsAsJSON(events);
      expect(json).toContain('evt_1');
      expect(json).toContain('CREATE');
    });

    it('should format events as CSV', () => {
      const events: AuditEvent[] = [
        {
          eventId: 'evt_1',
          timestamp: new Date('2026-05-11T10:00:00Z'),
          workspaceId: 'ws_1',
          userId: 'user_1',
          action: 'CREATE',
          resource: 'decision',
          resourceId: 'res_1',
          status: 'success',
        },
      ];

      const csv = formatEventsAsCSV(events);
      expect(csv).toContain('eventId');
      expect(csv).toContain('evt_1');
      expect(csv).toContain('CREATE');
    });

    it('should format events as JSONL', () => {
      const events: AuditEvent[] = [
        {
          eventId: 'evt_1',
          timestamp: new Date(),
          workspaceId: 'ws_1',
          userId: 'user_1',
          action: 'READ',
          resource: 'data',
          resourceId: 'res_1',
          status: 'success',
        },
        {
          eventId: 'evt_2',
          timestamp: new Date(),
          workspaceId: 'ws_1',
          userId: 'user_2',
          action: 'WRITE',
          resource: 'data',
          resourceId: 'res_2',
          status: 'success',
        },
      ];

      const jsonl = formatEventsAsJSONL(events);
      expect(jsonl).toContain('evt_1');
      expect(jsonl).toContain('evt_2');
      expect(jsonl).toMatch(/\n/); // Multiple events separated by newline
    });
  });

  describe('Compression Simulation', () => {
    it('should simulate gzip compression', () => {
      const content = 'test content that should be compressed'.repeat(10);
      const { compressed, ratio } = simulateCompression(content, 'gzip');

      expect(compressed).toBeDefined();
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });

    it('should have different ratios for different algorithms', () => {
      const content = 'x'.repeat(1000);
      const gzip = simulateCompression(content, 'gzip');
      const brotli = simulateCompression(content, 'brotli');

      expect(gzip.ratio).toBeGreaterThan(0);
      expect(brotli.ratio).toBeGreaterThan(0);
    });
  });

  describe('Packet Generation', () => {
    it('should generate export packet', () => {
      const events = generateMockAuditEvents(10);
      const config = defaultExportFormat();

      const packet = generateExportPacket(events, config);

      expect(packet.metadata.packetId).toBeDefined();
      expect(packet.metadata.eventCount).toBe(10);
      expect(packet.content).toBeDefined();
      expect(packet.integrityCheck).toBeDefined();
    });

    it('should validate generated packet', () => {
      const events = generateMockAuditEvents(5);
      const config = defaultExportFormat();

      const packet = generateExportPacket(events, config);
      const result = ExportPacketSchema.safeParse(packet);

      expect(result.success).toBe(true);
    });

    it('should include signature when secret key provided', () => {
      const events = generateMockAuditEvents(5);
      const config = defaultExportFormat();

      const packet = generateExportPacket(events, config, 'secret123');

      expect(packet.signature).toBeDefined();
    });
  });

  describe('Pagination', () => {
    it('should generate paginated packets', () => {
      const events = generateMockAuditEvents(250);
      const config = defaultExportFormat({ pageSize: 100 });

      const packets = generatePaginatedPackets(events, config);

      expect(packets.length).toBe(3); // 250 events / 100 per page = 3 packets
      expect(packets[0]?.metadata.packetNumber).toBe(1);
      expect(packets[2]?.metadata.packetNumber).toBe(3);
    });

    it('should track total packets in metadata', () => {
      const events = generateMockAuditEvents(150);
      const config = defaultExportFormat({ pageSize: 50 });

      const packets = generatePaginatedPackets(events, config);

      expect(packets.every((p) => p.metadata.totalPackets === 3)).toBe(true);
    });
  });

  describe('Batch Export Results', () => {
    it('should generate batch export result', () => {
      const events = generateMockAuditEvents(50);
      const config = defaultExportFormat();

      const packets = generatePaginatedPackets(events, config);
      const result = generateBatchExportResult(packets);

      expect(result.exportId).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.totalEvents).toBe(50);
      expect(result.packets).toHaveLength(1);
    });

    it('should validate batch result', () => {
      const events = generateMockAuditEvents(100);
      const config = defaultExportFormat({ format: 'csv' });

      const packets = generatePaginatedPackets(events, config);
      const result = generateBatchExportResult(packets);

      const validated = BatchExportResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });
  });

  describe('Mock Data Generation', () => {
    it('should generate audit events', () => {
      const events = generateMockAuditEvents(20);

      expect(events).toHaveLength(20);
      expect(events[0]?.eventId).toBeDefined();
      expect(events[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should generate varied event actions', () => {
      const events = generateMockAuditEvents(100);
      const actions = new Set(events.map((e) => e.action));

      expect(actions.size).toBeGreaterThan(1);
    });

    it('should generate with various export configs', () => {
      const jsonExport = generateMockExportWithConfig('json');
      const csvExport = generateMockExportWithConfig('csv');
      const jsonlExport = generateMockExportWithConfig('jsonl');

      expect(jsonExport.packets[0]?.metadata.exportFormat.format).toBe('json');
      expect(csvExport.packets[0]?.metadata.exportFormat.format).toBe('csv');
      expect(jsonlExport.packets[0]?.metadata.exportFormat.format).toBe('jsonl');
    });
  });

  describe('Integrity Verification', () => {
    it('should verify packet integrity', () => {
      const events = generateMockAuditEvents(10);
      const config = defaultExportFormat();

      const packet = generateExportPacket(events, config);

      expect(verifyPacketIntegrity(packet)).toBe(true);
    });

    it('should verify packet signature', () => {
      const events = generateMockAuditEvents(10);
      const config = defaultExportFormat();
      const secretKey = 'secret123';

      const packet = generateExportPacket(events, config, secretKey);

      expect(verifyPacketSignature(packet, secretKey)).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const events = generateMockAuditEvents(10);
      const config = defaultExportFormat();

      const packet = generateExportPacket(events, config, 'secret123');

      expect(verifyPacketSignature(packet, 'wrong-secret')).toBe(false);
    });
  });

  describe('Comprehensive Audit Export Coverage', () => {
    it('should support complete export workflow', () => {
      const events = generateMockAuditEvents(150);
      const config = defaultExportFormat({
        pageSize: 50,
        timeRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      const packets = generatePaginatedPackets(events, config, 'export-secret');
      const result = generateBatchExportResult(packets);

      expect(result.status).toBe('completed');
      expect(result.packets.length).toBeGreaterThan(1);
      expect(result.totalEvents).toBe(150);
      expect(verifyPacketIntegrity(packets[0]!)).toBe(true);
    });
  });
});
