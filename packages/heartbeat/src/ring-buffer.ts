/**
 * Bounded ring buffer for diagnostics (Decision 13A).
 *
 * Fixed capacity, oldest entries drop on overflow.
 * Immutable externally — toArray() returns a frozen copy.
 */

export class RingBuffer<T> {
  private readonly _items: (T | undefined)[];
  private readonly _capacity: number;
  private _head = 0;
  private _size = 0;

  constructor(capacity: number) {
    if (capacity < 1 || !Number.isInteger(capacity)) {
      throw new RangeError(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this._capacity = capacity;
    this._items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this._size;
  }

  get capacity(): number {
    return this._capacity;
  }

  push(item: T): void {
    this._items[this._head] = item;
    this._head = (this._head + 1) % this._capacity;
    if (this._size < this._capacity) {
      this._size++;
    }
  }

  toArray(): readonly T[] {
    if (this._size === 0) return Object.freeze([]);

    const result: T[] = [];
    // If buffer is not full, items start at 0
    // If buffer is full, items start at _head (oldest)
    const start = this._size < this._capacity ? 0 : this._head;
    for (let i = 0; i < this._size; i++) {
      const idx = (start + i) % this._capacity;
      result.push(this._items[idx] as T);
    }
    return Object.freeze(result);
  }

  clear(): void {
    this._items.fill(undefined);
    this._head = 0;
    this._size = 0;
  }
}
