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
 * Deny cross-user access to login attempt details while allowing owner access.
 *
 * This test verifies that a todoUser cannot fetch another user's specific login
 * attempt record. It also confirms that the owner (User B) can retrieve the
 * same record successfully.
 *
 * Steps:
 *
 * 1. Create User A via join (capture A's id and credentials).
 * 2. Create User B via join (capture B's id and credentials) – SDK sets B's auth.
 * 3. Under B, optionally produce a failing login attempt (wrong password) to
 *    ensure at least one attempt record exists (error is expected and ignored
 *    via validator).
 * 4. Under B, list login attempts (index) with userId=B to capture one
 *    loginAttemptId. If empty, perform a successful login for B and re-list;
 *    ensure non-empty.
 * 5. Under B, fetch attempt detail (at) with userId=B and the captured id – should
 *    succeed.
 * 6. Switch session to User A by logging in as A.
 * 7. While authenticated as A, attempt to fetch the B-owned attempt using userId=A
 *    and B's loginAttemptId – must be denied (error expected).
 */
export async function test_api_login_attempt_detail_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Create User A
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordA: string = RandomGenerator.alphaNumeric(12);
  const authA = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: emailA,
      password: passwordA,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authA);

  // 2) Create User B (auth context becomes B by SDK side-effect)
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordB: string = RandomGenerator.alphaNumeric(12);
  const authB = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: emailB,
      password: passwordB,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authB);

  // 3) Under B, create a failing login attempt (wrong credential) to ensure an attempt exists
  await TestValidator.error(
    "B wrong password login should be recorded as a failed attempt",
    async () => {
      await api.functional.auth.todoUser.login(connection, {
        body: {
          email: emailB,
          password: passwordB + "x", // invalid on purpose (still correct type)
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );

  // 4) Under B, list login attempts to capture an id
  let page = await api.functional.todoApp.todoUser.users.loginAttempts.index(
    connection,
    {
      userId: authB.id,
      body: {
        page: 1,
        limit: 10,
      } satisfies ITodoAppLoginAttempt.IRequest,
    },
  );
  typia.assert(page);

  if (page.data.length === 0) {
    // Ensure at least one attempt by successful login, then re-list
    const reloginB = await api.functional.auth.todoUser.login(connection, {
      body: {
        email: emailB,
        password: passwordB,
      } satisfies ITodoAppTodoUserLogin.IRequest,
    });
    typia.assert(reloginB);

    page = await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: authB.id,
        body: {
          page: 1,
          limit: 10,
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
    typia.assert(page);
  }

  const hasAny = page.data.length > 0;
  TestValidator.predicate(
    "B should have at least one login attempt after join/login operations",
    hasAny,
  );
  if (!hasAny) throw new Error("No login attempts found for user B");

  const attemptId = page.data[0].id;

  // 5) Owner success path: B can fetch its own attempt detail
  const ownDetail =
    await api.functional.todoApp.todoUser.users.loginAttempts.at(connection, {
      userId: authB.id,
      loginAttemptId: attemptId,
    });
  typia.assert(ownDetail);
  TestValidator.equals(
    "owner can access own login attempt and id must match",
    ownDetail.id,
    attemptId,
  );

  // 6) Switch to User A session
  const reloginA = await api.functional.auth.todoUser.login(connection, {
    body: {
      email: emailA,
      password: passwordA,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  typia.assert(reloginA);

  // 7) Cross-user denial: A must not access B's attempt
  await TestValidator.error(
    "cross-user access must be denied (A cannot read B's login attempt)",
    async () => {
      await api.functional.todoApp.todoUser.users.loginAttempts.at(connection, {
        userId: authA.id,
        loginAttemptId: attemptId,
      });
    },
  );
}
