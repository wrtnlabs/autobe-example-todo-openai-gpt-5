import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAggregatedMetric";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get details of a single aggregated metric (todo_app_aggregated_metrics) by ID
 *
 * Retrieves an aggregated metric snapshot by its UUID identifier. Accessible to
 * system administrators only. If the record does not exist or is archived (soft
 * deleted), a not-found error is raised. No modifications are performed.
 *
 * Authorization: Requires a valid System Admin identity. The admin must have an
 * active, non-revoked membership and the owning user account must be active,
 * verified, and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.aggregatedMetricId - UUID of the aggregated metric snapshot
 * @returns The complete aggregated metric snapshot
 * @throws {HttpException} 403 when the caller is not an active system admin
 * @throws {HttpException} 404 when the record is not found or archived
 */
export async function gettodoAppSystemAdminAggregatedMetricsAggregatedMetricId(props: {
  systemAdmin: SystemadminPayload;
  aggregatedMetricId: string & tags.Format<"uuid">;
}): Promise<ITodoAppAggregatedMetric> {
  const { systemAdmin, aggregatedMetricId } = props;

  // Authorization: ensure caller is an active System Admin and owning user is valid
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: {
        is: {
          deleted_at: null,
          status: "active",
          email_verified: true,
        },
      },
    },
  });
  if (membership === null) {
    throw new HttpException("Forbidden: System admin membership required", 403);
  }

  // Fetch the aggregated metric, respecting soft delete
  const found = await MyGlobal.prisma.todo_app_aggregated_metrics.findFirst({
    where: {
      id: aggregatedMetricId,
      deleted_at: null,
    },
  });
  if (found === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date-time conversions
  return {
    id: found.id as string & tags.Format<"uuid">,
    todo_app_user_id:
      found.todo_app_user_id === null
        ? null
        : (found.todo_app_user_id as string & tags.Format<"uuid">),
    todo_app_event_type_id:
      found.todo_app_event_type_id === null
        ? null
        : (found.todo_app_event_type_id as string & tags.Format<"uuid">),
    metric_key: found.metric_key,
    granularity: found.granularity,
    period_start: toISOStringSafe(found.period_start),
    period_end: toISOStringSafe(found.period_end),
    value: found.value,
    unit: found.unit,
    created_at: toISOStringSafe(found.created_at),
    updated_at: toISOStringSafe(found.updated_at),
    deleted_at: found.deleted_at ? toISOStringSafe(found.deleted_at) : null,
  };
}
