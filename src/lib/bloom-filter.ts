export class BloomFilter {
  private readonly bits: Uint8Array;
  private readonly size: number;
  private readonly hashCount: number;

  constructor(size = 1 << 20, hashCount = 3) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  add(value: string): void {
    for (const index of this.indexes(value)) {
      this.bits[index >> 3] |= 1 << (index & 7);
    }
  }

  has(value: string): boolean {
    for (const index of this.indexes(value)) {
      if ((this.bits[index >> 3] & (1 << (index & 7))) === 0) {
        return false;
      }
    }
    return true;
  }

  private indexes(value: string): number[] {
    const out: number[] = [];
    for (let seed = 0; seed < this.hashCount; seed += 1) {
      out.push(this.fnv1a(`${seed}:${value}`) % this.size);
    }
    return out;
  }

  private fnv1a(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }
}
