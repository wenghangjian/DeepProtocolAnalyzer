export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): boolean {
    if (this.size < this.capacity) {
      this.buffer[this.size++] = item;
      return true;
    }
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    return false;
  }

  getAll(): T[] {
    return this.buffer.slice(0, this.size);
  }

  clear() {
    this.size = 0;
    this.head = 0;
  }

  isFull(): boolean {
    return this.size >= this.capacity;
  }
}
