import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import { IPageITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountDeletionRequest";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * List/search account deletion requests (todo_app_account_deletion_requests)
 * for the authenticated user
 *
 * Retrieves a paginated list of the caller's account deletion workflow records
 * with filtering (status, date windows, free-text on reason) and sorting
 * (created_at or scheduled_purge_at). Only records owned by the authenticated
 * todoUser and not soft-deleted are returned.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated TodoUser payload (owner scope)
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paginated list of account deletion request summaries
 * @throws {HttpException} 401 when authentication is missing (handled
 *   upstream); 403 when unauthorized (handled by decorator); 500 on unexpected
 *   database errors
 */
export async function patchtodoAppTodoUserAccountDeletionRequests(props: {
  todoUser: TodouserPayload;
  body: ITodoAppAccountDeletionRequest.IRequest;
}): Promise<IPageITodoAppAccountDeletionRequest.ISummary> {
  const { todoUser, body } = props;

  // Pagination defaults
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  const skip = (page - 1) * limit;

  // Sorting sanitization
  const orderByField: "created_at" | "scheduled_purge_at" =
    body.order_by === "scheduled_purge_at"
      ? "scheduled_purge_at"
      : "created_at";
  const orderDir: "asc" | "desc" = body.order_dir === "asc" ? "asc" : "desc";

  // Build complex where condition once for reuse (allowed exception)
  const whereCondition = {
    // Owner scoping and soft-delete exclusion
    todo_app_user_id: todoUser.id,
    deleted_at: null,

    // Simple equality filter
    ...(body.status !== undefined &&
      body.status !== null && { status: body.status }),

    // Free-text search over reason
    ...(body.q !== undefined &&
      body.q !== null &&
      body.q !== "" && {
        reason: { contains: body.q },
      }),

    // created_at range
    ...(() => {
      const from = body.created_at_from;
      const to = body.created_at_to;
      if (from === undefined && to === undefined) return {};
      if (from === null && to === null) return {};
      return {
        created_at: {
          ...(from !== undefined && from !== null && { gte: from }),
          ...(to !== undefined && to !== null && { lte: to }),
        },
      };
    })(),

    // scheduled_purge_at range
    ...(() => {
      const from = body.scheduled_purge_at_from;
      const to = body.scheduled_purge_at_to;
      if (from === undefined && to === undefined) return {};
      if (from === null && to === null) return {};
      return {
        scheduled_purge_at: {
          ...(from !== undefined && from !== null && { gte: from }),
          ...(to !== undefined && to !== null && { lte: to }),
        },
      };
    })(),

    // processed_at range
    ...(() => {
      const from = body.processed_at_from;
      const to = body.processed_at_to;
      if (from === undefined && to === undefined) return {};
      if (from === null && to === null) return {};
      return {
        processed_at: {
          ...(from !== undefined && from !== null && { gte: from }),
          ...(to !== undefined && to !== null && { lte: to }),
        },
      };
    })(),

    // canceled_at range
    ...(() => {
      const from = body.canceled_at_from;
      const to = body.canceled_at_to;
      if (from === undefined && to === undefined) return {};
      if (from === null && to === null) return {};
      return {
        canceled_at: {
          ...(from !== undefined && from !== null && { gte: from }),
          ...(to !== undefined && to !== null && { lte: to }),
        },
      };
    })(),
  };

  // Execute queries in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_account_deletion_requests.findMany({
      where: whereCondition,
      select: {
        id: true,
        status: true,
        scheduled_purge_at: true,
        processed_at: true,
        created_at: true,
      },
      orderBy:
        orderByField === "scheduled_purge_at"
          ? { scheduled_purge_at: orderDir }
          : { created_at: orderDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_account_deletion_requests.count({
      where: whereCondition,
    }),
  ]);

  // Map to summaries with proper date conversions
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    status: r.status,
    scheduled_purge_at: r.scheduled_purge_at
      ? toISOStringSafe(r.scheduled_purge_at)
      : null,
    processed_at: r.processed_at ? toISOStringSafe(r.processed_at) : null,
    created_at: toISOStringSafe(r.created_at),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / limit)),
    },
    data,
  };
}
