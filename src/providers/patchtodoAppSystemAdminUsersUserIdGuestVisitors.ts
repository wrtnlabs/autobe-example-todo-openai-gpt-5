import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import { IPageITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppGuestVisitor";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and list guestVisitor assignments (todo_app_guestvisitors) for a user
 * with pagination and filters.
 *
 * Retrieves a filtered, paginated list of guestVisitor role assignments for the
 * specified userId. Supports active-only filtering (revoked_at IS NULL), date
 * range filters on granted_at and revoked_at, and sorting by granted_at,
 * revoked_at, or created_at. This endpoint is read-only and restricted to
 * system administrators for governance visibility.
 *
 * Authorization: Requires a valid systemAdmin identity. Additionally verifies
 * active, non-revoked system admin membership in DB with an active, verified
 * owning user.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Administrator payload
 * @param props.userId - Target user's UUID to list guestVisitor assignments for
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paginated results containing guestVisitor assignment summaries for
 *   the user
 * @throws {HttpException} 401 when authentication payload is missing/invalid
 * @throws {HttpException} 403 when caller lacks active systemAdmin membership
 * @throws {HttpException} 400 when pagination or sorting parameters are invalid
 */
export async function patchtodoAppSystemAdminUsersUserIdGuestVisitors(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppGuestVisitor.IRequest;
}): Promise<IPageITodoAppGuestVisitor.ISummary> {
  const { systemAdmin, userId, body } = props;

  // Authorization: require systemAdmin role discriminator and active membership
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException(
      "Unauthorized: systemAdmin authentication required",
      401,
    );
  }
  const adminMembership = await MyGlobal.prisma.todo_app_systemadmins.findFirst(
    {
      where: {
        todo_app_user_id: systemAdmin.id,
        revoked_at: null,
        deleted_at: null,
        user: {
          deleted_at: null,
          status: "active",
          email_verified: true,
        },
      },
    },
  );
  if (adminMembership === null) {
    throw new HttpException(
      "Forbidden: Active systemAdmin membership required",
      403,
    );
  }

  // Pagination validation and defaults
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;
  const page = Number(pageInput);
  const limit = Number(limitInput);
  if (!Number.isFinite(page) || page < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }
  const skip = (page - 1) * limit;

  // Sorting defaults and validation (DTO already constrains, but enforce defaults)
  const orderByField: "granted_at" | "revoked_at" | "created_at" =
    body.order_by === "revoked_at" ||
    body.order_by === "created_at" ||
    body.order_by === "granted_at"
      ? body.order_by
      : "granted_at";
  const orderDir: "asc" | "desc" =
    body.order_dir === "asc" || body.order_dir === "desc"
      ? body.order_dir
      : "desc";

  // WHERE condition builder (reused for list and count)
  const whereCondition = {
    todo_app_user_id: userId,
    deleted_at: null,
    ...(body.active_only === true && { revoked_at: null }),
    ...((body.granted_from !== undefined && body.granted_from !== null) ||
    (body.granted_to !== undefined && body.granted_to !== null)
      ? {
          granted_at: {
            ...(body.granted_from !== undefined &&
              body.granted_from !== null && { gte: body.granted_from }),
            ...(body.granted_to !== undefined &&
              body.granted_to !== null && { lte: body.granted_to }),
          },
        }
      : {}),
    // Apply revoked_at range filters only when not restricting to active-only (revoked_at IS NULL)
    ...(body.active_only !== true &&
    ((body.revoked_from !== undefined && body.revoked_from !== null) ||
      (body.revoked_to !== undefined && body.revoked_to !== null))
      ? {
          revoked_at: {
            ...(body.revoked_from !== undefined &&
              body.revoked_from !== null && { gte: body.revoked_from }),
            ...(body.revoked_to !== undefined &&
              body.revoked_to !== null && { lte: body.revoked_to }),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_guestvisitors.findMany({
      where: whereCondition,
      select: {
        id: true,
        todo_app_user_id: true,
        granted_at: true,
        revoked_at: true,
        created_at: true,
        updated_at: true,
      },
      orderBy:
        orderByField === "revoked_at"
          ? { revoked_at: orderDir }
          : orderByField === "created_at"
            ? { created_at: orderDir }
            : { granted_at: orderDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_guestvisitors.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    todo_app_user_id: r.todo_app_user_id as string & tags.Format<"uuid">,
    granted_at: toISOStringSafe(r.granted_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  const records = Number(total);
  const pages = records === 0 ? 0 : Math.ceil(records / Number(limit));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records,
      pages: Number(pages),
    },
    data,
  };
}
