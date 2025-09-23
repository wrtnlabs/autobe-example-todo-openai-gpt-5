import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate that service policy detail retrieval rejects non-existent and
 * invalid identifiers.
 *
 * Business flow:
 *
 * 1. Authenticate as systemAdmin (join) to obtain an authorized context.
 * 2. Attempt to fetch a policy by a well-formed but non-existent UUID → expect an
 *    error.
 * 3. Attempt to fetch a policy by an invalid UUID string → expect a validation
 *    error.
 *
 * Notes:
 *
 * - We do not check specific HTTP status codes; only that an error occurs.
 * - For invalid UUID format, we trigger a client-side validation error using
 *   typia.assert to satisfy the tagged UUID type, without violating
 *   compile-time types.
 */
export async function test_api_service_policy_detail_not_found_and_validation(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
      user_agent: "nestia-e2e",
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Well-formed but non-existent UUID should result in an error
  const nonExistentPolicyId = typia.assert<string & tags.Format<"uuid">>(
    "00000000-0000-0000-0000-000000000000",
  );
  await TestValidator.error(
    "fetching non-existent service policy should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
        policyId: nonExistentPolicyId,
      });
    },
  );

  // 3) Invalid UUID format should be rejected (client-side assertion before request)
  const invalidPolicyId = "not-a-uuid";
  await TestValidator.error(
    "invalid UUID format should be rejected",
    async () => {
      // This assert throws synchronously within the async closure
      const malformed = typia.assert<string & tags.Format<"uuid">>(
        invalidPolicyId,
      );
      await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
        policyId: malformed,
      });
    },
  );
}
