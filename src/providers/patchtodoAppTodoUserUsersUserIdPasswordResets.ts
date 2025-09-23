import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import { IPageITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppPasswordReset";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * List/search password resets (todo_app_password_resets) for a user.
 *
 * Returns a paginated list of password reset summaries belonging to the
 * authenticated todoUser (owner), filtered and sorted per the request DTO.
 * Excludes sensitive tokens and soft-deleted records, exposing only
 * non-sensitive metadata (email and timestamps).
 *
 * Authorization: Only the owning user can list their records. The path
 * parameter userId must match the authenticated todoUser.id.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated Todo User payload
 * @param props.userId - Target user ID whose password reset records are queried
 * @param props.body - Filtering, sorting, and pagination criteria
 * @returns Paginated list of password reset summaries
 * @throws {HttpException} 401 when authentication is missing (handled upstream)
 * @throws {HttpException} 403 when trying to access another user's records
 */
export async function patchtodoAppTodoUserUsersUserIdPasswordResets(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppPasswordReset.IRequest;
}): Promise<IPageITodoAppPasswordReset.ISummary> {
  const { todoUser, userId, body } = props;

  // Authorization: ensure owner-only access
  if (!todoUser || !todoUser.id) {
    throw new HttpException("Unauthorized", 401);
  }
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only list your own password reset records",
      403,
    );
  }

  // Pagination defaults and bounds
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;
  const page = Number(pageInput);
  const limit = Number(limitInput);
  const skip = (page - 1) * limit;

  // Build where condition (soft-delete excluded, owner enforced)
  const whereCondition = {
    deleted_at: null,
    todo_app_user_id: userId,
    ...(body.email !== undefined &&
      body.email !== null && {
        email: body.email,
      }),
    ...(body.consumed !== undefined &&
      body.consumed !== null &&
      (body.consumed === true
        ? { consumed_at: { not: null as unknown as never } }
        : { consumed_at: null })),
    ...(() => {
      const from = body.requested_at_from ?? null;
      const to = body.requested_at_to ?? null;
      if (from === null && to === null) return {};
      return {
        requested_at: {
          ...(from !== null && { gte: from }),
          ...(to !== null && { lte: to }),
        },
      };
    })(),
    ...(() => {
      const from = body.expires_at_from ?? null;
      const to = body.expires_at_to ?? null;
      if (from === null && to === null) return {};
      return {
        expires_at: {
          ...(from !== null && { gte: from }),
          ...(to !== null && { lte: to }),
        },
      };
    })(),
  };

  // Sorting
  const orderByField = (body.order_by ?? "requested_at") as
    | "requested_at"
    | "expires_at"
    | "created_at";
  const orderDir = body.order_dir ?? "desc";

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_password_resets.findMany({
      where: whereCondition,
      select: {
        id: true,
        email: true,
        requested_at: true,
        expires_at: true,
        consumed_at: true,
      },
      orderBy:
        orderByField === "requested_at"
          ? { requested_at: orderDir }
          : orderByField === "expires_at"
            ? { expires_at: orderDir }
            : { created_at: orderDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_password_resets.count({
      where: whereCondition,
    }),
  ]);

  // Map to summaries with safe date conversions and branded primitives
  const data = rows.map((row) => ({
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    email: typia.assert<string & tags.Format<"email">>(row.email),
    requested_at: toISOStringSafe(row.requested_at),
    expires_at: toISOStringSafe(row.expires_at),
    consumed_at: row.consumed_at ? toISOStringSafe(row.consumed_at) : null,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Math.ceil(total / (limit === 0 ? 1 : limit)),
    },
    data,
  };
}
