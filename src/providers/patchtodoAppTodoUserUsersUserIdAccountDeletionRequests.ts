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
 * Search and list a user’s account deletion requests from
 * todo_app_account_deletion_requests.
 *
 * Returns a paginated list of summaries scoped strictly to the authenticated
 * owner. Supports filtering by status, created_at range, scheduled_purge_at
 * range, processed_at range, and substring search over reason. Excludes
 * soft-deleted records (deleted_at != null). Sorting defaults to created_at
 * desc and can switch to scheduled_purge_at.
 *
 * Authorization: Only the owner (todoUser) can access their own list.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload
 * @param props.userId - Target user ID (must match authenticated user)
 * @param props.body - Filtering, sorting, and pagination parameters
 * @returns Paginated list of account deletion request summaries
 * @throws {HttpException} 403 when accessing another user's records
 * @throws {HttpException} 400 when pagination parameters are invalid
 */
export async function patchtodoAppTodoUserUsersUserIdAccountDeletionRequests(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppAccountDeletionRequest.IRequest;
}): Promise<IPageITodoAppAccountDeletionRequest.ISummary> {
  const { todoUser, userId, body } = props;

  // Ownership enforcement
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Unauthorized: Cannot access other user's account deletion requests",
      403,
    );
  }

  // Pagination defaults and validation
  const requestedPage = body.page ?? 1;
  if (requestedPage < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }

  // Determine default limit from preferences when not provided
  let effectiveLimit: number | null = null;
  if (body.limit !== undefined && body.limit !== null) {
    effectiveLimit = body.limit;
  } else {
    const pref = await MyGlobal.prisma.todo_app_user_preferences.findFirst({
      where: {
        todo_app_user_id: userId,
        deleted_at: null,
      },
      select: { page_size: true },
    });
    effectiveLimit = pref?.page_size ?? 20;
  }

  // Validate and clamp limit within [1, 100]
  if (effectiveLimit < 1 || effectiveLimit > 100) {
    if (body.limit !== undefined && body.limit !== null) {
      throw new HttpException(
        "Bad Request: limit must be between 1 and 100",
        400,
      );
    }
    effectiveLimit = Math.min(100, Math.max(1, effectiveLimit));
  }

  const page = requestedPage;
  const limit = effectiveLimit;
  const skip = (page - 1) * limit;

  // Sorting sanitization
  const sortField =
    body.order_by === "scheduled_purge_at"
      ? "scheduled_purge_at"
      : "created_at";
  const sortDir: "asc" | "desc" =
    body.order_dir === "asc" || body.order_dir === "desc"
      ? body.order_dir
      : "desc";

  // Fetch rows and total in parallel with identical where conditions
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_account_deletion_requests.findMany({
      where: {
        todo_app_user_id: userId,
        deleted_at: null,
        ...(body.status !== undefined &&
          body.status !== null && { status: body.status }),
        ...((body.created_at_from !== undefined &&
          body.created_at_from !== null) ||
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
        ...((body.scheduled_purge_at_from !== undefined &&
          body.scheduled_purge_at_from !== null) ||
        (body.scheduled_purge_at_to !== undefined &&
          body.scheduled_purge_at_to !== null)
          ? {
              scheduled_purge_at: {
                ...(body.scheduled_purge_at_from !== undefined &&
                  body.scheduled_purge_at_from !== null && {
                    gte: body.scheduled_purge_at_from,
                  }),
                ...(body.scheduled_purge_at_to !== undefined &&
                  body.scheduled_purge_at_to !== null && {
                    lte: body.scheduled_purge_at_to,
                  }),
              },
            }
          : {}),
        ...((body.processed_at_from !== undefined &&
          body.processed_at_from !== null) ||
        (body.processed_at_to !== undefined && body.processed_at_to !== null)
          ? {
              processed_at: {
                ...(body.processed_at_from !== undefined &&
                  body.processed_at_from !== null && {
                    gte: body.processed_at_from,
                  }),
                ...(body.processed_at_to !== undefined &&
                  body.processed_at_to !== null && {
                    lte: body.processed_at_to,
                  }),
              },
            }
          : {}),
        ...((body.canceled_at_from !== undefined &&
          body.canceled_at_from !== null) ||
        (body.canceled_at_to !== undefined && body.canceled_at_to !== null)
          ? {
              canceled_at: {
                ...(body.canceled_at_from !== undefined &&
                  body.canceled_at_from !== null && {
                    gte: body.canceled_at_from,
                  }),
                ...(body.canceled_at_to !== undefined &&
                  body.canceled_at_to !== null && {
                    lte: body.canceled_at_to,
                  }),
              },
            }
          : {}),
        ...(body.q !== undefined &&
          body.q !== null &&
          body.q.length > 0 && {
            reason: { contains: body.q },
          }),
      },
      select: {
        id: true,
        status: true,
        scheduled_purge_at: true,
        processed_at: true,
        created_at: true,
      },
      orderBy:
        sortField === "scheduled_purge_at"
          ? { scheduled_purge_at: sortDir }
          : { created_at: sortDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_account_deletion_requests.count({
      where: {
        todo_app_user_id: userId,
        deleted_at: null,
        ...(body.status !== undefined &&
          body.status !== null && { status: body.status }),
        ...((body.created_at_from !== undefined &&
          body.created_at_from !== null) ||
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
        ...((body.scheduled_purge_at_from !== undefined &&
          body.scheduled_purge_at_from !== null) ||
        (body.scheduled_purge_at_to !== undefined &&
          body.scheduled_purge_at_to !== null)
          ? {
              scheduled_purge_at: {
                ...(body.scheduled_purge_at_from !== undefined &&
                  body.scheduled_purge_at_from !== null && {
                    gte: body.scheduled_purge_at_from,
                  }),
                ...(body.scheduled_purge_at_to !== undefined &&
                  body.scheduled_purge_at_to !== null && {
                    lte: body.scheduled_purge_at_to,
                  }),
              },
            }
          : {}),
        ...((body.processed_at_from !== undefined &&
          body.processed_at_from !== null) ||
        (body.processed_at_to !== undefined && body.processed_at_to !== null)
          ? {
              processed_at: {
                ...(body.processed_at_from !== undefined &&
                  body.processed_at_from !== null && {
                    gte: body.processed_at_from,
                  }),
                ...(body.processed_at_to !== undefined &&
                  body.processed_at_to !== null && {
                    lte: body.processed_at_to,
                  }),
              },
            }
          : {}),
        ...((body.canceled_at_from !== undefined &&
          body.canceled_at_from !== null) ||
        (body.canceled_at_to !== undefined && body.canceled_at_to !== null)
          ? {
              canceled_at: {
                ...(body.canceled_at_from !== undefined &&
                  body.canceled_at_from !== null && {
                    gte: body.canceled_at_from,
                  }),
                ...(body.canceled_at_to !== undefined &&
                  body.canceled_at_to !== null && {
                    lte: body.canceled_at_to,
                  }),
              },
            }
          : {}),
        ...(body.q !== undefined &&
          body.q !== null &&
          body.q.length > 0 && {
            reason: { contains: body.q },
          }),
      },
    }),
  ]);

  // Map to summary DTO with proper branding and date conversions
  const data = rows.map((row) => ({
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    status: row.status,
    scheduled_purge_at: row.scheduled_purge_at
      ? toISOStringSafe(row.scheduled_purge_at)
      : null,
    processed_at: row.processed_at ? toISOStringSafe(row.processed_at) : null,
    created_at: toISOStringSafe(row.created_at),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Math.ceil(total / limit),
    },
    data,
  };
}
