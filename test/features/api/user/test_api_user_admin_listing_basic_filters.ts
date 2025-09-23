import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUser";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";

/**
 * Verify admin user listing: substring search, pagination, default sorting, and
 * error bound check.
 *
 * Workflow
 *
 * 1. Join as systemAdmin (token applied to main connection)
 * 2. Seed multiple todoUser accounts on a separate connection so admin token is
 *    preserved
 * 3. Search with substring "alpha" and small page size; validate filter, limit,
 *    and ordering
 * 4. Compare default vs explicit sorting (created_at desc)
 * 5. Change search to "beta" and confirm results adjust
 * 6. Error case: limit above maximum should be rejected
 */
export async function test_api_user_admin_listing_basic_filters(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminEmail: string = `admin+${RandomGenerator.alphaNumeric(8)}@example.com`;
  const adminPassword: string = RandomGenerator.alphaNumeric(12);
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Seed users on a separate connection to avoid overwriting admin Authorization
  const seedConn: api.IConnection = { ...connection, headers: {} };

  const makeEmail = (marker: string): string =>
    `${marker}${RandomGenerator.alphaNumeric(6)}@example.com`.toLowerCase();

  const alphaUsers = await ArrayUtil.asyncRepeat(4, async () => {
    const email = makeEmail("alpha+");
    const auth = await api.functional.auth.todoUser.join(seedConn, {
      body: {
        email,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
    typia.assert(auth);
    return { id: auth.id, email };
  });
  const betaUsers = await ArrayUtil.asyncRepeat(3, async () => {
    const email = makeEmail("beta+");
    const auth = await api.functional.auth.todoUser.join(seedConn, {
      body: {
        email,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
    typia.assert(auth);
    return { id: auth.id, email };
  });
  // noise users without alpha/beta to make filters meaningful
  await ArrayUtil.asyncRepeat(2, async () => {
    const email = makeEmail("gamma+");
    const out = await api.functional.auth.todoUser.join(seedConn, {
      body: {
        email,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
    typia.assert(out);
    return out.id;
  });

  // 3) Search with substring "alpha" and small page size
  const limitSmall = 2;
  const pageAlphaDefault = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        search: "alpha",
        page: 1,
        limit: limitSmall,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(pageAlphaDefault);

  // Validate: every email contains 'alpha' (case-insensitive)
  const allAlpha = pageAlphaDefault.data.every((u) =>
    u.email.toLowerCase().includes("alpha"),
  );
  TestValidator.predicate(
    "alpha search must return only emails containing 'alpha'",
    allAlpha,
  );

  // Validate: respect limit and pagination coherence
  TestValidator.predicate(
    "page data length must be <= requested limit",
    pageAlphaDefault.data.length <= limitSmall,
  );
  TestValidator.equals(
    "pagination.limit equals requested limit",
    pageAlphaDefault.pagination.limit,
    limitSmall,
  );
  TestValidator.predicate(
    "records should be >= number of items in current page",
    pageAlphaDefault.pagination.records >= pageAlphaDefault.data.length,
  );
  TestValidator.predicate(
    "pages should be >= 1 when there are any records",
    pageAlphaDefault.pagination.records === 0
      ? pageAlphaDefault.pagination.pages === 0
      : pageAlphaDefault.pagination.pages >= 1,
  );

  // 4) Sorting checks
  // 4-a) Default vs explicit created_at desc should be identical ordering on first page
  const pageAlphaExplicit =
    await api.functional.todoApp.systemAdmin.users.index(connection, {
      body: {
        search: "alpha",
        page: 1,
        limit: limitSmall,
        order_by: "created_at",
        order_direction: "desc",
      } satisfies ITodoAppUser.IRequest,
    });
  typia.assert(pageAlphaExplicit);

  TestValidator.equals(
    "default sorting equals explicit created_at desc (IDs)",
    pageAlphaDefault.data.map((d) => d.id),
    pageAlphaExplicit.data.map((d) => d.id),
  );

  // 4-b) Independently verify non-increasing created_at order on default page
  const sortedAlpha = [...pageAlphaDefault.data].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  TestValidator.equals(
    "alpha first page is ordered by created_at desc",
    pageAlphaDefault.data.map((d) => d.id),
    sortedAlpha.map((d) => d.id),
  );

  // 5) Change filter to 'beta' and confirm results adjust
  const pageBeta = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        search: "beta",
        page: 1,
        limit: 10,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(pageBeta);

  const allBeta = pageBeta.data.every((u) =>
    u.email.toLowerCase().includes("beta"),
  );
  TestValidator.predicate(
    "beta search must return only emails containing 'beta'",
    allBeta,
  );
  TestValidator.predicate(
    "beta search should return at least one record (seeded)",
    pageBeta.data.length >= 1,
  );

  // 6) Error case: limit above allowed maximum (100) should fail
  await TestValidator.error(
    "limit beyond Maximum<100> must be rejected",
    async () =>
      await api.functional.todoApp.systemAdmin.users.index(connection, {
        body: {
          limit: 1000,
        } satisfies ITodoAppUser.IRequest,
      }),
  );
}
