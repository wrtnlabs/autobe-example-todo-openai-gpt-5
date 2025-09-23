import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get event type details (todo_app_event_types) by ID
 *
 * Retrieve a detailed event type definition from the todo_app_event_types model
 * using its primary key. Includes code (unique), name, optional description,
 * active flag, and timestamps. Access restricted to authenticated System
 * Admins.
 *
 * Authorization: verifies the caller holds an active system admin assignment
 * and that the owning user account is active, verified, and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin payload (user id)
 * @param props.eventTypeId - UUID of the target event type
 * @returns The complete event type record
 * @throws {HttpException} 403 when the caller lacks system admin privileges
 * @throws {HttpException} 404 when the event type does not exist
 */
export async function gettodoAppSystemAdminEventTypesEventTypeId(props: {
  systemAdmin: SystemadminPayload;
  eventTypeId: string & tags.Format<"uuid">;
}): Promise<ITodoAppEventType> {
  const { systemAdmin, eventTypeId } = props;

  // Authorization: ensure active system admin membership and healthy owner user
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

  // Fetch the event type by primary key
  const row = await MyGlobal.prisma.todo_app_event_types.findUnique({
    where: { id: eventTypeId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      active: true,
      created_at: true,
      updated_at: true,
    },
  });
  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper branding and date conversions
  return {
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    active: row.active,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
