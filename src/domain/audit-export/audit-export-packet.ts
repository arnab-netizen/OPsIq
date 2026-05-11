/**
 * ADDENDUM F: Audit Export Packet Generator
 *
 * Generates compliance audit export packets with event logs, formatting,
 * compression, pagination, and integrity verification.
 *
 * Non-DB: Contains only packet generation logic and mock data (no persistence).
 * Ready for: Integration with audit export API once database available.
 */

import { z } from 'zod';
import * as crypto from 'crypto';

// ============================================================================
// AUDIT EXPORT CONTRACTS
// ============================================================================

/** Audit event */
export const AuditEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.date(),
  workspaceId: z.string(),
  userId: z.string(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string(),
  status: z.enum(['success', 'failure', 'denied']),
  details: z.record(z.string(), z.any()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  changesBefore: z.record(z.string(), z.any()).optional(),
  changesAfter: z.record(z.string(), z.any()).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** Export format configuration */
export const ExportFormatSchema = z.object({
  format: z.enum(['json', 'csv', 'jsonl']),
  includeDetails: z.boolean().default(true),
  includeChanges: z.boolean().default(false),
  redactPersonalData: z.boolean().default(true),
  anonymizeUsers: z.boolean().default(false),
  compressionType: z.enum(['none', 'gzip', 'brotli']).default('gzip'),
  pageSize: z.number().min(1).max(10000).default(1000),
  timeRangeStart: z.date(),
  timeRangeEnd: z.date(),
});

export type ExportFormat = z.infer<typeof ExportFormatSchema>;

/** Export packet metadata */
export const ExportPacketMetadataSchema = z.object({
  packetId: z.string(),
  workspaceId: z.string(),
  generatedAt: z.date(),
  exportFormat: ExportFormatSchema,
  totalEvents: z.number(),
  totalPackets: z.number(),
  packetNumber: z.number(),
  eventCount: z.number(),
  fileSizeBytes: z.number(),
  checksumSHA256: z.string(),
  compressionRatio: z.number().optional(),
  encryptionAlgorithm: z.string().optional(),
});

export type ExportPacketMetadata = z.infer<typeof ExportPacketMetadataSchema>;

/** Export packet */
export const ExportPacketSchema = z.object({
  metadata: ExportPacketMetadataSchema,
  content: z.string(), // Base64-encoded compressed content
  signature: z.string().optional(), // HMAC-SHA256 signature for verification
  integrityCheck: z.object({
    algorithm: z.string(),
    value: z.string(),
  }).optional(),
});

export type ExportPacket = z.infer<typeof ExportPacketSchema>;

/** Batch export result */
export const BatchExportResultSchema = z.object({
  exportId: z.string(),
  workspaceId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'partial']),
  totalEvents: z.number(),
  exportedEvents: z.number(),
  packets: z.array(ExportPacketSchema),
  startTime: z.date(),
  completionTime: z.date().optional(),
  errorMessage: z.string().optional(),
  downloadUrl: z.string().optional(),
  retentionDays: z.number().optional(),
});

export type BatchExportResult = z.infer<typeof BatchExportResultSchema>;

// ============================================================================
// PACKET GENERATION ALGORITHMS
// ============================================================================

/**
 * Generate unique packet ID
 */
export function generatePacketId(): string {
  return `pkt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate SHA256 checksum of content
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate HMAC-SHA256 signature for packet
 */
export function generateSignature(content: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(content).digest('hex');
}

/**
 * Redact personal data from audit event
 */
export function redactAuditEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    ipAddress: event.ipAddress ? event.ipAddress.replace(/\.\d+$/, '.***') : undefined,
    userAgent: event.userAgent ? event.userAgent.substring(0, 20) + '...' : undefined,
    details: event.details ? Object.fromEntries(Object.entries(event.details).map(([k, v]) => {
      if (typeof v === 'string' && (k.toLowerCase().includes('email') || k.toLowerCase().includes('phone'))) {
        return [k, '***REDACTED***'];
      }
      return [k, v];
    })) : undefined,
  };
}

/**
 * Anonymize user references in audit event
 */
export function anonymizeAuditEvent(event: AuditEvent): AuditEvent {
  const userId = event.userId;
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  const anonymousId = `user_${hash.substring(0, 8)}`;

  return {
    ...event,
    userId: anonymousId,
  };
}

/**
 * Format audit events as JSON
 */
export function formatEventsAsJSON(events: AuditEvent[]): string {
  return JSON.stringify(events, null, 2);
}

/**
 * Format audit events as CSV
 */
export function formatEventsAsCSV(events: AuditEvent[]): string {
  if (events.length === 0) return '';

  const headers = ['eventId', 'timestamp', 'workspaceId', 'userId', 'action', 'resource', 'resourceId', 'status'];
  const rows = events.map((event) =>
    headers.map((header) => {
      const value = (event as Record<string, unknown>)[header];
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value || '');
    }).join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Format audit events as JSONL (one JSON object per line)
 */
export function formatEventsAsJSONL(events: AuditEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

/**
 * Simulate compression (mock - not actual gzip compression)
 */
export function simulateCompression(content: string, compressionType: 'gzip' | 'brotli' | 'none'): {
  compressed: string;
  ratio: number;
} {
  const originalSize = Buffer.byteLength(content, 'utf8');

  // Mock compression: assume 60-70% compression ratio for gzip, 65-75% for brotli
  let compressedSize = originalSize;
  if (compressionType === 'gzip') {
    compressedSize = Math.floor(originalSize * (0.6 + Math.random() * 0.1));
  } else if (compressionType === 'brotli') {
    compressedSize = Math.floor(originalSize * (0.65 + Math.random() * 0.1));
  }

  const ratio = compressedSize / originalSize;
  const compressed = Buffer.from(content).toString('base64').substring(0, Math.floor(content.length * ratio));

  return {
    compressed,
    ratio: Number(ratio.toFixed(3)),
  };
}

/**
 * Generate export packet from audit events
 */
export function generateExportPacket(
  events: AuditEvent[],
  config: ExportFormat,
  secretKey?: string,
): ExportPacket {
  const packetId = generatePacketId();

  // Apply transformations
  let processedEvents = events;
  if (config.redactPersonalData) {
    processedEvents = processedEvents.map(redactAuditEvent);
  }
  if (config.anonymizeUsers) {
    processedEvents = processedEvents.map(anonymizeAuditEvent);
  }

  // Format content
  let content: string;
  switch (config.format) {
    case 'csv':
      content = formatEventsAsCSV(processedEvents);
      break;
    case 'jsonl':
      content = formatEventsAsJSONL(processedEvents);
      break;
    default:
      content = formatEventsAsJSON(processedEvents);
  }

  // Compress content
  const { compressed, ratio } = simulateCompression(content, config.compressionType);
  const checksum = calculateChecksum(compressed);

  // Generate metadata
  const metadata: ExportPacketMetadata = {
    packetId,
    workspaceId: events[0]?.workspaceId || 'unknown',
    generatedAt: new Date(),
    exportFormat: config,
    totalEvents: events.length,
    totalPackets: 1,
    packetNumber: 1,
    eventCount: events.length,
    fileSizeBytes: Buffer.byteLength(compressed, 'utf8'),
    checksumSHA256: checksum,
    compressionRatio: config.compressionType !== 'none' ? ratio : undefined,
  };

  // Generate signature if secret key provided
  const signature = secretKey ? generateSignature(compressed, secretKey) : undefined;

  return {
    metadata,
    content: compressed,
    signature,
    integrityCheck: {
      algorithm: 'SHA256',
      value: checksum,
    },
  };
}

/**
 * Generate paginated export packets
 */
export function generatePaginatedPackets(
  events: AuditEvent[],
  config: ExportFormat,
  secretKey?: string,
): ExportPacket[] {
  const packets: ExportPacket[] = [];
  const pageSize = config.pageSize;
  const totalPages = Math.ceil(events.length / pageSize);

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const startIdx = pageNum * pageSize;
    const endIdx = Math.min(startIdx + pageSize, events.length);
    const pageEvents = events.slice(startIdx, endIdx);

    const packet = generateExportPacket(pageEvents, config, secretKey);
    packet.metadata.totalPackets = totalPages;
    packet.metadata.packetNumber = pageNum + 1;

    packets.push(packet);
  }

  return packets;
}

/**
 * Generate batch export result
 */
export function generateBatchExportResult(packets: ExportPacket[]): BatchExportResult {
  const totalEvents = packets.reduce((sum, p) => sum + p.metadata.eventCount, 0);

  return {
    exportId: `exp_${Date.now()}`,
    workspaceId: packets[0]?.metadata.workspaceId || 'unknown',
    status: 'completed',
    totalEvents,
    exportedEvents: totalEvents,
    packets,
    startTime: new Date(Date.now() - 30000),
    completionTime: new Date(),
    downloadUrl: `/exports/exp_${Date.now()}.zip`,
    retentionDays: 90,
  };
}

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/**
 * Generate mock audit events
 */
export function generateMockAuditEvents(count: number = 50): AuditEvent[] {
  const actions = ['CREATE', 'UPDATE', 'DELETE', 'READ', 'EXPORT', 'IMPORT', 'EXECUTE'];
  const resources = ['decision', 'action', 'workspace', 'user', 'report', 'integration'];
  const statuses: Array<'success' | 'failure' | 'denied'> = ['success', 'success', 'success', 'failure', 'denied'];

  const events: AuditEvent[] = [];

  for (let i = 0; i < count; i++) {
    const now = new Date();
    const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    events.push({
      eventId: `evt_${Date.now()}_${i}`,
      timestamp,
      workspaceId: `ws_${Math.floor(i / 10) + 1}`,
      userId: `user_${(i % 5) + 1}`,
      action: actions[i % actions.length]!,
      resource: resources[i % resources.length]!,
      resourceId: `res_${Math.floor(i / 2) + 1}`,
      status: statuses[i % statuses.length]!,
      details: {
        changes: Math.random() > 0.5,
        reason: `Automated audit event #${i + 1}`,
      },
      ipAddress: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      userAgent: `Mozilla/5.0 (Platform) AppleWebKit/537.36`,
    });
  }

  return events;
}

/**
 * Generate mock export with various configurations
 */
export function generateMockExportWithConfig(format: 'json' | 'csv' | 'jsonl' = 'json'): BatchExportResult {
  const events = generateMockAuditEvents(100);
  const config: ExportFormat = {
    format,
    includeDetails: true,
    includeChanges: false,
    redactPersonalData: true,
    anonymizeUsers: false,
    compressionType: 'gzip',
    pageSize: 50,
    timeRangeStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    timeRangeEnd: new Date(),
  };

  const packets = generatePaginatedPackets(events, config);
  return generateBatchExportResult(packets);
}

/**
 * Verify packet integrity
 */
export function verifyPacketIntegrity(packet: ExportPacket): boolean {
  if (!packet.integrityCheck) {
    return false;
  }

  const calculatedChecksum = calculateChecksum(packet.content);
  return calculatedChecksum === packet.integrityCheck.value;
}

/**
 * Verify packet signature
 */
export function verifyPacketSignature(packet: ExportPacket, secretKey: string): boolean {
  if (!packet.signature) {
    return false;
  }

  const calculatedSignature = generateSignature(packet.content, secretKey);
  return calculatedSignature === packet.signature;
}
