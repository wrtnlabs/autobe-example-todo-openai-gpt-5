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
 * Search service configurations by namespace with active=true and verify
 * secrets redaction in summaries.
 *
 * This test ensures that the administrative search endpoint returns only the
 * configurations matching a given namespace when filtered with active=true, and
 * that summary rows do not leak the raw configuration value (i.e., redaction by
 * omission). It also validates pagination metadata when the page size is large
 * enough to contain all matched rows.
 *
 * Steps:
 *
 * 1. Join as a system administrator (auth token handled by SDK automatically)
 * 2. Create four configurations:
 *
 *    - Two ACTIVE under the same namespace (one secret, one non-secret)
 *    - One INACTIVE under the same namespace
 *    - One ACTIVE under a different namespace
 * 3. Search with filters { namespace, active: true }, limit: 100, page: 1
 * 4. Validate:
 *
 *    - All results satisfy namespace and active=true
 *    - The two active records in our namespace are included
 *    - The inactive record and other-namespace record are excluded
 *    - Summaries do not contain a raw 'value' field
 *    - Pagination metadata is coherent (records == data.length, pages == 1, limit
 *         echoed)
 */
export async function test_api_service_configuration_search_by_namespace_active_with_secrets_redaction(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create configurations
  const baseNamespace = `ns_${RandomGenerator.alphaNumeric(8)}`;
  const env = "dev"; // environment is optional; keep consistent to simplify uniqueness

  const secretActive =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      {
        body: {
          namespace: baseNamespace,
          environment: env,
          key: `key_secret_${RandomGenerator.alphaNumeric(6)}`,
          value: `s3cr3t_${RandomGenerator.alphaNumeric(12)}`,
          value_type: "string",
          is_secret: true,
          description: RandomGenerator.paragraph({ sentences: 5 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(secretActive);

  const publicActive =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      {
        body: {
          namespace: baseNamespace,
          environment: env,
          key: `key_public_${RandomGenerator.alphaNumeric(6)}`,
          value: RandomGenerator.alphaNumeric(24),
          value_type: "string",
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 4 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(publicActive);

  const inactiveSameNs =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      {
        body: {
          namespace: baseNamespace,
          environment: env,
          key: `key_inactive_${RandomGenerator.alphaNumeric(6)}`,
          value: RandomGenerator.alphaNumeric(24),
          value_type: "string",
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 3 }),
          active: false,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(inactiveSameNs);

  const otherNsActive =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      {
        body: {
          namespace: `${baseNamespace}_other`,
          environment: env,
          key: `key_other_${RandomGenerator.alphaNumeric(6)}`,
          value: RandomGenerator.alphaNumeric(24),
          value_type: "string",
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 3 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(otherNsActive);

  // 3) Search with filters { namespace, active: true }
  const limit = 100;
  const page =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          page: 1,
          limit,
          namespace: baseNamespace,
          active: true,
          orderBy: "created_at",
          order: "desc",
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(page);

  // 4) Business validations
  // 4-1) All results match namespace and active=true
  TestValidator.predicate(
    "all results have matching namespace and active=true",
    () =>
      page.data.every(
        (row) => row.namespace === baseNamespace && row.active === true,
      ),
  );

  const ids = page.data.map((d) => d.id);

  // 4-2) Inclusion/exclusion checks
  TestValidator.predicate(
    "secret active record is included",
    ids.includes(secretActive.id),
  );
  TestValidator.predicate(
    "public active record is included",
    ids.includes(publicActive.id),
  );
  TestValidator.predicate(
    "inactive record in same namespace is excluded",
    !ids.includes(inactiveSameNs.id),
  );
  TestValidator.predicate(
    "active record in other namespace is excluded",
    !ids.includes(otherNsActive.id),
  );

  // 4-3) Secrets redaction in summaries (no raw 'value' field present)
  TestValidator.predicate(
    "no summary item contains raw value field",
    page.data.every((row) => !JSON.stringify(row).includes('"value":')),
  );
  TestValidator.predicate(
    "result set contains at least one secret and one non-secret",
    page.data.some((r) => r.is_secret === true) &&
      page.data.some((r) => r.is_secret === false),
  );

  // 4-4) Pagination metadata (limit large enough → single page)
  const expectedMatched = 2; // secretActive + publicActive
  TestValidator.equals(
    "records equal number of matched rows",
    page.pagination.records,
    expectedMatched,
  );
  TestValidator.equals(
    "data length equals matched records",
    page.data.length,
    expectedMatched,
  );
  TestValidator.equals(
    "limit echoes requested value",
    page.pagination.limit,
    limit,
  );
  TestValidator.equals(
    "single page expected when limit >= records",
    page.pagination.pages,
    1,
  );
}
