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

/**
 * Search a user’s privacy consent history (todo_app_privacy_consents)
 *
 * Retrieves a filtered, paginated list of privacy consent records for the
 * authenticated todoUser identified by the path parameter userId. Results are
 * scoped to the owner and support filters such as purpose_code, granted flag,
 * free-text search over purpose_name, and date ranges on granted_at and
 * revoked_at. Ordering defaults to granted_at DESC (and created_at DESC as a
 * tiebreaker).
 *
 * Authorization: Only the authenticated owner (todoUser) may access their own
 * consent history. Cross-user access is forbidden.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload
 * @param props.userId - Owner user’s ID (path parameter)
 * @param props.body - Search, filter, and pagination parameters
 * @returns Paginated list of privacy consent records belonging to the user
 * @throws {HttpException} 403 when accessing another user's data
 * @throws {HttpException} 400 when pagination parameters are invalid
 */
export async function patchtodoAppTodoUserUsersUserIdPrivacyConsents(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppPrivacyConsent.IRequest;
}): Promise<IPageITodoAppPrivacyConsent> {
  const { todoUser, userId, body } = props;

  // Authorization: owner-only access
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only list your own privacy consents",
      403,
    );
  }

  // Pagination defaults and validation
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;

  if (typeof pageInput !== "number" || pageInput < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (typeof limitInput !== "number" || limitInput < 1 || limitInput > 100) {
    throw new HttpException("Bad Request: limit must be within 1..100", 400);
  }

  const page = Number(pageInput);
  const limit = Number(limitInput);
  const skip = (page - 1) * limit;

  // Build where condition (schema-first, includes soft-delete)
  const whereCondition = {
    todo_app_user_id: userId,
    deleted_at: null,
    ...(body.purpose_code !== undefined &&
      body.purpose_code !== null && {
        purpose_code: body.purpose_code,
      }),
    ...(body.granted !== undefined &&
      body.granted !== null && {
        granted: body.granted,
      }),
    ...(body.search !== undefined &&
      body.search !== null && {
        purpose_name: { contains: body.search },
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
        expires_at: true,
        policy_version: true,
        source: true,
        ip: true,
        user_agent: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [{ granted_at: "desc" }, { created_at: "desc" }],
      skip: skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_privacy_consents.count({ where: whereCondition }),
  ]);

  const data: ITodoAppPrivacyConsent[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    purpose_code: r.purpose_code,
    purpose_name: r.purpose_name,
    granted: r.granted,
    granted_at: toISOStringSafe(r.granted_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
    expires_at: r.expires_at ? toISOStringSafe(r.expires_at) : null,
    policy_version: r.policy_version,
    source: r.source ?? null,
    ip: r.ip ?? null,
    user_agent: r.user_agent ?? null,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Math.ceil(total / Number(limit)),
    },
    data,
  };
}
