import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import { IPageITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEmailVerification";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Search email verifications (todo_app_email_verifications) for a user with
 * pagination and filters.
 *
 * Lists and filters email verification records associated with the given
 * userId. Supports time-window filters (sent_at, expires_at), consumption
 * state, failure_count ranges, target_email equality, sorting, and pagination.
 * Soft-deleted rows are excluded.
 *
 * Security: Only the authenticated owner (todoUser) can access their own
 * records. Raw token fields are never exposed.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload (owner)
 * @param props.userId - Target owner user id (scope)
 * @param props.body - Search criteria and pagination
 * @returns Paginated list of email verification summaries
 * @throws {HttpException} 403 when accessing another user's data
 */
export async function patchtodoAppTodoUserUsersUserIdEmailVerifications(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppEmailVerification.IRequest;
}): Promise<IPageITodoAppEmailVerification.ISummary> {
  const { todoUser, userId, body } = props;

  // Authorization: owner-only access
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own email verifications",
      403,
    );
  }

  // Pagination defaults
  const page = body.page ?? 1;
  const limit = body.limit ?? 20;
  const skip = (Number(page) - 1) * Number(limit);

  // Determine ordering (defaults: sent_at desc)
  const orderField = body.order_by ?? "sent_at";
  const orderDir = body.order_dir === "asc" ? "asc" : "desc";

  // Build where condition with null-safe checks and soft delete exclusion
  const whereCondition = {
    todo_app_user_id: userId,
    deleted_at: null,
    // sent_at range
    ...((body.sent_at_from !== undefined && body.sent_at_from !== null) ||
    (body.sent_at_to !== undefined && body.sent_at_to !== null)
      ? {
          sent_at: {
            ...(body.sent_at_from !== undefined && body.sent_at_from !== null
              ? { gte: body.sent_at_from }
              : {}),
            ...(body.sent_at_to !== undefined && body.sent_at_to !== null
              ? { lte: body.sent_at_to }
              : {}),
          },
        }
      : {}),
    // expires_at range
    ...((body.expires_at_from !== undefined && body.expires_at_from !== null) ||
    (body.expires_at_to !== undefined && body.expires_at_to !== null)
      ? {
          expires_at: {
            ...(body.expires_at_from !== undefined &&
            body.expires_at_from !== null
              ? { gte: body.expires_at_from }
              : {}),
            ...(body.expires_at_to !== undefined && body.expires_at_to !== null
              ? { lte: body.expires_at_to }
              : {}),
          },
        }
      : {}),
    // consumed flag
    ...(body.consumed !== undefined && body.consumed !== null
      ? body.consumed
        ? { consumed_at: { not: null } }
        : { consumed_at: null }
      : {}),
    // failure_count min/max
    ...((body.failure_count_min !== undefined &&
      body.failure_count_min !== null) ||
    (body.failure_count_max !== undefined && body.failure_count_max !== null)
      ? {
          failure_count: {
            ...(body.failure_count_min !== undefined &&
            body.failure_count_min !== null
              ? { gte: Number(body.failure_count_min) }
              : {}),
            ...(body.failure_count_max !== undefined &&
            body.failure_count_max !== null
              ? { lte: Number(body.failure_count_max) }
              : {}),
          },
        }
      : {}),
    // target_email exact filter
    ...(body.target_email !== undefined && body.target_email !== null
      ? { target_email: body.target_email }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_email_verifications.findMany({
      where: whereCondition,
      orderBy:
        orderField === "sent_at"
          ? { sent_at: orderDir }
          : orderField === "expires_at"
            ? { expires_at: orderDir }
            : orderField === "created_at"
              ? { created_at: orderDir }
              : { failure_count: orderDir },
      skip: skip,
      take: Number(limit),
    }),
    MyGlobal.prisma.todo_app_email_verifications.count({
      where: whereCondition,
    }),
  ]);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Number(limit) > 0 ? Math.ceil(total / Number(limit)) : 0,
    },
    data: rows.map((r) => ({
      id: r.id,
      target_email: r.target_email,
      sent_at: toISOStringSafe(r.sent_at),
      expires_at: toISOStringSafe(r.expires_at),
      consumed_at: r.consumed_at ? toISOStringSafe(r.consumed_at) : null,
      failure_count: Number(r.failure_count),
    })),
  };
}
