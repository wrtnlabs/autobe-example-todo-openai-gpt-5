import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppBusinessEvent";
import { IPageITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppBusinessEvent";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate business events (todo_app_business_events) with filters
 * and sorting.
 *
 * Retrieve a filtered, paginated, and sorted collection of business events from
 * todo_app_business_events. Supports time ranges, actor/target/session filters,
 * event-type classification, source/ip, and free-text search on message.
 * Restricted to systemAdmin role.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Search criteria, pagination, and sorting options
 * @returns Paginated list of business events matching the filters
 * @throws {HttpException} 401 when missing authentication (handled upstream),
 *   403 when not a system admin
 * @throws {HttpException} 400 on invalid pagination or time window
 */
export async function patchtodoAppSystemAdminBusinessEvents(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppBusinessEvent.IRequest;
}): Promise<IPageITodoAppBusinessEvent> {
  const { systemAdmin, body } = props;

  // Authorization: ensure systemAdmin membership is active
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
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
    select: { id: true },
  });
  if (!membership) {
    throw new HttpException("Forbidden: systemAdmin privileges required", 403);
  }

  // Pagination defaults and validation
  const pageIndexRaw = body.page ?? 0;
  const pageSizeRaw = body.limit ?? 20;
  const pageIndex = Number(pageIndexRaw);
  const pageSize = Number(pageSizeRaw);
  if (!Number.isFinite(pageIndex) || pageIndex < 0) {
    throw new HttpException("Bad Request: invalid page index", 400);
  }
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  // Sort defaults (occurred_at desc)
  const sortKey: ITodoAppBusinessEvent.ESortKey = body.sort ?? "occurred_at";
  const sortDir: EOrderDirection = body.direction === "asc" ? "asc" : "desc";

  // Time window validation using timestamp numbers (no Date typing)
  const fromProvided =
    body.occurred_from !== undefined && body.occurred_from !== null;
  const toProvided =
    body.occurred_to !== undefined && body.occurred_to !== null;
  const fromTs = fromProvided ? Date.parse(body.occurred_from as string) : NaN;
  const toTs = toProvided ? Date.parse(body.occurred_to as string) : NaN;
  if (fromProvided && Number.isNaN(fromTs)) {
    throw new HttpException(
      "Bad Request: occurred_from must be ISO date-time",
      400,
    );
  }
  if (toProvided && Number.isNaN(toTs)) {
    throw new HttpException(
      "Bad Request: occurred_to must be ISO date-time",
      400,
    );
  }
  if (fromProvided && toProvided && fromTs > toTs) {
    throw new HttpException(
      "Bad Request: occurred_from is after occurred_to",
      400,
    );
  }

  // Build WHERE condition (complex -> allowed to prebuild)
  const whereCondition = {
    ...(body.todo_app_event_type_id !== undefined && {
      todo_app_event_type_id: body.todo_app_event_type_id,
    }),
    ...(body.todo_app_user_id !== undefined && {
      todo_app_user_id: body.todo_app_user_id,
    }),
    ...(body.todo_app_todo_id !== undefined && {
      todo_app_todo_id: body.todo_app_todo_id,
    }),
    ...(body.todo_app_session_id !== undefined && {
      todo_app_session_id: body.todo_app_session_id,
    }),
    ...(fromProvided || toProvided
      ? {
          occurred_at: {
            ...(fromProvided && { gte: body.occurred_from as string }),
            ...(toProvided && { lte: body.occurred_to as string }),
          },
        }
      : {}),
    ...(body.source !== undefined &&
      body.source !== null && {
        source: { contains: body.source },
      }),
    ...(body.ip !== undefined &&
      body.ip !== null && {
        ip: { contains: body.ip },
      }),
    ...(body.message_q !== undefined &&
      body.message_q !== null && {
        message: { contains: body.message_q },
      }),
  };

  // Execute queries in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_business_events.findMany({
      where: whereCondition,
      orderBy:
        sortKey === "created_at"
          ? { created_at: sortDir }
          : { occurred_at: sortDir },
      skip: pageIndex * pageSize,
      take: pageSize,
      select: {
        id: true,
        todo_app_event_type_id: true,
        todo_app_user_id: true,
        todo_app_todo_id: true,
        todo_app_session_id: true,
        occurred_at: true,
        message: true,
        source: true,
        external_id: true,
        ip: true,
        user_agent: true,
        created_at: true,
        updated_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_business_events.count({ where: whereCondition }),
  ]);

  const result = {
    pagination: {
      current: Number(pageIndex),
      limit: Number(pageSize),
      records: total,
      pages: Math.ceil(total / Number(pageSize)),
    },
    data: rows.map((row) => ({
      id: row.id,
      todo_app_event_type_id: row.todo_app_event_type_id,
      todo_app_user_id: row.todo_app_user_id ?? null,
      todo_app_todo_id: row.todo_app_todo_id ?? null,
      todo_app_session_id: row.todo_app_session_id ?? null,
      occurred_at: toISOStringSafe(row.occurred_at),
      message: row.message ?? null,
      source: row.source ?? null,
      external_id: row.external_id ?? null,
      ip: row.ip ?? null,
      user_agent: row.user_agent ?? null,
      created_at: toISOStringSafe(row.created_at),
      updated_at: toISOStringSafe(row.updated_at),
    })),
  };

  // Validate and brand output without using type assertions
  return typia.assert<IPageITodoAppBusinessEvent>(result);
}
