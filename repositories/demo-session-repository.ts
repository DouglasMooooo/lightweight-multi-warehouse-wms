import { createDemoSession, type DemoSession } from "@/domain/leadership-demo";

/** Per mounted browser demo. No server, database, credentials or ERP write-back. */
export class DemoSessionRepository {
  private session = createDemoSession();
  read(): DemoSession {
    return structuredClone(this.session);
  }
  transact(operation: (current: DemoSession) => DemoSession): DemoSession {
    const next = operation(this.read());
    this.session = structuredClone(next);
    return this.read();
  }
}
