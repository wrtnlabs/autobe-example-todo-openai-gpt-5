import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppLoginAttempt";
import { IPageITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppLoginAttempt";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Search login attempts (todo_app_login_attempts) for a specific user with
 * pagination and filters
 *
 * Retrieves a filtered, paginated list of authentication attempts
 * (success/failure, ip, user agent, failure_reason) for the owner user
 * identified by {userId}. Results exclude soft-deleted rows and support
 * time-window filtering over occurred_at, sorting, and pagination.
 *
 * Authorization: Only the authenticated owner (todoUser.id) may access their
 * own attempts. If the authenticated user does not match the path {userId}, the
 * request is forbidden.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated TodoUser payload (owner context)
 * @param props.userId - Owner user's UUID (todo_app_users.id) to scope the
 *   search
 * @param props.body - Search, filter, sorting, and pagination parameters
 * @returns Paginated collection of login attempt summaries
 * @throws {HttpException} 403 when accessing another user's attempts
 * @throws {HttpException} 400 when pagination parameters are invalid
 */
export async function patchtodoAppTodoUserUsersUserIdLoginAttempts(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppLoginAttempt.IRequest;
}): Promise<IPageITodoAppLoginAttempt.ISummary> {
  const { todoUser, userId, body } = props;

  // Authorization: owner-only
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own login attempts",
      403,
    );
  }

  // Pagination defaults and validation
  const pageRaw = body.page ?? (1 as number);
  const limitRaw = body.limit ?? (20 as number);
  const page = Number(pageRaw);
  const limit = Number(limitRaw);

  if (!Number.isFinite(page) || page < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  const skip = (page - 1) * limit;

  // Sorting defaults
  const sortBy = body.sort_by ?? ("occurred_at" as const);
  const sortDir = body.sort_dir ?? ("desc" as const);

  // Build where condition with soft-delete exclusion and owner scope
  const whereCondition = {
    todo_app_user_id: userId,
    deleted_at: null,
    ...(body.success !== undefined &&
      body.success !== null && { success: body.success }),
    ...(body.failure_reason !== undefined &&
      body.failure_reason !== null && {
        failure_reason: { contains: body.failure_reason },
      }),
    ...(body.email !== undefined &&
      body.email !== null && {
        email: { contains: body.email },
      }),
    ...(body.ip !== undefined &&
      body.ip !== null && {
        ip: { contains: body.ip },
      }),
    ...(body.user_agent !== undefined &&
      body.user_agent !== null && {
        user_agent: { contains: body.user_agent },
      }),
    ...((body.occurred_from !== undefined && body.occurred_from !== null) ||
    (body.occurred_to !== undefined && body.occurred_to !== null)
      ? {
          occurred_at: {
            ...(body.occurred_from !== undefined &&
              body.occurred_from !== null && {
                gte: body.occurred_from,
              }),
            ...(body.occurred_to !== undefined &&
              body.occurred_to !== null && {
                lte: body.occurred_to,
              }),
          },
        }
      : {}),
  };

  // Execute queries in parallel with identical where
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_login_attempts.findMany({
      where: whereCondition,
      select: {
        id: true,
        email: true,
        success: true,
        ip: true,
        user_agent: true,
        occurred_at: true,
      },
      orderBy:
        sortBy === "occurred_at"
          ? { occurred_at: sortDir }
          : sortBy === "created_at"
            ? { created_at: sortDir }
            : sortBy === "ip"
              ? { ip: sortDir }
              : sortBy === "email"
                ? { email: sortDir }
                : { success: sortDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_login_attempts.count({
      where: whereCondition,
    }),
  ]);

  // Map to summaries with proper branding and date conversion
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    email: r.email as string & tags.Format<"email">,
    success: r.success,
    ip: r.ip,
    user_agent: r.user_agent === null ? undefined : r.user_agent,
    occurred_at: toISOStringSafe(r.occurred_at),
  }));

  const pagination = {
    current: Number(page),
    limit: Number(limit),
    records: total,
    pages: Math.ceil(total / limit),
  };

  return {
    pagination,
    data,
  };
}
