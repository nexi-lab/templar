/**
 * Bounded FIFO queue with drop-oldest overflow strategy.
 */
export class BoundedFifoQueue<T> {
  private items: readonly T[];
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError(`Queue capacity must be positive, got ${capacity}`);
    }
    this.capacity = capacity;
    this.items = [];
  }

  /**
   * Add an item to the queue.
   * If the queue is full, drops the oldest item and returns it.
   * Returns undefined if no item was dropped.
   */
  enqueue(item: T): T | undefined {
    if (this.items.length >= this.capacity) {
      const [dropped, ...rest] = this.items;
      this.items = [...rest, item];
      return dropped;
    }
    this.items = [...this.items, item];
    return undefined;
  }

  /**
   * Remove and return the oldest item, or undefined if empty.
   */
  dequeue(): T | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    const [first, ...rest] = this.items;
    this.items = rest;
    return first;
  }

  /**
   * Peek at the oldest item without removing it.
   */
  peek(): T | undefined {
    return this.items[0];
  }

  /**
   * Drain all items from the queue in FIFO order.
   */
  drain(): readonly T[] {
    const result = this.items;
    this.items = [];
    return result;
  }

  get size(): number {
    return this.items.length;
  }

  get isFull(): boolean {
    return this.items.length >= this.capacity;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }
}
