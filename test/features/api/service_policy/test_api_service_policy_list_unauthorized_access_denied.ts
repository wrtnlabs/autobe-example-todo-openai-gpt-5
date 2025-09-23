import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServicePolicy";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Deny non-admin listing of Service Policies and ensure no data exposure.
 *
 * Business goal:
 *
 * - The Service Policies listing endpoint is an administrative asset and must
 *   only be accessible to system administrators. This test validates that
 *   unauthenticated clients and authenticated non-admin users (todoUser role)
 *   are both denied access without leaking any data.
 *
 * Steps:
 *
 * 1. Build an unauthenticated connection and call PATCH
 *    /todoApp/systemAdmin/servicePolicies with an empty search body. Expect an
 *    error (authorization required).
 * 2. Register (join) a regular todoUser to obtain a non-admin authenticated
 *    context.
 * 3. With the todoUser token applied by the SDK, call the same endpoint again and
 *    expect an error due to insufficient privileges.
 *
 * Validation approach:
 *
 * - Use TestValidator.error to assert an error is thrown for both attempts.
 * - Do NOT assert specific HTTP status codes or error messages.
 */
export async function test_api_service_policy_list_unauthorized_access_denied(
  connection: api.IConnection,
) {
  // 1) Unauthenticated client must be denied
  // Create a fresh unauthenticated connection (do not manipulate headers afterward)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  await TestValidator.error(
    "unauthenticated client cannot list service policies",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.index(
        unauthConn,
        {
          body: {} satisfies ITodoAppServicePolicy.IRequest,
        },
      );
    },
  );

  // 2) Authenticate as a regular todoUser (non-admin)
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(authorized);

  // 3) Non-admin (todoUser) must be denied
  await TestValidator.error(
    "non-admin todoUser cannot list service policies",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.index(
        connection,
        {
          body: {} satisfies ITodoAppServicePolicy.IRequest,
        },
      );
    },
  );
}
