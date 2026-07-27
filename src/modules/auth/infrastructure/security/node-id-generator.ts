import { randomUUID } from "node:crypto";
import type { IdGenerator } from "../../application/ports/id-generator.js";

export class NodeIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
