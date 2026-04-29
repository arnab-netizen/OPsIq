import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  validateRows,
  mapToRecords,
  ingestCSV,
  validateRecord,
  ingestCSVSafe,
} from '../csv';

describe('CSV Ingestion & Validation', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV', () => {
      const csv = '1000,500\n2000,600';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(['1000', '500']);
      expect(rows[1]).toEqual(['2000', '600']);
    });

    it('should handle whitespace', () => {
      const csv = '  1000  ,  500  \n  2000  ,  600  ';
      const rows = parseCSV(csv);

      expect(rows[0]).toEqual(['1000', '500']);
      expect(rows[1]).toEqual(['2000', '600']);
    });

    it('should skip empty lines', () => {
      const csv = '1000,500\n\n2000,600\n';
      const rows = parseCSV(csv);

      expect(rows).toHaveLength(2);
    });

    it('should return empty array for empty string', () => {
      const rows = parseCSV('');
      expect(rows).toEqual([]);
    });

    it('should return empty array for non-string input', () => {
      const rows = parseCSV(null as any);
      expect(rows).toEqual([]);
    });

    it('should handle rows with more than 2 columns', () => {
      const csv = '1000,500,note1\n2000,600,note2';
      const rows = parseCSV(csv);

      expect(rows[0]).toEqual(['1000', '500', 'note1']);
      expect(rows[1]).toEqual(['2000', '600', 'note2']);
    });
  });

  describe('validateRows', () => {
    it('should keep rows with >= 2 columns', () => {
      const rows = [
        ['1000', '500'],
        ['2000', '600', 'note'],
      ];
      const valid = validateRows(rows);

      expect(valid).toEqual(rows);
    });

    it('should filter rows with < 2 columns', () => {
      const rows = [
        ['1000', '500'],
        ['incomplete'],
        ['2000', '600'],
      ];
      const valid = validateRows(rows);

      expect(valid).toEqual([
        ['1000', '500'],
        ['2000', '600'],
      ]);
    });

    it('should filter empty rows', () => {
      const rows = [['1000', '500'], [], ['2000', '600']];
      const valid = validateRows(rows);

      expect(valid).toEqual([
        ['1000', '500'],
        ['2000', '600'],
      ]);
    });

    it('should return empty array for non-array input', () => {
      const valid = validateRows(null as any);
      expect(valid).toEqual([]);
    });
  });

  describe('mapToRecords', () => {
    it('should map valid rows to records', () => {
      const rows = [
        ['1000', '500'],
        ['2000', '600'],
      ];
      const records = mapToRecords(rows);

      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ revenue: 1000, cost: 500 });
      expect(records[1]).toEqual({ revenue: 2000, cost: 600 });
    });

    it('should parse numbers with decimals', () => {
      const rows = [['1234.56', '789.01']];
      const records = mapToRecords(rows);

      expect(records[0].revenue).toBe(1234.56);
      expect(records[0].cost).toBe(789.01);
    });

    it('should handle zero values', () => {
      const rows = [['0', '0']];
      const records = mapToRecords(rows);

      expect(records[0]).toEqual({ revenue: 0, cost: 0 });
    });

    it('should reject NaN in revenue', () => {
      const rows = [['invalid', '500']];

      expect(() => {
        mapToRecords(rows);
      }).toThrow('revenue "invalid" is not a valid number');
    });

    it('should reject NaN in cost', () => {
      const rows = [['1000', 'invalid']];

      expect(() => {
        mapToRecords(rows);
      }).toThrow('cost "invalid" is not a valid number');
    });

    it('should throw on empty string', () => {
      expect(() => {
        mapToRecords(null as any);
      }).toThrow();
    });

    it('should throw on row with < 2 columns', () => {
      const rows = [['1000']];

      expect(() => {
        mapToRecords(rows);
      }).toThrow('must have at least 2 columns');
    });

    it('should throw with row index in error', () => {
      const rows = [
        ['1000', '500'],
        ['invalid', '600'],
      ];

      expect(() => {
        mapToRecords(rows);
      }).toThrow('Row 1 invalid');
    });

    it('should ignore extra columns', () => {
      const rows = [['1000', '500', 'note', 'extra']];
      const records = mapToRecords(rows);

      expect(records[0]).toEqual({ revenue: 1000, cost: 500 });
    });
  });

  describe('ingestCSV', () => {
    it('should complete pipeline: parse -> validate -> map', () => {
      const csv = '1000,500\n2000,600';
      const records = ingestCSV(csv);

      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ revenue: 1000, cost: 500 });
    });

    it('should filter invalid rows in pipeline', () => {
      const csv = '1000,500\nincomplete\n2000,600';
      const records = ingestCSV(csv);

      expect(records).toHaveLength(2);
    });

    it('should throw on invalid numbers in pipeline', () => {
      const csv = '1000,invalid\n2000,600';

      expect(() => {
        ingestCSV(csv);
      }).toThrow('not a valid number');
    });

    it('should handle whitespace throughout pipeline', () => {
      const csv = '  1000  ,  500  \n  2000  ,  600  ';
      const records = ingestCSV(csv);

      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ revenue: 1000, cost: 500 });
    });
  });

  describe('validateRecord', () => {
    it('should validate correct record', () => {
      const record = { revenue: 1000, cost: 500 };
      expect(validateRecord(record)).toBe(true);
    });

    it('should reject record with missing fields', () => {
      const record = { revenue: 1000 };
      expect(validateRecord(record)).toBe(false);
    });

    it('should reject record with NaN', () => {
      const record = { revenue: NaN, cost: 500 };
      expect(validateRecord(record)).toBe(false);
    });

    it('should reject non-numeric revenue', () => {
      const record = { revenue: '1000', cost: 500 };
      expect(validateRecord(record)).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(validateRecord(null)).toBe(false);
      expect(validateRecord(undefined)).toBe(false);
    });
  });

  describe('ingestCSVSafe', () => {
    it('should return records and errors separately', () => {
      const csv = '1000,500\ninvalid,600\n2000,700';
      const result = ingestCSVSafe(csv);

      expect(result.records).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
    });

    it('should not throw on invalid data', () => {
      const csv = 'invalid,invalid\ninvalid,invalid';

      expect(() => {
        ingestCSVSafe(csv);
      }).not.toThrow();
    });

    it('should collect multiple errors', () => {
      const csv = 'invalid1,600\ninvalid2,700';
      const result = ingestCSVSafe(csv);

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.records).toHaveLength(0);
    });

    it('should continue after errors', () => {
      const csv = '1000,500\ninvalid,600\n2000,700';
      const result = ingestCSVSafe(csv);

      expect(result.records).toContainEqual({ revenue: 1000, cost: 500 });
      expect(result.records).toContainEqual({ revenue: 2000, cost: 700 });
    });

    it('should handle parse errors', () => {
      const result = ingestCSVSafe(null as any);

      expect(result.records).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Determinism', () => {
    it('should produce same output for same input', () => {
      const csv = '1000,500\n2000,600\n3000,700';

      const result1 = ingestCSV(csv);
      const result2 = ingestCSV(csv);

      expect(result1).toEqual(result2);
    });

    it('should be deterministic with decimals', () => {
      const csv = '1234.5678,9876.5432';

      const result1 = ingestCSV(csv);
      const result2 = ingestCSV(csv);

      expect(result1).toEqual(result2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative numbers', () => {
      const csv = '-1000,500\n1000,-600';
      const records = ingestCSV(csv);

      expect(records[0]).toEqual({ revenue: -1000, cost: 500 });
      expect(records[1]).toEqual({ revenue: 1000, cost: -600 });
    });

    it('should handle very large numbers', () => {
      const csv = '999999999999,888888888888';
      const records = ingestCSV(csv);

      expect(records[0].revenue).toBe(999999999999);
    });

    it('should handle scientific notation', () => {
      const csv = '1e3,5e2';
      const records = ingestCSV(csv);

      expect(records[0]).toEqual({ revenue: 1000, cost: 500 });
    });

    it('should reject empty cells', () => {
      const csv = ',500\n1000,';
      const result = ingestCSVSafe(csv);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
