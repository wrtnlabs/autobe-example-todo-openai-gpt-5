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
 * Search event types by keyword with explicit ascending code sort.
 *
 * This test verifies that a system administrator can:
 *
 * 1. Authenticate successfully
 * 2. Seed several event type taxonomy rows that share a unique keyword token
 * 3. Search with the keyword over code/name/description and filter active=true
 * 4. Receive results ordered by code ascending
 * 5. Observe consistent pagination metadata
 *
 * Implementation details
 *
 * - Use a unique token beginning with "todo." to isolate dataset (e.g.,
 *   "todo.{random}")
 * - Create 3 active records (A, B, C) and 1 inactive (X) sharing the token
 * - Query with search=token, active=true, sort.key="code", sort.order="asc"
 * - Validate: all returned records are active and contain token in code/name
 * - Validate: codes strictly ascending; A/B/C present; X excluded
 */
export async function test_api_event_type_search_by_keyword_and_sort_order(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
      // ip/user_agent are optional and omitted
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Seed event types with shared unique keyword token (beginning with "todo.")
  const keyword = `todo.${RandomGenerator.alphaNumeric(8)}`;

  const createA = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `${keyword}.A`,
        name: `${keyword} alpha`,
        description: `${keyword} description A`,
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(createA);

  const createB = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `${keyword}.B`,
        name: `${keyword} beta`,
        description: `${keyword} description B`,
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(createB);

  const createC = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `${keyword}.C`,
        name: `${keyword} gamma`,
        description: `${keyword} description C`,
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(createC);

  // Inactive sibling to validate active filter exclusion
  const createX = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `${keyword}.X`,
        name: `${keyword} inactive`,
        description: `${keyword} description X`,
        active: false,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(createX);

  // 3) Search & sort (code asc) with active=true filter
  const requestedPage = 1;
  const requestedLimit = 50;
  const pageResult = await api.functional.todoApp.systemAdmin.eventTypes.index(
    connection,
    {
      body: {
        page: requestedPage,
        limit: requestedLimit,
        active: true,
        search: keyword,
        sort: { key: "code", order: "asc" },
      } satisfies ITodoAppEventType.IRequest,
    },
  );
  typia.assert(pageResult);

  // 4) Validations
  const rows = pageResult.data;

  // Ensure we see at least the three active seeded rows
  TestValidator.predicate(
    "at least three results returned for the unique keyword",
    rows.length >= 3,
  );

  // All rows should be active and match the keyword in code or name
  TestValidator.predicate(
    "every result is active and matches keyword",
    rows.every(
      (r) =>
        r.active === true &&
        (r.code.includes(keyword) || r.name.includes(keyword)),
    ),
  );

  // Ordering by code asc
  const codes = rows.map((r) => r.code);
  const sortedCodes = [...codes].sort((a, b) => a.localeCompare(b));
  TestValidator.equals(
    "codes are strictly ascending by code",
    codes,
    sortedCodes,
  );

  // Inclusion of active A/B/C and exclusion of inactive X
  const codeSet = new Set(codes);
  TestValidator.predicate(
    "result contains active A",
    codeSet.has(createA.code),
  );
  TestValidator.predicate(
    "result contains active B",
    codeSet.has(createB.code),
  );
  TestValidator.predicate(
    "result contains active C",
    codeSet.has(createC.code),
  );
  TestValidator.predicate(
    "result excludes inactive X",
    !codeSet.has(createX.code),
  );

  // Pagination invariants
  TestValidator.predicate(
    "page size does not exceed pagination.limit",
    rows.length <= pageResult.pagination.limit,
  );
  TestValidator.predicate(
    "records count covers at least current page data",
    pageResult.pagination.records >= rows.length,
  );
}
