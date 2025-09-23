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
 * Validate filtering, sorting, pagination, and access control for login
 * attempts.
 *
 * Business flow
 *
 * 1. Create a todoUser (join) and capture userId and authentication context
 * 2. Generate login attempts for that user:
 *
 *    - A failed attempt (wrong password) and
 *    - Multiple successful attempts (correct password)
 * 3. List attempts and derive ip/user_agent substrings from actual data
 * 4. Validate filters using derived substrings (ip, user_agent, and combined)
 * 5. Validate sorting over occurred_at in both desc and asc directions
 * 6. Validate pagination constraints (limit=1)
 * 7. Validate access control: unauthenticated and cross-user access must fail
 */
export async function test_api_login_attempts_ip_user_agent_filters(
  connection: api.IConnection,
) {
  // 1) Create the subject user
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const user1Auth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(user1Auth);
  const user1Id = user1Auth.id;

  // 2) Produce attempts: one failed, multiple successes
  await TestValidator.error(
    "login with wrong password should fail and be recorded as failed attempt",
    async () => {
      await api.functional.auth.todoUser.login(connection, {
        body: {
          email,
          password: RandomGenerator.alphaNumeric(10), // still 8-64
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );

  // A couple of successful logins
  await api.functional.auth.todoUser.login(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  await api.functional.auth.todoUser.login(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });

  // 3) Baseline listing & pick substrings for filtering
  const basePage =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: user1Id,
        body: {
          page: 1,
          limit: 50,
          sort_by: "occurred_at",
          sort_dir: "desc",
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(basePage);

  TestValidator.predicate(
    "baseline page should contain at least one attempt",
    basePage.data.length > 0,
  );

  // Derive substrings
  const probe = basePage.data[0];
  const ipSub = probe.ip.substring(0, Math.min(3, probe.ip.length));
  const hasUA =
    probe.user_agent !== null &&
    probe.user_agent !== undefined &&
    probe.user_agent.length > 0;
  const uaSub = hasUA
    ? probe.user_agent!.substring(0, Math.min(5, probe.user_agent!.length))
    : undefined;

  // 4) Filtering validation - IP only
  const byIp = await api.functional.todoApp.todoUser.users.loginAttempts.index(
    connection,
    {
      userId: user1Id,
      body: {
        ip: ipSub,
        page: 1,
        limit: 50,
        sort_by: "occurred_at",
        sort_dir: "desc",
      } satisfies ITodoAppLoginAttempt.IRequest,
    },
  );
  typia.assert(byIp);
  TestValidator.predicate(
    "ip filter should restrict results to attempts containing the ip substring",
    byIp.data.every((a) => a.ip.includes(ipSub)),
  );

  // 4-2) Filtering validation - User-Agent only (if available)
  if (uaSub !== undefined) {
    const byUA =
      await api.functional.todoApp.todoUser.users.loginAttempts.index(
        connection,
        {
          userId: user1Id,
          body: {
            user_agent: uaSub,
            page: 1,
            limit: 50,
            sort_by: "occurred_at",
            sort_dir: "desc",
          } satisfies ITodoAppLoginAttempt.IRequest,
        },
      );
    typia.assert(byUA);
    TestValidator.predicate(
      "user_agent filter should restrict results to attempts containing the UA substring",
      byUA.data.every(
        (a) =>
          a.user_agent !== null &&
          a.user_agent !== undefined &&
          a.user_agent.includes(uaSub),
      ),
    );

    // Combined filters
    const byIpAndUA =
      await api.functional.todoApp.todoUser.users.loginAttempts.index(
        connection,
        {
          userId: user1Id,
          body: {
            ip: ipSub,
            user_agent: uaSub,
            page: 1,
            limit: 50,
            sort_by: "occurred_at",
            sort_dir: "desc",
          } satisfies ITodoAppLoginAttempt.IRequest,
        },
      );
    typia.assert(byIpAndUA);
    TestValidator.predicate(
      "combined ip+user_agent filters should restrict results to records matching both substrings",
      byIpAndUA.data.every(
        (a) =>
          a.ip.includes(ipSub) &&
          a.user_agent !== null &&
          a.user_agent !== undefined &&
          a.user_agent.includes(uaSub),
      ),
    );
  }

  // 5) Sorting validation (occurred_at desc -> non-increasing)
  const descPage =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: user1Id,
        body: {
          sort_by: "occurred_at",
          sort_dir: "desc",
          page: 1,
          limit: 50,
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(descPage);
  TestValidator.predicate(
    "occurred_at desc ordering should be non-increasing",
    descPage.data.every(
      (a, i, arr) =>
        i === 0 ||
        new Date(arr[i - 1].occurred_at).getTime() >=
          new Date(a.occurred_at).getTime(),
    ),
  );

  // occurred_at asc -> non-decreasing
  const ascPage =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: user1Id,
        body: {
          sort_by: "occurred_at",
          sort_dir: "asc",
          page: 1,
          limit: 50,
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(ascPage);
  TestValidator.predicate(
    "occurred_at asc ordering should be non-decreasing",
    ascPage.data.every(
      (a, i, arr) =>
        i === 0 ||
        new Date(arr[i - 1].occurred_at).getTime() <=
          new Date(a.occurred_at).getTime(),
    ),
  );

  // 6) Pagination check: limit=1
  const page1 = await api.functional.todoApp.todoUser.users.loginAttempts.index(
    connection,
    {
      userId: user1Id,
      body: {
        page: 1,
        limit: 1,
        sort_by: "occurred_at",
        sort_dir: "desc",
      } satisfies ITodoAppLoginAttempt.IRequest,
    },
  );
  typia.assert(page1);
  TestValidator.predicate(
    "limit=1 should return at most one record",
    page1.data.length <= 1,
  );

  // 7) Access control validations
  // 7-1) Unauthenticated must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated client cannot access login attempts",
    async () =>
      await api.functional.todoApp.todoUser.users.loginAttempts.index(
        unauthConn,
        {
          userId: user1Id,
          body: {
            page: 1,
            limit: 10,
          } satisfies ITodoAppLoginAttempt.IRequest,
        },
      ),
  );

  // 7-2) Cross-user should fail
  const otherEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const otherPassword: string = RandomGenerator.alphaNumeric(12);
  const user2Auth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: otherEmail,
      password: otherPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(user2Auth);

  await TestValidator.error(
    "another authenticated user cannot access the subject user's login attempts",
    async () =>
      await api.functional.todoApp.todoUser.users.loginAttempts.index(
        connection,
        {
          userId: user1Id,
          body: {
            page: 1,
            limit: 10,
          } satisfies ITodoAppLoginAttempt.IRequest,
        },
      ),
  );
}
