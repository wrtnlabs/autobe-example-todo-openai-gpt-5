import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRefreshToken";
import { IPageITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppRefreshToken";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Search refresh tokens (todo_app_refresh_tokens) for a session with
 * pagination.
 *
 * Retrieves a paginated list of refresh token summaries for the specified
 * session. It enforces ownership by verifying the session belongs to the
 * authenticated todo user and filters out soft-deleted rows. Supports temporal
 * filters over issued_at/expires_at and state filters for rotation/revocation.
 * Sorting defaults to issued_at desc when not specified.
 *
 * Security: Does not expose raw token or token_hash; only lifecycle metadata.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (owner must match
 *   session)
 * @param props.sessionId - UUID of the session whose refresh tokens are queried
 * @param props.body - Filtering, sorting, and pagination parameters
 * @returns Paginated summary of refresh tokens for the session
 * @throws {HttpException} 403 When the session is not owned by the
 *   authenticated user
 * @throws {HttpException} 404 When the session does not exist
 */
export async function patchtodoAppTodoUserSessionsSessionIdRefreshTokens(props: {
  todoUser: TodouserPayload;
  sessionId: string & tags.Format<"uuid">;
  body: ITodoAppRefreshToken.IRequest;
}): Promise<IPageITodoAppRefreshToken.ISummary> {
  const { todoUser, sessionId, body } = props;

  // 1) Authorization: ensure session exists and is owned by the user
  const session = await MyGlobal.prisma.todo_app_sessions.findUnique({
    where: { id: sessionId },
    select: { todo_app_user_id: true, deleted_at: true },
  });
  if (!session) {
    throw new HttpException("Not Found", 404);
  }
  if (session.todo_app_user_id !== todoUser.id) {
    throw new HttpException(
      "Forbidden: You do not have access to this session",
      403,
    );
  }

  // 2) Pagination defaults
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  const skip = (page - 1) * limit;

  // 3) Build where condition (complex: include optional filters)
  const whereCondition = {
    todo_app_session_id: sessionId,
    deleted_at: null,
    // Temporal filters
    ...((body.issued_from !== undefined && body.issued_from !== null) ||
    (body.issued_to !== undefined && body.issued_to !== null)
      ? {
          issued_at: {
            ...(body.issued_from !== undefined &&
              body.issued_from !== null && {
                gte: body.issued_from,
              }),
            ...(body.issued_to !== undefined &&
              body.issued_to !== null && {
                lte: body.issued_to,
              }),
          },
        }
      : {}),
    ...((body.expires_from !== undefined && body.expires_from !== null) ||
    (body.expires_to !== undefined && body.expires_to !== null)
      ? {
          expires_at: {
            ...(body.expires_from !== undefined &&
              body.expires_from !== null && {
                gte: body.expires_from,
              }),
            ...(body.expires_to !== undefined &&
              body.expires_to !== null && {
                lte: body.expires_to,
              }),
          },
        }
      : {}),
    // State filters
    ...(body.rotated !== undefined &&
      body.rotated !== null &&
      (body.rotated ? { rotated_at: { not: null } } : { rotated_at: null })),
    ...(body.revoked !== undefined &&
      body.revoked !== null &&
      (body.revoked ? { revoked_at: { not: null } } : { revoked_at: null })),
  };

  // 4) Sorting
  const sortBy = body.sort_by ?? "issued_at";
  const sortDir = body.sort_dir ?? "desc";

  // Inline, field-safe orderBy
  const orderBy =
    sortBy === "issued_at"
      ? { issued_at: sortDir }
      : sortBy === "expires_at"
        ? { expires_at: sortDir }
        : sortBy === "rotated_at"
          ? { rotated_at: sortDir }
          : sortBy === "revoked_at"
            ? { revoked_at: sortDir }
            : { created_at: sortDir };

  // 5) Query data and total in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_refresh_tokens.findMany({
      where: whereCondition,
      orderBy: orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        issued_at: true,
        expires_at: true,
        rotated_at: true,
        revoked_at: true,
        revoked_reason: true,
      },
    }),
    MyGlobal.prisma.todo_app_refresh_tokens.count({ where: whereCondition }),
  ]);

  // 6) Map to DTO, converting Date fields to ISO strings
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    issued_at: toISOStringSafe(r.issued_at),
    expires_at: toISOStringSafe(r.expires_at),
    rotated_at: r.rotated_at ? toISOStringSafe(r.rotated_at) : null,
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
    revoked_reason: r.revoked_reason ?? null,
  }));

  // 7) Build pagination
  const pagination = {
    current: Number(page),
    limit: Number(limit),
    records: Number(total),
    pages: Math.ceil(total / limit),
  };

  return { pagination, data };
}
