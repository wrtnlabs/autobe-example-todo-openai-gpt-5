import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRefreshToken";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function gettodoAppTodoUserSessionsSessionIdRefreshTokensRefreshTokenId(props: {
  todoUser: TodouserPayload;
  sessionId: string & tags.Format<"uuid">;
  refreshTokenId: string & tags.Format<"uuid">;
}): Promise<ITodoAppRefreshToken> {
  /**
   * Get a refresh token from todo_app_refresh_tokens by session and token
   * identifiers
   *
   * Retrieves a single refresh token metadata record that belongs to the
   * specified session. Ensures the requesting todo user owns the session and
   * that the refresh token is scoped to that session. Sensitive fields (token,
   * token_hash) are never returned.
   *
   * Authorization: The authenticated todoUser must own the session. Errors:
   *
   * - 404 Not Found: when the session does not belong to the user, is deleted, or
   *   the refresh token does not exist under the session (or is soft-deleted).
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todo user payload
   * @param props.sessionId - UUID of the parent session
   * @param props.refreshTokenId - UUID of the refresh token
   * @returns ITodoAppRefreshToken - Redacted refresh token metadata
   * @throws {HttpException} 404 when not found or mismatched
   */
  const { todoUser, sessionId, refreshTokenId } = props;

  // Verify the session exists, belongs to the authenticated user, and is not soft-deleted
  const session = await MyGlobal.prisma.todo_app_sessions.findFirst({
    where: {
      id: sessionId,
      todo_app_user_id: todoUser.id,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!session) {
    throw new HttpException("Not Found", 404);
  }

  // Fetch the refresh token under the session scope, excluding soft-deleted
  const token = await MyGlobal.prisma.todo_app_refresh_tokens.findFirst({
    where: {
      id: refreshTokenId,
      todo_app_session_id: sessionId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_session_id: true,
      parent_id: true,
      issued_at: true,
      expires_at: true,
      rotated_at: true,
      revoked_at: true,
      revoked_reason: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });
  if (!token) {
    throw new HttpException("Not Found", 404);
  }

  // Map to DTO with strict date-time conversions and nullable handling
  const result: ITodoAppRefreshToken = {
    id: token.id,
    todo_app_session_id: token.todo_app_session_id,
    parent_id: token.parent_id ?? null,
    issued_at: toISOStringSafe(token.issued_at),
    expires_at: toISOStringSafe(token.expires_at),
    rotated_at: token.rotated_at ? toISOStringSafe(token.rotated_at) : null,
    revoked_at: token.revoked_at ? toISOStringSafe(token.revoked_at) : null,
    revoked_reason: token.revoked_reason ?? null,
    created_at: toISOStringSafe(token.created_at),
    updated_at: toISOStringSafe(token.updated_at),
    deleted_at: token.deleted_at ? toISOStringSafe(token.deleted_at) : null,
  };

  return result;
}
