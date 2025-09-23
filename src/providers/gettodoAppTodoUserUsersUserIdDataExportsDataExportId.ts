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
 * Get a user’s data export job by ID from todo_app_data_exports
 *
 * Retrieves a single personal data export job that belongs to the specified
 * user. Enforces ownership using the authenticated todoUser and the path
 * userId. Excludes soft-deleted records (deleted_at IS NULL). Returns full
 * export job details for client status rendering and download link handling.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todouser payload (owner context)
 * @param props.userId - Owner user's UUID (path parameter)
 * @param props.dataExportId - Data export job UUID (path parameter)
 * @returns Detailed personal data export job entity
 * @throws {HttpException} 404 when user mismatch or record not found
 */
export async function gettodoAppTodoUserUsersUserIdDataExportsDataExportId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  dataExportId: string & tags.Format<"uuid">;
}): Promise<ITodoAppDataExport> {
  const { todoUser, userId, dataExportId } = props;

  // Ownership guard: do not leak existence; return Not Found on mismatch
  if (todoUser.id !== userId) {
    throw new HttpException("Not Found", 404);
  }

  const row = await MyGlobal.prisma.todo_app_data_exports.findFirst({
    where: {
      id: dataExportId,
      todo_app_user_id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      status: true,
      export_format: true,
      download_uri: true,
      file_size_bytes: true,
      checksum: true,
      status_message: true,
      completed_at: true,
      expires_at: true,
      request_ip: true,
      request_user_agent: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  // Narrow export_format to the allowed API enum union without DB-specific tags
  const exportFormat = row.export_format === "csv" ? "csv" : "json";

  return {
    id: row.id as string & tags.Format<"uuid">,
    status: row.status,
    export_format: exportFormat,
    download_uri:
      row.download_uri === null
        ? null
        : (row.download_uri as string & tags.Format<"uri">),
    file_size_bytes:
      row.file_size_bytes === null
        ? null
        : (row.file_size_bytes as number & tags.Type<"int32">),
    checksum: row.checksum ?? null,
    status_message: row.status_message ?? null,
    completed_at: row.completed_at ? toISOStringSafe(row.completed_at) : null,
    expires_at: row.expires_at ? toISOStringSafe(row.expires_at) : null,
    request_ip: row.request_ip ?? null,
    request_user_agent: row.request_user_agent ?? null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
