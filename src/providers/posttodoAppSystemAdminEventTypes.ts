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
 * Create a new event type (todo_app_event_types)
 *
 * Inserts a new taxonomy entry used to classify business-domain events.
 * Requires a system administrator. Ensures the `code` is unique by relying on
 * the database constraint and mapping violations to a 409 Conflict.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Event type creation payload (code, name, optional
 *   description, active)
 * @returns The created event type record including server-generated id and
 *   timestamps
 * @throws {HttpException} 401/403 when not authorized as an active system admin
 * @throws {HttpException} 409 when the provided code already exists
 * @throws {HttpException} 500 for unexpected errors
 */
export async function posttodoAppSystemAdminEventTypes(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppEventType.ICreate;
}): Promise<ITodoAppEventType> {
  const { systemAdmin, body } = props;

  // Authorization: must be an active, non-revoked system admin with valid user state
  const adminMembership = await MyGlobal.prisma.todo_app_systemadmins.findFirst(
    {
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
    },
  );
  if (!adminMembership) {
    throw new HttpException(
      "Unauthorized: System admin privileges required",
      403,
    );
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const id: string & tags.Format<"uuid"> = v4();

  try {
    const created = await MyGlobal.prisma.todo_app_event_types.create({
      data: {
        id,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        active: body.active,
        created_at: now,
        updated_at: now,
      },
      select: {
        // Note: Dates from Prisma are Date objects; we will reuse prepared values instead
        id: true,
        code: true,
        name: true,
        description: true,
        active: true,
      },
    });

    // Build response using precomputed id/now to ensure correct date-time strings
    const response: ITodoAppEventType = {
      id,
      code: created.code,
      name: created.name,
      description: created.description ?? null,
      active: created.active,
      created_at: now,
      updated_at: now,
    };
    return response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // Unique constraint failed (likely on `code`)
        throw new HttpException(
          "Conflict: Event type code already exists",
          409,
        );
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
