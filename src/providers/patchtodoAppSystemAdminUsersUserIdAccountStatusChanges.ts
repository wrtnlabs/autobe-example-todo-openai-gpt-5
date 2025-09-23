import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import { IPageITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountStatusChange";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search account status changes for a user (todo_app_account_status_changes)
 *
 * Retrieves a paginated list of lifecycle status transitions for the specified
 * user. Supports filters on administrator actor, previous/new status values,
 * effect flag, free-text search on business_reason, and created_at ranges.
 * Results are ordered and paginated. Only system administrators may access.
 *
 * Authorization: Requires a valid System Administrator membership for the
 * requesting principal (props.systemAdmin.id). The membership must be active
 * (not revoked, not soft-deleted) and the owning user account must be active,
 * verified, and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.userId - Target user's UUID whose status changes are queried
 * @param props.body - Filter/sort/pagination for the search
 * @returns Paginated list of account status change records
 * @throws {HttpException} 403 When the requester lacks admin privileges
 * @throws {HttpException} 404 When the target user does not exist or is deleted
 * @throws {HttpException} 400 When target_user_id in body conflicts with path
 *   userId
 */
export async function patchtodoAppSystemAdminUsersUserIdAccountStatusChanges(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppAccountStatusChange.IRequest;
}): Promise<IPageITodoAppAccountStatusChange> {
  const { systemAdmin, userId, body } = props;

  // Authorization: confirm active system admin membership and owner user state
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
    },
  );
  if (adminMembership === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Target user existence (not soft-deleted)
  const targetUser = await MyGlobal.prisma.todo_app_users.findFirst({
    where: { id: userId, deleted_at: null },
    select: { id: true },
  });
  if (targetUser === null) {
    throw new HttpException("Not Found", 404);
  }

  // Enforce body.target_user_id coherence when provided
  if (
    body.target_user_id !== undefined &&
    body.target_user_id !== null &&
    body.target_user_id !== userId
  ) {
    throw new HttpException(
      "Bad Request: target_user_id must equal path userId",
      400,
    );
  }

  // Pagination defaults
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  const skip = (page - 1) * limit;

  // Build where condition with guarded optional filters
  const whereCondition = {
    deleted_at: null,
    target_user_id: userId,
    ...(body.admin_user_id !== undefined &&
      body.admin_user_id !== null && {
        admin_user_id: body.admin_user_id,
      }),
    ...(body.previous_status !== undefined &&
      body.previous_status !== null && {
        previous_status: body.previous_status,
      }),
    ...(body.new_status !== undefined &&
      body.new_status !== null && {
        new_status: body.new_status,
      }),
    ...(body.has_effect !== undefined &&
      body.has_effect !== null && {
        has_effect: body.has_effect,
      }),
    ...(body.q !== undefined &&
      body.q !== null &&
      body.q.length > 0 && {
        business_reason: { contains: body.q },
      }),
    ...((body.created_at_from !== undefined && body.created_at_from !== null) ||
    (body.created_at_to !== undefined && body.created_at_to !== null)
      ? {
          created_at: {
            ...(body.created_at_from !== undefined &&
              body.created_at_from !== null && {
                gte: body.created_at_from,
              }),
            ...(body.created_at_to !== undefined &&
              body.created_at_to !== null && {
                lte: body.created_at_to,
              }),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_account_status_changes.findMany({
      where: whereCondition,
      select: {
        id: true,
        target_user_id: true,
        admin_user_id: true,
        previous_status: true,
        new_status: true,
        business_reason: true,
        has_effect: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy:
        body.orderBy === "new_status"
          ? { new_status: body.orderDirection === "asc" ? "asc" : "desc" }
          : body.orderBy === "has_effect"
            ? { has_effect: body.orderDirection === "asc" ? "asc" : "desc" }
            : { created_at: body.orderDirection === "asc" ? "asc" : "desc" },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_account_status_changes.count({
      where: whereCondition,
    }),
  ]);

  const data: ITodoAppAccountStatusChange[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    target_user_id: r.target_user_id as string & tags.Format<"uuid">,
    admin_user_id:
      r.admin_user_id === null
        ? undefined
        : (r.admin_user_id as string & tags.Format<"uuid">),
    previous_status: r.previous_status,
    new_status: r.new_status,
    business_reason: r.business_reason ?? undefined,
    has_effect: r.has_effect,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : undefined,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Math.ceil(total / (limit || 1)),
    },
    data,
  };
}
