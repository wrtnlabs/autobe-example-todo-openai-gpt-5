import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";

/**
 * Admin self-detail retrieval
 *
 * Workflow
 *
 * 1. Join an administrator account via POST /auth/admin/join and become
 *    authenticated
 * 2. Call GET /todoMvp/admin/admins/{adminId} using the id from the join response
 * 3. Validate that the returned administrator detail matches the authenticated
 *    account
 *
 *    - Id and email equality
 *    - Status equality
 *    - Deleted_at is nullish on a fresh account
 *    - Formats and shapes are validated by typia.assert()
 * 4. Negative: fetching a clearly non-existent UUID must result in an error
 */
export async function test_api_admin_account_detail_by_admin_self(
  connection: api.IConnection,
) {
  // 1) Join an administrator (auth session is established by SDK automatically)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;

  const authorized = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);
  // Optional: assert the token shape explicitly as well
  typia.assert<IAuthorizationToken>(authorized.token);

  // 2) Retrieve self detail using the returned admin id
  const detail = await api.functional.todoMvp.admin.admins.at(connection, {
    adminId: authorized.id,
  });
  typia.assert(detail);

  // 3) Business assertions: identity and lifecycle consistency
  TestValidator.equals(
    "detail.id matches authenticated admin id",
    detail.id,
    authorized.id,
  );
  TestValidator.equals(
    "detail.email matches authenticated admin email",
    detail.email,
    authorized.email,
  );
  TestValidator.equals(
    "detail.status matches authenticated admin status",
    detail.status,
    authorized.status,
  );
  TestValidator.predicate(
    "freshly created admin should not be soft-deleted",
    detail.deleted_at === null || detail.deleted_at === undefined,
  );

  // 4) Negative: try fetching a clearly non-existent admin id
  const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
  await TestValidator.error(
    "fetching non-existent admin should fail",
    async () => {
      await api.functional.todoMvp.admin.admins.at(connection, {
        adminId: typia.assert<string & tags.Format<"uuid">>(NON_EXISTENT_UUID),
      });
    },
  );
}
