import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Retrieve full service configuration details by ID as a system administrator.
 *
 * Business context:
 *
 * - Only systemAdmin users can manage and view detailed configuration records.
 * - List endpoints may redact secret values, but detailed reads for admins can
 *   expose full values per organizational policy.
 *
 * Flow:
 *
 * 1. Join as a system admin to obtain an authenticated session.
 * 2. Create a new configuration with is_secret=true and a realistic value
 *    consistent with a selected value_type.
 * 3. Fetch the configuration by its id using the detail endpoint.
 * 4. Validate core fields, persistence, and timestamp consistency.
 */
export async function test_api_service_configuration_detail_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Create a service configuration (is_secret=true) with a consistent value/value_type
  const valueType: EConfigValueType = ((): EConfigValueType => {
    return RandomGenerator.pick([
      "string",
      "int",
      "double",
      "boolean",
      "datetime",
      "uri",
    ] as const);
  })();
  const generatedValue: string = ((): string => {
    switch (valueType) {
      case "boolean":
        return RandomGenerator.pick(["true", "false"] as const);
      case "int":
        return String(Math.floor(Math.random() * 100000));
      case "double":
        return String(Math.round(Math.random() * 100000) / 100);
      case "datetime":
        return new Date().toISOString();
      case "uri":
        return `https://example.com/${RandomGenerator.alphabets(8)}`;
      case "string":
      default:
        return RandomGenerator.paragraph({
          sentences: 3,
          wordMin: 3,
          wordMax: 8,
        });
    }
  })();

  const createBody = {
    namespace: "core",
    environment: "dev",
    key: `feature_${RandomGenerator.alphabets(8)}`,
    value: generatedValue,
    value_type: valueType,
    is_secret: true,
    description: RandomGenerator.paragraph({
      sentences: 5,
      wordMin: 3,
      wordMax: 8,
    }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;

  const created: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // Validate that persisted entity reflects requested fields
  TestValidator.equals(
    "namespace persisted",
    created.namespace,
    createBody.namespace,
  );
  TestValidator.equals(
    "environment persisted",
    created.environment ?? null,
    createBody.environment ?? null,
  );
  TestValidator.equals("key persisted", created.key, createBody.key);
  TestValidator.equals(
    "value persisted (admin can see full value even if secret)",
    created.value,
    createBody.value,
  );
  TestValidator.equals("value_type persisted", created.value_type, valueType);
  TestValidator.equals(
    "is_secret persisted",
    created.is_secret,
    createBody.is_secret,
  );
  TestValidator.equals("active persisted", created.active, createBody.active);
  TestValidator.equals(
    "description persisted",
    created.description ?? null,
    createBody.description ?? null,
  );

  // 3) Fetch detail by id
  const fetched: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
      connection,
      { configurationId: created.id },
    );
  typia.assert(fetched);

  // 4) Validate detail equals creation result in key business fields
  TestValidator.equals("detail.id matches created.id", fetched.id, created.id);
  TestValidator.equals(
    "detail.namespace matches",
    fetched.namespace,
    created.namespace,
  );
  TestValidator.equals(
    "detail.environment matches",
    fetched.environment ?? null,
    created.environment ?? null,
  );
  TestValidator.equals("detail.key matches", fetched.key, created.key);
  TestValidator.equals(
    "detail.value matches (secret visible to admin)",
    fetched.value,
    created.value,
  );
  TestValidator.equals(
    "detail.value_type matches",
    fetched.value_type,
    created.value_type,
  );
  TestValidator.equals(
    "detail.is_secret matches",
    fetched.is_secret,
    created.is_secret,
  );
  TestValidator.equals("detail.active matches", fetched.active, created.active);
  TestValidator.equals(
    "detail.description matches",
    fetched.description ?? null,
    created.description ?? null,
  );

  // Timestamps: presence validated by typia, also ensure consistency between create and detail
  TestValidator.equals(
    "created_at consistent between create and detail",
    fetched.created_at,
    created.created_at,
  );
  TestValidator.equals(
    "updated_at consistent between create and detail",
    fetched.updated_at,
    created.updated_at,
  );
}
