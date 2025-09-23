import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import { IPageITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppPrivacyConsent";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function patchtodoAppTodoUserPrivacyConsents(props: {
  todoUser: TodouserPayload;
  body: ITodoAppPrivacyConsent.IRequest;
}): Promise<IPageITodoAppPrivacyConsent.ISummary> {
  /**
   * List and search privacy consents (todo_app_privacy_consents) with
   * pagination and filters
   *
   * Retrieves a filtered, sorted, and paginated list of privacy consent records
   * for the authenticated todo user. Applies ownership scoping
   * (todo_app_user_id) and excludes soft-deleted records (deleted_at IS NULL).
   * Supports free-text search on purpose_name, filtering by
   * purpose_code/granted state and date ranges for granted_at/revoked_at.
   * Default sorting: granted_at DESC.
   *
   * @param props - Request properties
   * @param props.todoUser - The authenticated todo user performing the request
   * @param props.body - Pagination, search, and filter parameters
   * @returns Paginated list of privacy consent summaries
   * @throws {HttpException} 400 when limit is out of [1,100]
   */
  const { todoUser, body } = props;

  // Pagination defaults and validation
  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const page = Math.max(1, Number(pageRaw));
  const limit = Number(limitRaw);
  if (limit < 1 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }
  const skip = (page - 1) * limit;

  // Search term (ignore blank/whitespace)
  const searchTrimmed = (body.search ?? "").trim();
  const hasSearch = searchTrimmed.length > 0;

  // Build where condition with strict null/undefined handling
  const whereCondition = {
    todo_app_user_id: todoUser.id,
    deleted_at: null,
    ...(body.purpose_code !== undefined &&
      body.purpose_code !== null && {
        purpose_code: body.purpose_code,
      }),
    ...(body.granted !== undefined &&
      body.granted !== null && {
        granted: body.granted,
      }),
    ...(hasSearch && {
      purpose_name: {
        contains: searchTrimmed,
      },
    }),
    ...((body.granted_from !== undefined && body.granted_from !== null) ||
    (body.granted_to !== undefined && body.granted_to !== null)
      ? {
          granted_at: {
            ...(body.granted_from !== undefined &&
              body.granted_from !== null && {
                gte: body.granted_from,
              }),
            ...(body.granted_to !== undefined &&
              body.granted_to !== null && {
                lte: body.granted_to,
              }),
          },
        }
      : {}),
    ...((body.revoked_from !== undefined && body.revoked_from !== null) ||
    (body.revoked_to !== undefined && body.revoked_to !== null)
      ? {
          revoked_at: {
            ...(body.revoked_from !== undefined &&
              body.revoked_from !== null && {
                gte: body.revoked_from,
              }),
            ...(body.revoked_to !== undefined &&
              body.revoked_to !== null && {
                lte: body.revoked_to,
              }),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_privacy_consents.findMany({
      where: whereCondition,
      select: {
        id: true,
        purpose_code: true,
        purpose_name: true,
        granted: true,
        granted_at: true,
        revoked_at: true,
      },
      orderBy: { granted_at: "desc" },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_privacy_consents.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    purpose_code: r.purpose_code,
    purpose_name: r.purpose_name,
    granted: r.granted,
    granted_at: toISOStringSafe(r.granted_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
  }));

  const pages = Math.ceil(total / limit);
  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
