import { describe, it, expect } from 'vitest';
import { normalizeMoney, normalizeMoneyBatch, sumNormalizedMoney } from '../normalize';

describe('normalizeMoney - Financial Normalization Engine v2', () => {
  const baseFxRates = {
    USD: 1.0,
    EUR: 1.1,
    GBP: 1.3,
    JPY: 0.0094,
    INR: 0.012,
  };

  describe('Basic Normalization', () => {
    it('should normalize USD to USD (identity)', () => {
      const result = normalizeMoney({
        amount: 1000,
        currency: 'USD',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('USD');
      expect(result.baseAmount).toBe(1000);
      expect(result.fxRate).toBe(1);
    });

    it('should convert EUR to USD', () => {
      const result = normalizeMoney({
        amount: 1000,
        currency: 'EUR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      // 1000 EUR at rate 1.1 → 1000 * 1 / 1.1 = 909.09 USD
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('EUR');
      expect(result.baseAmount).toBeCloseTo(909.09, 1);
      expect(result.fxRate).toBe(1.1);
    });

    it('should convert GBP to USD', () => {
      const result = normalizeMoney({
        amount: 1000,
        currency: 'GBP',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      // 1000 GBP at rate 1.3 → 1000 * 1 / 1.3 = 769.23 USD
      expect(result.amount).toBe(1000);
      expect(result.baseAmount).toBeCloseTo(769.23, 1);
      expect(result.fxRate).toBe(1.3);
    });

    it('should convert JPY to USD', () => {
      const result = normalizeMoney({
        amount: 100000,
        currency: 'JPY',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      // 100000 JPY at rate 0.0094 → 100000 * 1 / 0.0094 = 10,638,297.87 USD
      expect(result.amount).toBe(100000);
      expect(result.currency).toBe('JPY');
      expect(result.baseAmount).toBeCloseTo(10638297.87, 1);
      expect(result.fxRate).toBe(0.0094);
    });

    it('should convert INR to USD', () => {
      const result = normalizeMoney({
        amount: 100000,
        currency: 'INR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      // 100000 INR at rate 0.012 → 100000 * 1 / 0.012 = 8,333,333.33 USD
      expect(result.amount).toBe(100000);
      expect(result.baseAmount).toBeCloseTo(8333333.33, 0);
    });
  });

  describe('Multi-Currency Conversions', () => {
    it('should convert EUR to GBP via rates', () => {
      const result = normalizeMoney({
        amount: 1000,
        currency: 'EUR',
        baseCurrency: 'GBP',
        fxRates: baseFxRates,
      });

      // 1000 EUR to GBP: 1000 * 1.3 / 1.1 = 1181.82 GBP
      expect(result.baseAmount).toBeCloseTo(1181.82, 1);
    });

    it('should convert GBP to EUR via rates', () => {
      const result = normalizeMoney({
        amount: 1000,
        currency: 'GBP',
        baseCurrency: 'EUR',
        fxRates: baseFxRates,
      });

      // 1000 GBP to EUR: 1000 * 1.1 / 1.3 = 846.15 EUR
      expect(result.baseAmount).toBeCloseTo(846.15, 1);
    });
  });

  describe('Precision', () => {
    it('should round to 4 decimal places', () => {
      const result = normalizeMoney({
        amount: 1234.5678,
        currency: 'EUR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      // Check that baseAmount is rounded to 4 decimals
      const decimalPlaces = (result.baseAmount.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should maintain precision with FX rates', () => {
      const result = normalizeMoney({
        amount: 999.9999,
        currency: 'EUR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      expect(result.fxRate).toBe(1.1);
      expect(result.baseAmount).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw if source currency FX rate missing', () => {
      expect(() => {
        normalizeMoney({
          amount: 1000,
          currency: 'CAD',
          baseCurrency: 'USD',
          fxRates: baseFxRates,
        });
      }).toThrow('FX rate missing for currency: CAD');
    });

    it('should throw if base currency FX rate missing', () => {
      expect(() => {
        normalizeMoney({
          amount: 1000,
          currency: 'EUR',
          baseCurrency: 'CAD',
          fxRates: baseFxRates,
        });
      }).toThrow('FX rate missing for base currency: CAD');
    });

    it('should throw on empty FX rates', () => {
      expect(() => {
        normalizeMoney({
          amount: 1000,
          currency: 'USD',
          baseCurrency: 'USD',
          fxRates: {},
        });
      }).toThrow();
    });
  });

  describe('Batch Normalization', () => {
    it('should normalize multiple amounts', () => {
      const results = normalizeMoneyBatch([
        {
          amount: 1000,
          currency: 'USD',
          baseCurrency: 'USD',
          fxRates: baseFxRates,
        },
        {
          amount: 1000,
          currency: 'EUR',
          baseCurrency: 'USD',
          fxRates: baseFxRates,
        },
        {
          amount: 1000,
          currency: 'GBP',
          baseCurrency: 'USD',
          fxRates: baseFxRates,
        },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].amount).toBe(1000);
      expect(results[1].amount).toBe(1000);
      expect(results[2].amount).toBe(1000);
      expect(results[0].baseAmount).toBe(1000); // USD identity
      expect(results[1].baseAmount).toBeCloseTo(909.09, 1); // EUR
      expect(results[2].baseAmount).toBeCloseTo(769.23, 1); // GBP
    });

    it('should propagate error from any item in batch', () => {
      expect(() => {
        normalizeMoneyBatch([
          {
            amount: 1000,
            currency: 'USD',
            baseCurrency: 'USD',
            fxRates: baseFxRates,
          },
          {
            amount: 1000,
            currency: 'CAD', // Missing rate
            baseCurrency: 'USD',
            fxRates: baseFxRates,
          },
        ]);
      }).toThrow('FX rate missing');
    });
  });

  describe('Sum Normalization', () => {
    it('should sum amounts in base currency', () => {
      const result = sumNormalizedMoney(
        [
          { amount: 1000, currency: 'USD' },
          { amount: 1000, currency: 'EUR' },
          { amount: 1000, currency: 'GBP' },
        ],
        'USD',
        baseFxRates
      );

      // 1000 USD + 909.09 EUR + 769.23 GBP = 2678.32 USD
      expect(result.baseAmount).toBeCloseTo(2678.32, 0);
      expect(result.currency).toBe('USD');
    });

    it('should handle empty amounts', () => {
      const result = sumNormalizedMoney([], 'USD', baseFxRates);

      expect(result.amount).toBe(0);
      expect(result.baseAmount).toBe(0);
      expect(result.fxRate).toBe(1);
    });

    it('should throw if any amount has missing rate', () => {
      expect(() => {
        sumNormalizedMoney(
          [
            { amount: 1000, currency: 'USD' },
            { amount: 1000, currency: 'CAD' }, // Missing
          ],
          'USD',
          baseFxRates
        );
      }).toThrow('FX rate missing');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amounts', () => {
      const result = normalizeMoney({
        amount: 0,
        currency: 'EUR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      expect(result.baseAmount).toBe(0);
    });

    it('should handle negative amounts', () => {
      const result = normalizeMoney({
        amount: -1000,
        currency: 'EUR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      expect(result.amount).toBe(-1000);
      expect(result.baseAmount).toBeLessThan(0);
    });

    it('should handle very large amounts', () => {
      const result = normalizeMoney({
        amount: 1000000000,
        currency: 'USD',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      });

      expect(result.baseAmount).toBe(1000000000);
    });

    it('should handle very small FX rates', () => {
      const smallRates = { ...baseFxRates, XXX: 0.00001 };

      const result = normalizeMoney({
        amount: 100,
        currency: 'XXX',
        baseCurrency: 'USD',
        fxRates: smallRates,
      });

      expect(result.baseAmount).toBeCloseTo(10000000, 0);
    });
  });

  describe('Determinism', () => {
    it('should produce same result for same inputs', () => {
      const input = {
        amount: 1234.5678,
        currency: 'EUR',
        baseCurrency: 'USD',
        fxRates: baseFxRates,
      };

      const result1 = normalizeMoney(input);
      const result2 = normalizeMoney(input);

      expect(result1).toEqual(result2);
    });

    it('should be deterministic across multiple calls', () => {
      const inputs = [
        { amount: 1000, currency: 'USD' },
        { amount: 2000, currency: 'EUR' },
        { amount: 3000, currency: 'GBP' },
      ];

      const result1 = sumNormalizedMoney(inputs, 'USD', baseFxRates);
      const result2 = sumNormalizedMoney(inputs, 'USD', baseFxRates);

      expect(result1.baseAmount).toBe(result2.baseAmount);
    });
  });
});
