import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpSession";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function getTodoMvpUserSessionsSessionId(props: {
  user: UserPayload;
  sessionId: string & tags.Format<"uuid">;
}): Promise<ITodoMvpSession> {
  const { user, sessionId } = props;

  const row = await MyGlobal.prisma.todo_mvp_sessions.findFirst({
    where: {
      id: sessionId,
      todo_mvp_user_id: user.id,
    },
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
  });

  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: row.id as string & tags.Format<"uuid">,
    todo_mvp_user_id:
      row.todo_mvp_user_id === null
        ? null
        : (row.todo_mvp_user_id as string & tags.Format<"uuid">),
    todo_mvp_admin_id:
      row.todo_mvp_admin_id === null
        ? null
        : (row.todo_mvp_admin_id as string & tags.Format<"uuid">),
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    last_accessed_at: toISOStringSafe(row.last_accessed_at),
    expires_at: toISOStringSafe(row.expires_at),
    revoked_at: row.revoked_at ? toISOStringSafe(row.revoked_at) : null,
  } as ITodoMvpSession;
}
