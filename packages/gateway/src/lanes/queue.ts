/**
 * Bounded FIFO queue backed by a ring buffer.
 *
 * O(1) enqueue, dequeue, and peek.
 * Drop-oldest overflow strategy when full.
 */
export class BoundedFifoQueue<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError(`Queue capacity must be positive, got ${capacity}`);
    }
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity);
  }

  /**
   * Add an item to the queue.
   * If the queue is full, drops the oldest item and returns it.
   * Returns undefined if no item was dropped.
   */
  enqueue(item: T): T | undefined {
    let dropped: T | undefined;

    if (this.count >= this.capacity) {
      // Drop oldest (at head)
      dropped = this.buffer[this.head];
      this.buffer[this.head] = undefined;
      this.head = (this.head + 1) % this.capacity;
      this.count--;
    }

    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.count++;

    return dropped;
  }

  /**
   * Remove and return the oldest item, or undefined if empty.
   */
  dequeue(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }

  /**
   * Peek at the oldest item without removing it.
   */
  peek(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }
    return this.buffer[this.head];
  }

  /**
   * Drain all items from the queue in FIFO order.
   */
  drain(): readonly T[] {
    if (this.count === 0) {
      return [];
    }
    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity] as T;
    }
    // Reset ring buffer state
    this.buffer.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    return result;
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count >= this.capacity;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }
}
