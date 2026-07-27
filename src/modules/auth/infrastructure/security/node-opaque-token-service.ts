import { createHash, randomBytes } from "node:crypto";
import type {
  OpaqueToken,
  OpaqueTokenNamespace,
  OpaqueTokenService,
} from "../../application/ports/opaque-token-service.js";

const PREFIXES: Record<OpaqueTokenNamespace, string> = {
  refresh: "rt",
  email_verification: "ev",
  password_reset: "pr",
};

export class NodeOpaqueTokenService implements OpaqueTokenService {
  issue(namespace: OpaqueTokenNamespace): OpaqueToken {
    const value = `${PREFIXES[namespace]}_${randomBytes(32).toString("base64url")}`;

    return {
      value,
      hash: this.hash(value),
    };
  }

  hash(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}
