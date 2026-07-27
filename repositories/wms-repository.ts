import type { WmsState } from "@/domain/types";

export interface WmsRepository {
  read(): Promise<WmsState>;
  transact<T>(operation: (state: WmsState) => { state: WmsState; result: T }): Promise<T>;
}

export class InMemoryWmsRepository implements WmsRepository {
  constructor(private state: WmsState) {}

  async read() {
    return structuredClone(this.state);
  }

  async transact<T>(operation: (state: WmsState) => { state: WmsState; result: T }) {
    const next = operation(structuredClone(this.state));
    this.state = next.state;
    return next.result;
  }
}
