import {
  createDemoSession,
  executeDemoCommand,
  type DemoCommand,
  type DemoSession,
} from "@/domain/leadership-demo";
import { DemoSessionRepository } from "@/repositories/demo-session-repository";

export class LeadershipDemoService {
  constructor(private repository = new DemoSessionRepository()) {}
  read(): DemoSession {
    return this.repository.read();
  }
  execute(command: DemoCommand): DemoSession {
    return this.repository.transact((current) =>
      executeDemoCommand(current, command),
    );
  }
  reset(): DemoSession {
    return this.repository.transact(() => createDemoSession());
  }
}
