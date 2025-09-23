import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import { IPageITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodo";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * List/search Todos (todo_app_todos) with pagination, filters, and sorting for
 * the authenticated owner
 *
 * Retrieves a filtered and paginated list of the caller’s own Todo items.
 *
 * - Owner isolation is enforced via todo_app_user_id
 * - Excludes soft-deleted records (deleted_at not null)
 * - Supports status filter (open/completed/all), due-window
 *   (overdue/today/future) based on Asia/Seoul day boundaries, keyword search
 *   (case-insensitive over title and description), pagination, and sorting.
 * - Default sort is created_at desc; when sorting by due_at, asc with nulls last
 *   and created_at desc tie-break.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todouser payload (todo_app_users.id)
 * @param props.body - Search/filter/pagination payload
 * @returns Paginated collection of Todo summaries optimized for list rendering
 * @throws {HttpException} 400 when limit > 100, limit < 1, or page < 1
 */
export async function patchtodoAppTodoUserTodos(props: {
  todoUser: TodouserPayload;
  body: ITodoAppTodo.IRequest;
}): Promise<IPageITodoAppTodo.ISummary> {
  const { todoUser, body } = props;

  // Defaults & validations
  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  if (Number.isNaN(page) || page < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (Number.isNaN(limit) || limit < 1 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  const status: "open" | "completed" | "all" = (body.status ?? "all") as
    | "open"
    | "completed"
    | "all";
  const sortKey: "created_at" | "due_at" = (body.sort ?? "created_at") as
    | "created_at"
    | "due_at";
  const direction: "asc" | "desc" = (body.direction ??
    (sortKey === "due_at" ? "asc" : "desc")) as "asc" | "desc";
  const search = (body.search ?? "").trim();
  const hasSearch = search.length > 0;

  // Asia/Seoul (UTC+09:00) day boundaries for due_window filter
  const dueFilter: "overdue" | "today" | "future" | null = (body.due_filter ??
    null) as "overdue" | "today" | "future" | null;
  const KST_MS = 9 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const kstNow = new Date(nowMs + KST_MS);
  const startOfKstDayUtcMs =
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - KST_MS;
  const endOfKstDayUtcMs = startOfKstDayUtcMs + 24 * 60 * 60 * 1000;
  const startOfTodayKstIso = toISOStringSafe(new Date(startOfKstDayUtcMs));
  const endOfTodayKstIso = toISOStringSafe(new Date(endOfKstDayUtcMs));

  // Build Prisma where with owner & soft-delete & coarse filters (status, due window)
  const rows = await MyGlobal.prisma.todo_app_todos.findMany({
    where: {
      todo_app_user_id: todoUser.id,
      deleted_at: null,
      ...(status === "open" && { status: "open" }),
      ...(status === "completed" && { status: "completed" }),
      ...(() => {
        if (!dueFilter) return {} as Record<string, unknown>;
        if (dueFilter === "overdue")
          return { due_at: { lt: startOfTodayKstIso } };
        if (dueFilter === "today")
          return { due_at: { gte: startOfTodayKstIso, lt: endOfTodayKstIso } };
        return { due_at: { gte: endOfTodayKstIso } }; // future
      })(),
    },
    select: {
      id: true,
      title: true,
      status: true,
      due_at: true,
      created_at: true,
      description: true, // used only for app-level keyword search
    },
  });

  // App-level case-insensitive search over title & description (avoid Prisma mode for cross-compat)
  const filtered = hasSearch
    ? rows.filter((r) => {
        const t = (r.title ?? "").toLowerCase();
        const d = (r.description ?? "").toLowerCase();
        const q = search.toLowerCase();
        return t.includes(q) || d.includes(q);
      })
    : rows;

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "created_at") {
      const aIso = toISOStringSafe(a.created_at);
      const bIso = toISOStringSafe(b.created_at);
      return direction === "asc"
        ? aIso < bIso
          ? -1
          : aIso > bIso
            ? 1
            : 0
        : aIso > bIso
          ? -1
          : aIso < bIso
            ? 1
            : 0;
    }
    // due_at sorting: asc with nulls last; tie-break by created_at desc
    const aDue = a.due_at ? toISOStringSafe(a.due_at) : null;
    const bDue = b.due_at ? toISOStringSafe(b.due_at) : null;
    if (aDue !== null && bDue !== null) {
      if (aDue < bDue) return -1;
      if (aDue > bDue) return 1;
      // tie-break: created_at desc
      const aC = toISOStringSafe(a.created_at);
      const bC = toISOStringSafe(b.created_at);
      return aC > bC ? -1 : aC < bC ? 1 : 0;
    }
    if (aDue !== null && bDue === null) return -1; // nulls last
    if (aDue === null && bDue !== null) return 1;
    // both null: tie-break by created_at desc
    const aC = toISOStringSafe(a.created_at);
    const bC = toISOStringSafe(b.created_at);
    return aC > bC ? -1 : aC < bC ? 1 : 0;
  });

  // Pagination
  const total = sorted.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  const pageSlice = start >= 0 && start < total ? sorted.slice(start, end) : [];

  // Map to ISummary with proper date conversions
  const data = pageSlice.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    title: r.title,
    status: r.status,
    due_at: r.due_at ? toISOStringSafe(r.due_at) : null,
    created_at: toISOStringSafe(r.created_at),
  }));

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
