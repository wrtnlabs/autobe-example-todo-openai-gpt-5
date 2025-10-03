import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { UserPayload } from "../decorators/payload/UserPayload";

export async function deleteTodoMvpUserTodosTodoId(props: {
  user: UserPayload;
  todoId: string & tags.Format<"uuid">;
}): Promise<void> {
  /**
   * Hard delete a Todo from todo_mvp_todos by ID (owner-only).
   *
   * Permanently removes the Todo since the model has no deleted_at field.
   * Ownership is enforced using todo_mvp_user_id. If the Todo does not exist or
   * is not owned by the requester, respond with 404 to avoid disclosing
   * existence of others' resources.
   *
   * @param props - Request properties
   * @param props.user - Authenticated user payload (must own the Todo)
   * @param props.todoId - UUID of the Todo to delete
   * @returns Void
   * @throws {HttpException} 404 Not Found when the Todo does not exist or is
   *   not owned by the user
   */
  const { user, todoId } = props;

  const result = await MyGlobal.prisma.todo_mvp_todos.deleteMany({
    where: {
      id: todoId,
      todo_mvp_user_id: user.id,
    },
  });

  if (result.count === 0) {
    throw new HttpException("Not Found", 404);
  }
}
