import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Create a new personal data export request in todo_app_data_exports
 *
 * This operation creates a personal data export job for the authenticated
 * owner. It stores the owner user id, requested export_format, initializes
 * status to "requested", and records creation/update timestamps. Processing
 * systems will later update lifecycle fields (download_uri, checksum,
 * file_size_bytes, completed_at, expires_at, status).
 *
 * Authorization: only the resource owner (todoUser) can create an export for
 * their own userId.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload (owner)
 * @param props.userId - UUID of the user initiating the export (must match
 *   owner)
 * @param props.body - Creation payload containing export_format ("json" |
 *   "csv")
 * @returns Newly created ITodoAppDataExport record with initial attributes
 * @throws {HttpException} 403 when userId does not match authenticated owner
 */
export async function posttodoAppTodoUserUsersUserIdDataExports(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppDataExport.ICreate;
}): Promise<ITodoAppDataExport> {
  const { todoUser, userId, body } = props;

  // Authorization: owner-only
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only create data exports for your own account",
      403,
    );
  }

  // Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  // Create export job (initial state)
  const created = await MyGlobal.prisma.todo_app_data_exports.create({
    data: {
      id,
      todo_app_user_id: userId,
      status: "requested",
      export_format: body.export_format,
      created_at: now,
      updated_at: now,
      // request_ip/request_user_agent not available in this context
    },
  });

  // Map to API structure, converting DateTimes and applying brands
  return {
    id: created.id as string & tags.Format<"uuid">,
    status: created.status,
    export_format: created.export_format as ITodoAppDataExport["export_format"],
    created_at: toISOStringSafe(created.created_at),
    updated_at: toISOStringSafe(created.updated_at),
    // Optional fields are intentionally omitted at creation time
    // download_uri, file_size_bytes, checksum, status_message,
    // completed_at, expires_at, request_ip, request_user_agent
  };
}
