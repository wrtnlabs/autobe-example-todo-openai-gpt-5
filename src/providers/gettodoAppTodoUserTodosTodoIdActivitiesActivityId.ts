import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoActivity";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a single Todo activity by ID from todo_app_todo_activities
 *
 * Retrieves a detailed activity record associated with a specific Todo. This
 * enforces ownership by verifying the parent Todo belongs to the authenticated
 * todoUser and excludes soft-deleted records. When the Todo does not belong to
 * the caller or the activity does not belong to the specified Todo (or is
 * soft-deleted), a Not Found error is thrown to avoid leaking existence.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated Todo user making the request
 * @param props.todoId - UUID of the parent Todo
 * @param props.activityId - UUID of the activity to retrieve
 * @returns The full ITodoAppTodoActivity entity
 * @throws {HttpException} 404 when the Todo is not owned by the caller, or the
 *   activity is not found/mismatched/soft-deleted
 */
export async function gettodoAppTodoUserTodosTodoIdActivitiesActivityId(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
  activityId: string & tags.Format<"uuid">;
}): Promise<ITodoAppTodoActivity> {
  const { todoUser, todoId, activityId } = props;

  // 1) Enforce ownership: ensure the Todo belongs to the authenticated user and is not soft-deleted
  const ownedTodo = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: todoId,
      todo_app_user_id: todoUser.id,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (ownedTodo === null) {
    throw new HttpException("Not Found", 404);
  }

  // 2) Fetch the activity under the specified Todo, excluding soft-deleted records
  const activity = await MyGlobal.prisma.todo_app_todo_activities.findFirst({
    where: {
      id: activityId,
      todo_app_todo_id: todoId,
      deleted_at: null,
    },
  });
  if (activity === null) {
    throw new HttpException("Not Found", 404);
  }

  // 3) Map to DTO with proper DateTime conversions and nullable handling
  return {
    id: activity.id as string & tags.Format<"uuid">,
    todo_app_todo_id:
      activity.todo_app_todo_id === null
        ? null
        : (activity.todo_app_todo_id as string & tags.Format<"uuid">),
    todo_app_user_id:
      activity.todo_app_user_id === null
        ? null
        : (activity.todo_app_user_id as string & tags.Format<"uuid">),
    activity_type: activity.activity_type,
    details: activity.details ?? null,
    changed_fields: activity.changed_fields ?? null,
    previous_status: activity.previous_status ?? null,
    next_status: activity.next_status ?? null,
    occurred_at: toISOStringSafe(activity.occurred_at),
    created_at: toISOStringSafe(activity.created_at),
    updated_at: toISOStringSafe(activity.updated_at),
    deleted_at: activity.deleted_at
      ? toISOStringSafe(activity.deleted_at)
      : null,
  };
}
