import type { SessionMetadata } from "../domain/refresh-session.js";

const MAX_IP_LENGTH = 45;
const MAX_USER_AGENT_LENGTH = 512;

export function normalizeSessionMetadata(metadata: SessionMetadata | undefined): SessionMetadata {
  const normalized: SessionMetadata = {};

  const ipAddress = metadata?.ipAddress?.trim();
  if (ipAddress) {
    normalized.ipAddress = ipAddress.slice(0, MAX_IP_LENGTH);
  }

  const userAgent = metadata?.userAgent?.trim();
  if (userAgent) {
    normalized.userAgent = userAgent.slice(0, MAX_USER_AGENT_LENGTH);
  }

  return normalized;
}
