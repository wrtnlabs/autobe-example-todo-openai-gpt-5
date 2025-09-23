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
 * Get a specific data export job (todo_app_data_exports) by ID for the
 * authenticated user.
 *
 * Retrieves details of a personal data export job owned by the authenticated
 * todoUser. Enforces ownership by filtering with todo_app_user_id and excludes
 * soft-deleted records. Returns lifecycle fields including status,
 * export_format, optional download_uri, integrity metadata, and timestamps. If
 * the record does not exist or is not owned by the caller, a generic 404 is
 * returned without revealing existence.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated Todo User making the request
 * @param props.dataExportId - UUID of the data export job to fetch
 * @returns Detailed information about the requested data export job
 * @throws {HttpException} 404 when the export is not found or not owned by the
 *   caller
 */
export async function gettodoAppTodoUserDataExportsDataExportId(props: {
  todoUser: TodouserPayload;
  dataExportId: string & tags.Format<"uuid">;
}): Promise<ITodoAppDataExport> {
  const { todoUser, dataExportId } = props;

  const found = await MyGlobal.prisma.todo_app_data_exports.findFirst({
    where: {
      id: dataExportId,
      todo_app_user_id: todoUser.id,
      deleted_at: null,
    },
  });

  if (!found) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: dataExportId,
    status: found.status,
    export_format: found.export_format as ETodoAppDataExportFormat,
    download_uri:
      found.download_uri === null
        ? null
        : (found.download_uri as string & tags.Format<"uri">),
    file_size_bytes:
      found.file_size_bytes === null
        ? null
        : (found.file_size_bytes as number & tags.Type<"int32">),
    checksum: found.checksum ?? null,
    status_message: found.status_message ?? null,
    completed_at: found.completed_at
      ? toISOStringSafe(found.completed_at)
      : null,
    expires_at: found.expires_at ? toISOStringSafe(found.expires_at) : null,
    request_ip: found.request_ip ?? null,
    request_user_agent: found.request_user_agent ?? null,
    created_at: toISOStringSafe(found.created_at),
    updated_at: toISOStringSafe(found.updated_at),
  };
}
