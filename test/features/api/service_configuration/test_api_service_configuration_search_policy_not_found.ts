import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { EServiceConfigurationOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/EServiceConfigurationOrderBy";
import type { ESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortOrder";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServiceConfiguration";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify not-found behavior when searching configurations under a non-existent
 * policy.
 *
 * Business context:
 *
 * - Service configurations are scoped by a parent service policy and visible only
 *   to systemAdmin.
 * - If the specified policyId does not exist (or is invisible), the endpoint must
 *   reject with a not-found style error.
 *
 * Steps:
 *
 * 1. Join as systemAdmin to obtain an authenticated session.
 * 2. Generate a random UUID for policyId that should not exist.
 * 3. Call PATCH
 *    /todoApp/systemAdmin/servicePolicies/{policyId}/serviceConfigurations with
 *    minimal, valid request body.
 * 4. Validate that the call rejects (no data leakage, just an error), without
 *    asserting specific HTTP status codes.
 */
export async function test_api_service_configuration_search_policy_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Prepare a random non-existent policyId
  const missingPolicyId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 3) Attempt to search configurations under the non-existent policy
  const requestBody = {
    page: 1,
    limit: 5,
    q: null,
    namespace: null,
    environment: null,
    active: null,
    value_type: null,
    effective_at: null,
    orderBy: "created_at",
    order: "desc",
  } satisfies ITodoAppServiceConfiguration.IRequest;

  // 4) Validate error (no data leakage and proper not-found style behavior)
  await TestValidator.error(
    "searching configurations under a non-existent policy should error",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.index(
        connection,
        {
          policyId: missingPolicyId,
          body: requestBody,
        },
      );
    },
  );
}
