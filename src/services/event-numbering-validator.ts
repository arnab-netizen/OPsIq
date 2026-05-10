/**
 * EventNumberingValidator: Validate event number ordering at application level
 * Complements database-level sequence enforcement
 * Ensures eventNumber is monotonically increasing within aggregate scope
 */
export class EventNumberingValidator {
  private static aggregateEventCounters = new Map<string, number>();

  /**
   * Reset counter for testing
   */
  static reset(): void {
    this.aggregateEventCounters.clear();
  }

  /**
   * Validate event number is sequential for an aggregate
   * Returns true if valid, throws if ordering violation detected
   */
  static validateEventNumber(
    aggregateId: string,
    aggregateType: string,
    eventNumber: number
  ): boolean {
    const key = `${aggregateType}:${aggregateId}`;
    const lastEventNumber = this.aggregateEventCounters.get(key) ?? 0;

    if (eventNumber <= lastEventNumber) {
      throw new Error(
        `EventNumberingValidator: Event number ${eventNumber} is not sequential for aggregate ` +
        `${aggregateType}:${aggregateId}. Last event number was ${lastEventNumber}. ` +
        `Event numbers must be monotonically increasing.`
      );
    }

    // Update counter
    this.aggregateEventCounters.set(key, eventNumber);

    return true;
  }

  /**
   * Get the last known event number for an aggregate
   */
  static getLastEventNumber(
    aggregateId: string,
    aggregateType: string
  ): number {
    const key = `${aggregateType}:${aggregateId}`;
    return this.aggregateEventCounters.get(key) ?? 0;
  }

  /**
   * Validate a sequence of events maintains strict ordering
   * Used for batch validation or replay verification
   */
  static validateSequence(events: Array<{
    aggregateId: string;
    aggregateType: string;
    eventNumber: number;
  }>): boolean {
    if (events.length === 0) {
      return true;
    }

    // Group by aggregate
    const byAggregate = new Map<string, typeof events>();
    for (const event of events) {
      const key = `${event.aggregateType}:${event.aggregateId}`;
      if (!byAggregate.has(key)) {
        byAggregate.set(key, []);
      }
      byAggregate.get(key)!.push(event);
    }

    // Validate ordering within each aggregate
    for (const [key, aggregateEvents] of byAggregate) {
      for (let i = 1; i < aggregateEvents.length; i++) {
        const prev = aggregateEvents[i - 1];
        const curr = aggregateEvents[i];

        if (curr.eventNumber <= prev.eventNumber) {
          throw new Error(
            `EventNumberingValidator: Sequence violation in ${key}. ` +
            `Event at index ${i-1} has number ${prev.eventNumber}, ` +
            `but event at index ${i} has number ${curr.eventNumber}. ` +
            `Must be strictly increasing.`
          );
        }
      }
    }

    return true;
  }
}
