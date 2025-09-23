import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Erase an event type (todo_app_event_types) by ID; permanently removes the
 * record.
 *
 * Permanently remove an event type from the Events taxonomy. This performs a
 * hard delete because the schema has no deleted_at column for
 * todo_app_event_types. It also guards against accidental history loss by
 * blocking deletion when dependent todo_app_business_events exist. Only system
 * administrators may invoke this operation.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.eventTypeId - UUID of the event type to delete
 * @returns Void on success (no content)
 * @throws {HttpException} 403 When caller is not an active system administrator
 * @throws {HttpException} 404 When the event type does not exist
 * @throws {HttpException} 409 When dependent business events exist for the type
 */
export async function deletetodoAppSystemAdminEventTypesEventTypeId(props: {
  systemAdmin: SystemadminPayload;
  eventTypeId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, eventTypeId } = props;

  // Authorization: verify active, non-revoked system admin membership and active user
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
  });
  if (membership === null) {
    throw new HttpException(
      "Unauthorized: System administrator membership required",
      403,
    );
  }

  // Ensure target exists
  const existing = await MyGlobal.prisma.todo_app_event_types.findUnique({
    where: { id: eventTypeId },
  });
  if (existing === null) {
    throw new HttpException("Not Found", 404);
  }

  // Guard against cascading history loss: block when dependents exist
  const dependentCount = await MyGlobal.prisma.todo_app_business_events.count({
    where: { todo_app_event_type_id: eventTypeId },
  });
  if (dependentCount > 0) {
    throw new HttpException(
      "Conflict: Cannot delete event type with existing business events; consider deactivating (active=false) instead",
      409,
    );
  }

  // Hard delete (no deleted_at in event types schema)
  await MyGlobal.prisma.todo_app_event_types.delete({
    where: { id: eventTypeId },
  });

  return; // explicit for clarity
}
