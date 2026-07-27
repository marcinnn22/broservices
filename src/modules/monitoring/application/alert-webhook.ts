import { z } from "zod";

import type { Logger } from "../../../platform/observability/logger.js";

const labelSetSchema = z.record(z.string(), z.string().max(2_048));

const alertSchema = z
  .object({
    status: z.enum(["firing", "resolved"]),
    labels: labelSetSchema,
    annotations: labelSetSchema.default({}),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    generatorURL: z.string().max(4_096),
    fingerprint: z.string().max(512),
  })
  .passthrough();

export const alertWebhookSchema = z
  .object({
    version: z.string().max(32),
    groupKey: z.string().max(2_048),
    truncatedAlerts: z.number().int().nonnegative().optional(),
    status: z.enum(["firing", "resolved"]),
    receiver: z.string().max(512),
    groupLabels: labelSetSchema,
    commonLabels: labelSetSchema,
    commonAnnotations: labelSetSchema,
    externalURL: z.string().max(4_096),
    alerts: z.array(alertSchema).max(1_000),
  })
  .passthrough();

export type AlertWebhookPayload = z.infer<typeof alertWebhookSchema>;

export interface AlertWebhookContext {
  readonly requestId: string;
}

export type AlertWebhookHandler = (
  payload: AlertWebhookPayload,
  context: AlertWebhookContext,
) => void | Promise<void>;

export function createLoggingAlertWebhook(logger: Logger): AlertWebhookHandler {
  return (payload, context): void => {
    const firing = payload.alerts.filter((alert) => alert.status === "firing").length;

    logger.warn("Alertmanager webhook received", {
      requestId: context.requestId,
      receiver: payload.receiver,
      status: payload.status,
      alertCount: payload.alerts.length,
      firingCount: firing,
      resolvedCount: payload.alerts.length - firing,
      truncatedAlerts: payload.truncatedAlerts ?? 0,
    });
  };
}
