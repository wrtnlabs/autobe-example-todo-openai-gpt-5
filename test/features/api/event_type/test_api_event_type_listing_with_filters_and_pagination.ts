import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortOrder";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEventType";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * List/search event types with active filter, keyword search, sorting and
 * pagination.
 *
 * Business flow:
 *
 * 1. System admin joins (auth token auto-applied by SDK).
 * 2. Admin creates two event types (A & B) that share a code prefix for keyword
 *    search.
 * 3. Admin toggles B to inactive.
 * 4. Admin lists event types with filters active=true and search by the shared
 *    prefix, sorted by code ascending and limited page size.
 *
 * Validations:
 *
 * - Response typing via typia.assert.
 * - Data.length <= limit, limit>0.
 * - Every item is active and matches keyword in code/name.
 * - Sorting by code ascending is honored.
 * - A included; B excluded (due to inactive filter).
 */
export async function test_api_event_type_listing_with_filters_and_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Seed data: create two event types with a shared prefix
  const prefix = `evt_${RandomGenerator.alphaNumeric(8)}`;

  const createA = {
    code: `${prefix}.alpha`,
    name: `Alpha ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph(),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const a: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createA,
    });
  typia.assert(a);

  const createB = {
    code: `${prefix}.beta`,
    name: `Beta ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph(),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const b: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createB,
    });
  typia.assert(b);

  // 3) Toggle B to inactive
  const updateB = {
    active: false,
  } satisfies ITodoAppEventType.IUpdate;
  const bUpdated: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.update(connection, {
      eventTypeId: b.id,
      body: updateB,
    });
  typia.assert(bUpdated);

  // 4) List with filters: active=true, search by prefix, sort by code asc, page=1, limit=30
  const pageNum = 1 satisfies number as number;
  const pageLimit = 30 satisfies number as number; // within 1..100 per IRequest
  const requestBody = {
    page: pageNum,
    limit: pageLimit,
    active: true,
    search: prefix,
    sort: { key: "code", order: "asc" },
  } satisfies ITodoAppEventType.IRequest;
  const pageResult: IPageITodoAppEventType.ISummary =
    await api.functional.todoApp.systemAdmin.eventTypes.index(connection, {
      body: requestBody,
    });
  typia.assert(pageResult);

  // Validate pagination coherence
  TestValidator.predicate(
    "items length should be less than or equal to requested limit",
    pageResult.data.length <= pageLimit,
  );
  TestValidator.predicate(
    "pagination limit should be positive",
    pageResult.pagination.limit > 0,
  );
  TestValidator.predicate(
    "pagination current/page counters are non-negative",
    pageResult.pagination.current >= 0 &&
      pageResult.pagination.pages >= 0 &&
      pageResult.pagination.records >= 0,
  );
  TestValidator.predicate(
    "when page has items, records should be at least items count",
    pageResult.data.length === 0 ||
      pageResult.pagination.records >= pageResult.data.length,
  );

  // Validate filter: only active records matching keyword (code/name contains prefix)
  TestValidator.predicate(
    "all listed event types are active",
    pageResult.data.every((it) => it.active === true),
  );
  TestValidator.predicate(
    "all listed event types match keyword in code or name",
    pageResult.data.every(
      (it) => it.code.includes(prefix) || it.name.includes(prefix),
    ),
  );

  // Validate sorting: code ascending
  const isSortedByCodeAsc = pageResult.data.every(
    (it, idx, arr) => idx === 0 || arr[idx - 1].code <= it.code,
  );
  TestValidator.predicate(
    "results are sorted by code ascending",
    isSortedByCodeAsc,
  );

  // Validate inclusion/exclusion
  const foundA = pageResult.data.find((it) => it.id === a.id);
  const foundB = pageResult.data.find((it) => it.id === b.id);
  TestValidator.predicate(
    "event type A should be included in results",
    foundA !== undefined,
  );
  TestValidator.predicate(
    "event type B should be excluded due to inactive filter",
    foundB === undefined,
  );
}
