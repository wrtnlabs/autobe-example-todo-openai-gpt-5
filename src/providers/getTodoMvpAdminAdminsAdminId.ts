import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import { AdminPayload } from "../decorators/payload/AdminPayload";

export async function getTodoMvpAdminAdminsAdminId(props: {
  admin: AdminPayload;
  adminId: string & tags.Format<"uuid">;
}): Promise<ITodoMvpAdmin> {
  /**
   * Get administrator detail from Prisma table todo_mvp_admins by ID
   *
   * Retrieves administrator metadata for administrative views, excluding
   * sensitive credentials like password_hash. Only accessible to authenticated
   * administrators. Records must be active and not soft-deleted.
   *
   * Authorization: The requester must be an active admin (status="active") and
   * not soft-deleted (deleted_at is null).
   *
   * @param props - Request properties
   * @param props.admin - The authenticated administrator making the request
   * @param props.adminId - UUID of the administrator to retrieve
   * @returns Administrator account details (sans secrets)
   * @throws {HttpException} 403 when requester lacks permission or is
   *   inactive/deleted
   * @throws {HttpException} 404 when the admin record is not found or not
   *   accessible
   */
  const requester = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: props.admin.id,
      deleted_at: null,
      status: "active",
    },
    select: { id: true },
  });
  if (requester === null) {
    throw new HttpException("Forbidden: requester is not an active admin", 403);
  }

  const row = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: props.adminId,
      deleted_at: null,
      status: "active",
    },
    select: {
      id: true,
      email: true,
      status: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });
  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    email: typia.assert<string & tags.Format<"email">>(row.email),
    status: typia.assert<IEAccountStatus>(row.status),
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
