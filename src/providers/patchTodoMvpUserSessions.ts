import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpSession";
import { IESessionState } from "@ORGANIZATION/PROJECT-api/lib/structures/IESessionState";
import { IESessionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IESessionSortBy";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpSession";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function patchTodoMvpUserSessions(props: {
  user: UserPayload;
  body: ITodoMvpSession.IRequest;
}): Promise<IPageITodoMvpSession> {
  /**
   * Search and paginate sessions (todo_mvp_sessions) with filters and sorting.
   *
   * Returns a page of authenticated sessions scoped to the caller (user-only
   * context). Supports lifecycle filtering (active/revoked/expired), temporal
   * range filters, sorting, and pagination.
   *
   * Authorization: Requires an authenticated user; results are strictly limited
   * to the caller’s own sessions (todo_mvp_user_id === user.id).
   *
   * @param props - Request properties
   * @param props.user - Authenticated user payload (role: user)
   * @param props.body - Search criteria, pagination, and sorting options
   * @returns Paginated list of session entities visible to the caller
   * @throws {HttpException} 403 when payload is not a user
   */
  const { user, body } = props;

  if (!user || user.type !== "user")
    throw new HttpException("Forbidden: user authentication required", 403);

  // Defaults & sanitization
  const page = Math.max(1, Number(body.page ?? 1));
  const rawLimit = Number(body.limit ?? 10);
  const limit = Math.min(200, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;

  const sortBy: IESessionSortBy = body.sort_by ?? "last_accessed_at";
  const order: IEOrderDirection = body.order ?? "desc";

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Build where condition with careful null/undefined handling and state merge
  const whereCondition = {
    // Scope to the authenticated user only
    todo_mvp_user_id: user.id,

    // created_at range
    ...(body.created_from !== undefined || body.created_to !== undefined
      ? {
          created_at: {
            ...(body.created_from !== undefined
              ? { gte: body.created_from }
              : {}),
            ...(body.created_to !== undefined ? { lte: body.created_to } : {}),
          },
        }
      : {}),

    // last_accessed_at range
    ...(body.last_accessed_from !== undefined ||
    body.last_accessed_to !== undefined
      ? {
          last_accessed_at: {
            ...(body.last_accessed_from !== undefined
              ? { gte: body.last_accessed_from }
              : {}),
            ...(body.last_accessed_to !== undefined
              ? { lte: body.last_accessed_to }
              : {}),
          },
        }
      : {}),

    // revoked_at filter for state where applicable
    ...(() => {
      const state = body.state ?? "all";
      if (state === "active") return { revoked_at: null };
      if (state === "revoked") return { revoked_at: { not: null } };
      return {};
    })(),

    // expires_at filter merged from request bounds and state
    ...(() => {
      const filters: Record<string, string & tags.Format<"date-time">> = {};
      if (body.expires_after !== undefined) filters.gt = body.expires_after;
      if (body.expires_before !== undefined) filters.lt = body.expires_before;

      const state = body.state ?? "all";
      if (state === "active") {
        if (filters.gt === undefined) filters.gt = now;
      } else if (state === "expired") {
        if (filters.lt === undefined) filters.lt = now;
      }

      return Object.keys(filters).length > 0 ? { expires_at: filters } : {};
    })(),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_mvp_sessions.findMany({
      where: whereCondition,
      orderBy:
        sortBy === "created_at"
          ? { created_at: order }
          : sortBy === "updated_at"
            ? { updated_at: order }
            : sortBy === "expires_at"
              ? { expires_at: order }
              : { last_accessed_at: order },
      skip,
      take: limit,
      select: {
        id: true,
        todo_mvp_user_id: true,
        todo_mvp_admin_id: true,
        created_at: true,
        updated_at: true,
        last_accessed_at: true,
        expires_at: true,
        revoked_at: true,
      },
    }),
    MyGlobal.prisma.todo_mvp_sessions.count({ where: whereCondition }),
  ]);

  const data: ITodoMvpSession[] = rows.map((r) => ({
    id: r.id,
    todo_mvp_user_id: r.todo_mvp_user_id ?? null,
    todo_mvp_admin_id: r.todo_mvp_admin_id ?? null,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    last_accessed_at: toISOStringSafe(r.last_accessed_at),
    expires_at: toISOStringSafe(r.expires_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
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
