import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ELoginAttemptSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/ELoginAttemptSortBy";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppLoginAttempt";
import type { ITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppLoginAttempt";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";

/**
 * List and filter a user's login attempts with pagination and sorting, plus
 * access control boundaries.
 *
 * Purpose:
 *
 * - Ensure the login attempts index supports success/failure filtering,
 *   occurred_at time windowing, pagination (page/limit), and sorting
 *   (occurred_at asc/desc).
 * - Confirm access control: unauthenticated and cross-user calls are denied.
 *
 * Steps:
 *
 * 1. Create a todoUser (Alice) via join and keep id for path param.
 * 2. Produce several failed login attempts (wrong password) using
 *    TestValidator.error.
 * 3. Produce a successful login attempt (correct password).
 * 4. Query attempts with success=false, time window (from ~5 minutes ago to now),
 *    limit=2, sort by occurred_at desc.
 *
 *    - Validate all records are failures, sorted properly, and within pagination
 *         limit.
 * 5. Query attempts with success=true, same window, occurred_at desc, validate
 *    presence and sorting.
 * 6. Query attempts with occurred_at asc to validate ascending sorting works.
 * 7. Query page=2 for failures to validate pagination mechanics.
 * 8. Access control: unauthenticated (headers: {}) should be denied; cross-user
 *    (Bob) should be denied.
 */
export async function test_api_login_attempts_filtering_pagination_and_sorting(
  connection: api.IConnection,
) {
  // 1) Register Alice
  const aliceEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const alicePassword: string = RandomGenerator.alphaNumeric(12);
  const alice = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: aliceEmail,
      password: alicePassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(alice);

  // 2) Failed login attempts (generate audit: success=false)
  const wrongPassword = alicePassword + "x";
  for (let i = 0; i < 3; i++) {
    await TestValidator.error(
      "failed login should produce audit record and throw",
      async () => {
        await api.functional.auth.todoUser.login(connection, {
          body: {
            email: aliceEmail,
            password: wrongPassword,
          } satisfies ITodoAppTodoUserLogin.IRequest,
        });
      },
    );
  }

  // 3) Successful login (generate audit: success=true)
  const aliceAuth = await api.functional.auth.todoUser.login(connection, {
    body: {
      email: aliceEmail,
      password: alicePassword,
      keep_me_signed_in: true,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  typia.assert(aliceAuth);

  // Define a recent time window (from 5 minutes ago to now)
  const nowIso: string & tags.Format<"date-time"> =
    new Date().toISOString() as string & tags.Format<"date-time">;
  const fiveMinAgoIso: string & tags.Format<"date-time"> = new Date(
    Date.now() - 5 * 60 * 1000,
  ).toISOString() as string & tags.Format<"date-time">;

  // 4) Query failures with filters, pagination and sorting (desc)
  const failuresPage1 =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: alice.id,
        body: {
          page: 1,
          limit: 2,
          success: false,
          occurred_from: fiveMinAgoIso,
          occurred_to: nowIso,
          sort_by: "occurred_at",
          sort_dir: "desc",
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(failuresPage1);

  // Validate: all records are failures
  await TestValidator.predicate(
    "all returned attempts are failures",
    async () => failuresPage1.data.every((a) => a.success === false),
  );
  // Validate: emails match the attempted email
  await TestValidator.predicate(
    "all returned attempts are for the expected email",
    async () => failuresPage1.data.every((a) => a.email === aliceEmail),
  );
  // Validate: sorted by occurred_at desc
  await TestValidator.predicate(
    "failures sorted by occurred_at desc",
    async () =>
      failuresPage1.data.every((v, i, arr) =>
        i === 0
          ? true
          : new Date(arr[i - 1].occurred_at).getTime() >=
            new Date(v.occurred_at).getTime(),
      ),
  );
  // Validate: within pagination limit
  TestValidator.predicate(
    "failures page1 length <= limit",
    failuresPage1.data.length <= failuresPage1.pagination.limit,
  );
  // Validate: ip presence (non-empty)
  TestValidator.predicate(
    "each failure has non-empty ip",
    failuresPage1.data.every(
      (a) => typeof a.ip === "string" && a.ip.length > 0,
    ),
  );

  // 5) Query successes (desc)
  const successesDesc =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: alice.id,
        body: {
          page: 1,
          limit: 5,
          success: true,
          occurred_from: fiveMinAgoIso,
          occurred_to: nowIso,
          sort_by: "occurred_at",
          sort_dir: "desc",
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(successesDesc);
  TestValidator.predicate(
    "at least one success attempt present",
    successesDesc.data.some((a) => a.success === true),
  );
  TestValidator.predicate(
    "successes sorted by occurred_at desc",
    successesDesc.data.every((v, i, arr) =>
      i === 0
        ? true
        : new Date(arr[i - 1].occurred_at).getTime() >=
          new Date(v.occurred_at).getTime(),
    ),
  );

  // 6) Sorting asc validation
  const successesAsc =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: alice.id,
        body: {
          page: 1,
          limit: 5,
          success: true,
          occurred_from: fiveMinAgoIso,
          occurred_to: nowIso,
          sort_by: "occurred_at",
          sort_dir: "asc",
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(successesAsc);
  TestValidator.predicate(
    "successes sorted by occurred_at asc",
    successesAsc.data.every((v, i, arr) =>
      i === 0
        ? true
        : new Date(arr[i - 1].occurred_at).getTime() <=
          new Date(v.occurred_at).getTime(),
    ),
  );

  // 7) Page 2 of failures to validate pagination mechanics
  const failuresPage2 =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: alice.id,
        body: {
          page: 2,
          limit: 2,
          success: false,
          occurred_from: fiveMinAgoIso,
          occurred_to: nowIso,
          sort_by: "occurred_at",
          sort_dir: "desc",
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(failuresPage2);
  TestValidator.predicate(
    "failures page2 length <= limit",
    failuresPage2.data.length <= failuresPage2.pagination.limit,
  );

  // 8) Access control
  // 8-a) Unauthenticated should be denied
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated cannot list user's login attempts",
    async () => {
      await api.functional.todoApp.todoUser.users.loginAttempts.index(
        unauthConn,
        {
          userId: alice.id,
          body: {
            page: 1,
            limit: 2,
            occurred_from: fiveMinAgoIso,
            occurred_to: nowIso,
          } satisfies ITodoAppLoginAttempt.IRequest,
        },
      );
    },
  );

  // 8-b) Cross-user should be denied
  const bobEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const bobPassword: string = RandomGenerator.alphaNumeric(12);
  const bob = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: bobEmail,
      password: bobPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(bob);

  await TestValidator.error("cross-user access should be denied", async () => {
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: alice.id, // trying to access Alice while authenticated as Bob
        body: {
          page: 1,
          limit: 2,
          occurred_from: fiveMinAgoIso,
          occurred_to: nowIso,
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  });
}
