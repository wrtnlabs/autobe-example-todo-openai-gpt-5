import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppBusinessEvent";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a single business event (todo_app_business_events) by ID.
 *
 * Fetches a specific append-only business event for administrative auditing and
 * diagnostics. Requires a valid System Admin context. Returns classification,
 * optional actor/target/session references, timestamps, and client metadata.
 *
 * Authorization:
 *
 * - Caller must be a system administrator (validated via payload.type and active
 *   membership)
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated System Admin payload
 * @param props.businessEventId - UUID of the business event to retrieve
 * @returns Detailed ITodoAppBusinessEvent record
 * @throws {HttpException} 403 When caller lacks admin privileges
 * @throws {HttpException} 404 When the business event is not found
 */
export async function gettodoAppSystemAdminBusinessEventsBusinessEventId(props: {
  systemAdmin: SystemadminPayload;
  businessEventId: string & tags.Format<"uuid">;
}): Promise<ITodoAppBusinessEvent> {
  const { systemAdmin, businessEventId } = props;

  // Basic role check
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Ensure active System Admin membership and healthy owning user account
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: {
        deleted_at: null,
        status: "active",
        email_verified: true,
      },
    },
    select: { id: true },
  });
  if (membership === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the event by ID
  const row = await MyGlobal.prisma.todo_app_business_events.findUnique({
    where: { id: businessEventId },
  });
  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  // Map to DTO with proper branding and date conversions (no native Date usage)
  const id = typia.assert<string & tags.Format<"uuid">>(row.id);
  const eventTypeId = typia.assert<string & tags.Format<"uuid">>(
    row.todo_app_event_type_id,
  );
  const userId =
    row.todo_app_user_id === null
      ? null
      : typia.assert<string & tags.Format<"uuid">>(row.todo_app_user_id);
  const todoId =
    row.todo_app_todo_id === null
      ? null
      : typia.assert<string & tags.Format<"uuid">>(row.todo_app_todo_id);
  const sessionId =
    row.todo_app_session_id === null
      ? null
      : typia.assert<string & tags.Format<"uuid">>(row.todo_app_session_id);

  return {
    id,
    todo_app_event_type_id: eventTypeId,
    todo_app_user_id: userId,
    todo_app_todo_id: todoId,
    todo_app_session_id: sessionId,
    occurred_at: toISOStringSafe(row.occurred_at),
    message: row.message ?? null,
    source: row.source ?? null,
    external_id: row.external_id ?? null,
    ip: row.ip ?? null,
    user_agent: row.user_agent ?? null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
