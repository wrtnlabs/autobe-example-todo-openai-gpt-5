import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify soft deletion (logical deletion) of a service configuration and
 * post-deletion read behavior.
 *
 * Scenario:
 *
 * 1. Authenticate as a systemAdmin by joining.
 * 2. Create a service policy to host configurations.
 * 3. Create a configuration under the policy and ensure it is readable and not
 *    deleted.
 * 4. Delete the configuration via logical deletion endpoint.
 * 5. Attempt to read the configuration again and expect an error (record excluded
 *    due to deleted_at).
 *
 * Notes:
 *
 * - Do not validate HTTP status codes; only ensure that an error occurs after
 *   deletion.
 * - Request bodies use `satisfies` with strict DTOs; responses are validated with
 *   typia.assert().
 */
export async function test_api_service_configuration_deletion_soft_delete_and_post_read(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin (join)
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // 2) Create a service policy
  const valueType: EConfigValueType = "string";
  const policyBody = {
    namespace: `ns_${RandomGenerator.alphabets(6)}`,
    code: `code_${RandomGenerator.alphaNumeric(12)}`,
    name: `Policy ${RandomGenerator.alphabets(5)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 3 }),
    value_type: valueType,
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a configuration under the policy
  const cfgBody = {
    namespace: policy.namespace,
    environment: RandomGenerator.pick(["dev", "staging", "prod"] as const),
    key: `cfg_${RandomGenerator.alphaNumeric(10)}`,
    value: RandomGenerator.paragraph({ sentences: 4 }),
    value_type: valueType,
    is_secret: typia.random<boolean>(),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const created: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policy.id, body: cfgBody },
    );
  typia.assert(created);

  // Validate created configuration is readable and not deleted yet
  const readBeforeDelete: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
      connection,
      { configurationId: created.id },
    );
  typia.assert(readBeforeDelete);
  TestValidator.equals(
    "fetched configuration id matches created id",
    readBeforeDelete.id,
    created.id,
  );
  TestValidator.predicate(
    "configuration must not be soft-deleted before erase",
    readBeforeDelete.deleted_at === null ||
      readBeforeDelete.deleted_at === undefined,
  );

  // 4) Delete (soft delete) the configuration
  await api.functional.todoApp.systemAdmin.serviceConfigurations.erase(
    connection,
    { configurationId: created.id },
  );

  // 5) Post-deletion: detail read must fail (record excluded from normal flows)
  await TestValidator.error(
    "reading configuration after soft delete must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
        connection,
        { configurationId: created.id },
      );
    },
  );
}
