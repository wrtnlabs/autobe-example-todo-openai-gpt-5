import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAuditEvent";
import { IEAuditEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAuditEventType";
import { AdminPayload } from "../decorators/payload/AdminPayload";

export async function getTodoMvpAdminAuditEventsAuditEventId(props: {
  admin: AdminPayload;
  auditEventId: string & tags.Format<"uuid">;
}): Promise<ITodoMvpAuditEvent> {
  const { admin, auditEventId } = props;

  /** Narrow and validate the UUID format without using type assertions. */
  const ensureUuid = (value: string): string & tags.Format<"uuid"> =>
    typia.assert<string & tags.Format<"uuid">>(value);
  const uuidOrNull = (
    value: string | null | undefined,
  ): (string & tags.Format<"uuid">) | null | undefined => {
    if (value === null || value === undefined) return value;
    return typia.assert<string & tags.Format<"uuid">>(value);
  };

  const ensureEventType = (value: string): IEAuditEventType => {
    switch (value) {
      case "todo_created":
      case "todo_updated":
      case "todo_completed":
      case "todo_uncompleted":
      case "todo_deleted":
        return value;
      default:
        throw new HttpException(
          "Internal Server Error: Invalid event_type value",
          500,
        );
    }
  };

  // Validate path parameter (defensive; DTO already brands it)
  const requestedId = ensureUuid(auditEventId);

  // Authorization: ensure admin exists, active, and not soft-deleted
  const adminExists = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: admin.id,
      status: "active",
      deleted_at: null,
    },
    select: { id: true },
  });
  if (adminExists === null)
    throw new HttpException("Forbidden: Admin not authorized", 403);

  // Fetch audit event by id, exclude soft-deleted
  const record = await MyGlobal.prisma.todo_mvp_audit_events.findFirst({
    where: {
      id: requestedId,
      deleted_at: null,
    },
  });
  if (record === null)
    throw new HttpException("Not Found: Audit event does not exist", 404);

  // Build response with strict date conversions and validated enums/uuids
  return {
    id: requestedId,
    todo_mvp_user_id: uuidOrNull(record.todo_mvp_user_id ?? null) ?? null,
    todo_mvp_admin_id: uuidOrNull(record.todo_mvp_admin_id ?? null) ?? null,
    todo_mvp_todo_id: uuidOrNull(record.todo_mvp_todo_id ?? null) ?? null,
    event_type: ensureEventType(record.event_type),
    event_description: record.event_description ?? null,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    deleted_at: null,
  };
}
