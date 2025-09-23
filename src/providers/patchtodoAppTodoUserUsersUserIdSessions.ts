import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import { IPageITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSession";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Search a user’s sessions with filtering, sorting, and pagination.
 *
 * Operates on todo_app_sessions and enforces ownership by requiring that the
 * authenticated todo user (todoUser) matches the target userId. Supports time
 * range filters, status filters (active/expired/revoked/all), client metadata
 * filters, and sorting over allowed columns. Excludes soft-deleted rows by
 * default (deleted_at IS NULL) unless include_archived is true. Does not expose
 * sensitive session_token values.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload (owner principal)
 * @param props.userId - UUID of the user whose sessions are being queried
 * @param props.body - Search, filter, sort, and paginate parameters
 * @returns Paginated session summaries suitable for account security views
 * @throws {HttpException} 403 when accessing another user's sessions
 * @throws {HttpException} 400 for invalid pagination or filters
 */
export async function patchtodoAppTodoUserUsersUserIdSessions(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppSession.IRequest;
}): Promise<IPageITodoAppSession.ISummary> {
  const { todoUser, userId, body } = props;

  // Authorization: only the owner can list their sessions
  if (!todoUser || todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only list your own sessions",
      403,
    );
  }

  // Pagination validation and defaults
  const pageNum = Number(body.page ?? 1);
  const limitNum = Number(body.limit ?? 20);
  if (!Number.isFinite(pageNum) || pageNum < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }
  const skip = (pageNum - 1) * limitNum;

  // Sort defaults and validation
  const allowedOrderBy: ITodoAppSession.EOrderBy[] = [
    "issued_at",
    "expires_at",
    "created_at",
    "updated_at",
    "revoked_at",
  ];
  const orderByKey: ITodoAppSession.EOrderBy =
    body.orderBy && allowedOrderBy.includes(body.orderBy)
      ? body.orderBy
      : "issued_at";
  const dir: "asc" | "desc" =
    body.direction === "asc" || body.direction === "desc"
      ? body.direction
      : "desc";

  // Build where condition incrementally for clarity
  const where: Record<string, unknown> = {
    todo_app_user_id: userId,
    ...(body.include_archived ? {} : { deleted_at: null }),
  };

  // Client metadata filters (exact match per test expectations)
  if (body.ip !== undefined && body.ip !== null) {
    where.ip = body.ip;
  }
  if (body.user_agent !== undefined && body.user_agent !== null) {
    where.user_agent = body.user_agent;
  }

  // Time range filters
  if (
    (body.issued_at_from !== undefined && body.issued_at_from !== null) ||
    (body.issued_at_to !== undefined && body.issued_at_to !== null)
  ) {
    const issued: Record<string, unknown> = {};
    if (body.issued_at_from !== undefined && body.issued_at_from !== null)
      issued.gte = body.issued_at_from;
    if (body.issued_at_to !== undefined && body.issued_at_to !== null)
      issued.lte = body.issued_at_to;
    where.issued_at = issued;
  }
  if (
    (body.expires_at_from !== undefined && body.expires_at_from !== null) ||
    (body.expires_at_to !== undefined && body.expires_at_to !== null)
  ) {
    const expires: Record<string, unknown> = {};
    if (body.expires_at_from !== undefined && body.expires_at_from !== null)
      expires.gte = body.expires_at_from;
    if (body.expires_at_to !== undefined && body.expires_at_to !== null)
      expires.lte = body.expires_at_to;
    where.expires_at = expires;
  }
  if (
    (body.revoked_at_from !== undefined && body.revoked_at_from !== null) ||
    (body.revoked_at_to !== undefined && body.revoked_at_to !== null)
  ) {
    const revokedRange: Record<string, unknown> = {};
    if (body.revoked_at_from !== undefined && body.revoked_at_from !== null)
      revokedRange.gte = body.revoked_at_from;
    if (body.revoked_at_to !== undefined && body.revoked_at_to !== null)
      revokedRange.lte = body.revoked_at_to;
    where.revoked_at = revokedRange;
  }

  // Status derived filters
  const nowIso = toISOStringSafe(new Date());
  const status: ITodoAppSession.EStatus | undefined = body.status ?? undefined;
  if (status && status !== "all") {
    if (status === "active") {
      // revoked_at IS NULL AND expires_at > now
      where.revoked_at = null;
      const expires =
        (where.expires_at as Record<string, unknown> | undefined) ?? {};
      expires.gt = nowIso;
      where.expires_at = expires;
    } else if (status === "expired") {
      // expires_at <= now (regardless of revoked)
      const expires =
        (where.expires_at as Record<string, unknown> | undefined) ?? {};
      expires.lte = nowIso;
      where.expires_at = expires;
    } else if (status === "revoked") {
      // revoked_at IS NOT NULL
      where.revoked_at = { not: null };
    }
  }

  // Execute queries
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_sessions.findMany({
      where: where,
      select: {
        id: true,
        ip: true,
        user_agent: true,
        issued_at: true,
        expires_at: true,
        revoked_at: true,
        revoked_reason: true,
        created_at: true,
        updated_at: true,
      },
      orderBy:
        orderByKey === "issued_at"
          ? { issued_at: dir }
          : orderByKey === "expires_at"
            ? { expires_at: dir }
            : orderByKey === "created_at"
              ? { created_at: dir }
              : orderByKey === "updated_at"
                ? { updated_at: dir }
                : { revoked_at: dir },
      skip: skip,
      take: limitNum,
    }),
    MyGlobal.prisma.todo_app_sessions.count({ where: where }),
  ]);

  // Map to DTO
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    ip: r.ip ?? undefined,
    user_agent: r.user_agent ?? undefined,
    issued_at: toISOStringSafe(r.issued_at),
    expires_at: toISOStringSafe(r.expires_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
    revoked_reason: r.revoked_reason ?? undefined,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  const pagination = {
    current: Number(pageNum),
    limit: Number(limitNum),
    records: Number(total),
    pages: Number(Math.ceil(total / limitNum)),
  };

  return { pagination, data };
}
