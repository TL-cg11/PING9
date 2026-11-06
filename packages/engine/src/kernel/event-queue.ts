// 가상 시각이 같으면 먼저 예약된 사건부터 꺼내는 최소 힙 (AD-5).
export interface OrderedEvent {
  readonly time: number;
  readonly order: number;
}

const before = (a: OrderedEvent, b: OrderedEvent): boolean =>
  a.time < b.time || (a.time === b.time && a.order < b.order);

export class EventQueue<T extends OrderedEvent> {
  private readonly items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  push(event: T): void {
    let index = this.items.length;
    this.items.push(event);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!before(event, this.items[parent]!)) break;
      this.items[index] = this.items[parent]!;
      index = parent;
    }
    this.items[index] = event;
  }

  pop(): T | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length === 0 || last === undefined) return first;

    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      const child = right < this.items.length && before(this.items[right]!, this.items[left]!) ? right : left;
      if (!before(this.items[child]!, last)) break;
      this.items[index] = this.items[child]!;
      index = child;
    }
    this.items[index] = last;
    return first;
  }

  clear(): void {
    this.items.length = 0;
  }
}
