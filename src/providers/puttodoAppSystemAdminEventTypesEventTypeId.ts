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
 * Update a single event type (todo_app_event_types) by ID.
 *
 * Updates mutable attributes (code, name, description, active) of a business
 * event taxonomy record. Only system administrators may perform this operation.
 * Uniqueness of `code` is enforced; attempting to set a duplicate code results
 * in a 409 conflict.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated System Admin payload
 * @param props.eventTypeId - UUID of the event type to update
 * @param props.body - Partial update payload for the event type
 * @returns The updated ITodoAppEventType object
 * @throws {HttpException} 403 When the caller is not an active system admin
 * @throws {HttpException} 404 When the target event type does not exist
 * @throws {HttpException} 409 When attempting to set a duplicate `code`
 */
export async function puttodoAppSystemAdminEventTypesEventTypeId(props: {
  systemAdmin: SystemadminPayload;
  eventTypeId: string & tags.Format<"uuid">;
  body: ITodoAppEventType.IUpdate;
}): Promise<ITodoAppEventType> {
  const { systemAdmin, eventTypeId, body } = props;

  // Authorization: ensure current system admin membership and healthy user state
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
      "Forbidden: Requires active system administrator",
      403,
    );
  }

  // Ensure target exists
  const existing = await MyGlobal.prisma.todo_app_event_types.findUnique({
    where: { id: eventTypeId },
  });
  if (!existing) {
    throw new HttpException("Not Found: Event type does not exist", 404);
  }

  // Uniqueness pre-check if code is changing
  if (body.code !== undefined) {
    const conflict = await MyGlobal.prisma.todo_app_event_types.findFirst({
      where: {
        code: body.code,
        NOT: { id: eventTypeId },
      },
    });
    if (conflict) {
      throw new HttpException("Conflict: 'code' already exists", 409);
    }
  }

  const now = toISOStringSafe(new Date());

  try {
    const updated = await MyGlobal.prisma.todo_app_event_types.update({
      where: { id: eventTypeId },
      data: {
        code: body.code ?? undefined,
        name: body.name ?? undefined,
        description: body.description ?? undefined, // null clears, undefined skips
        active: body.active ?? undefined,
        updated_at: now,
      },
    });

    // Build response with proper date conversions and null handling
    const output = typia.assert<ITodoAppEventType>({
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description:
        updated.description === null ? null : (updated.description ?? null),
      active: updated.active,
      created_at: toISOStringSafe(updated.created_at),
      updated_at: toISOStringSafe(updated.updated_at),
    });
    return output;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint failed on the fields: (`code`)
      throw new HttpException("Conflict: 'code' already exists", 409);
    }
    // Propagate as 500 with minimal leakage
    throw err;
  }
}
