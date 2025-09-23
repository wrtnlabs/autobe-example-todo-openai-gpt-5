import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAuditLog";
import type { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_user_audit_logs_admin_actor_filters_and_pagination(
  connection: api.IConnection,
) {
  // Create and authenticate a system administrator
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8-64 chars policy satisfied
    ip: "127.0.0.1",
    user_agent: "e2e-test-agent/1.0",
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // Time window to cover all seeded operations
  const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // 1) Seed event type: create → update → delete
  const eventTypeCreate = {
    code: `evt_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const eventType = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    { body: eventTypeCreate },
  );
  typia.assert(eventType);

  const eventTypeUpdate = {
    name: `${eventType.name} updated`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
  } satisfies ITodoAppEventType.IUpdate;
  const eventType2 = await api.functional.todoApp.systemAdmin.eventTypes.update(
    connection,
    { eventTypeId: eventType.id, body: eventTypeUpdate },
  );
  typia.assert(eventType2);

  await api.functional.todoApp.systemAdmin.eventTypes.erase(connection, {
    eventTypeId: eventType.id,
  });

  // 2) Create a service policy
  const policyBody = {
    namespace: "security",
    code: `pol_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: new Date(Date.now() - 60 * 1000).toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Configuration under the policy: create → update → delete
  const configCreate = {
    todo_app_service_policy_id: null, // bound by path policyId
    namespace: "auth",
    environment: "dev",
    key: `cfg_${RandomGenerator.alphaNumeric(6)}`,
    value: "https://example.test/callback",
    value_type: "uri",
    is_secret: true,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    effective_from: new Date(Date.now() - 60 * 1000).toISOString(),
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const config: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policy.id, body: configCreate },
    );
  typia.assert(config);

  const configUpdate = {
    value: "https://example.test/callback-updated",
    description: RandomGenerator.paragraph({ sentences: 3 }),
    active: false,
    is_secret: true,
  } satisfies ITodoAppServiceConfiguration.IUpdate;
  const config2: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.update(
      connection,
      { policyId: policy.id, configurationId: config.id, body: configUpdate },
    );
  typia.assert(config2);

  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    { policyId: policy.id, configurationId: config.id },
  );

  // 4) Feature flag under the policy: create → update → delete
  const flagCreate = {
    namespace: "ui",
    environment: "dev",
    code: `ff_${RandomGenerator.alphaNumeric(6)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    rollout_percentage: 50,
    target_audience: RandomGenerator.paragraph({ sentences: 4 }),
    start_at: null,
    end_at: null,
    todo_app_service_policy_id: null, // bound by path
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: flagCreate },
    );
  typia.assert(flag);

  const flagUpdate = {
    name: `${flag.name} v2`,
    active: true,
    rollout_percentage: 10,
    description: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoAppFeatureFlag.IUpdate;
  const flag2: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.update(
      connection,
      { policyId: policy.id, featureFlagId: flag.id, body: flagUpdate },
    );
  typia.assert(flag2);

  await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
    connection,
    { policyId: policy.id, featureFlagId: flag.id },
  );

  // 5) Query audit logs for this admin (actor scope) in the prepared window
  const actorQueryBody = {
    page: 1,
    limit: 20,
    actor_user_id: admin.id,
    created_from: windowStart,
    created_to: windowEnd,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ITodoAppAuditLog.IRequest;
  const page1: IPageITodoAppAuditLog =
    await api.functional.todoApp.systemAdmin.users.auditLogs.index(connection, {
      userId: admin.id,
      body: actorQueryBody,
    });
  typia.assert(page1);

  // Basic pagination assertions
  TestValidator.predicate(
    "audit page has non-negative counts",
    page1.pagination.current >= 0 &&
      page1.pagination.limit >= 0 &&
      page1.pagination.pages >= 0 &&
      page1.pagination.records >= 0,
  );

  // In simulate mode, random data is returned; skip strict content checks
  const isSim = connection.simulate === true;
  if (!isSim) {
    for (const log of page1.data) {
      TestValidator.equals(
        "actor_user_id equals admin.id",
        log.actor_user_id,
        admin.id,
      );
    }
  }

  // 6) Resource-focused filter (use the deleted eventType's id as resource_id)
  const resourceQueryBody = {
    page: 1,
    limit: 20,
    actor_user_id: admin.id,
    resource_id: eventType.id,
    created_from: windowStart,
    created_to: windowEnd,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ITodoAppAuditLog.IRequest;
  const byResource: IPageITodoAppAuditLog =
    await api.functional.todoApp.systemAdmin.users.auditLogs.index(connection, {
      userId: admin.id,
      body: resourceQueryBody,
    });
  typia.assert(byResource);

  // 7) Future window → empty results
  const futureFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const futureTo = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const futureBody = {
    page: 1,
    limit: 10,
    actor_user_id: admin.id,
    created_from: futureFrom,
    created_to: futureTo,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ITodoAppAuditLog.IRequest;
  const futurePage: IPageITodoAppAuditLog =
    await api.functional.todoApp.systemAdmin.users.auditLogs.index(connection, {
      userId: admin.id,
      body: futureBody,
    });
  typia.assert(futurePage);
  TestValidator.equals(
    "future window returns empty data",
    futurePage.data.length,
    0,
  );

  // 8) Oversized page (limit > 100) should error
  await TestValidator.error("oversized page limit must fail", async () => {
    const badBody = {
      page: 1,
      limit: 1000, // exceeds tags.Maximum<100>
      actor_user_id: admin.id,
      created_from: windowStart,
      created_to: windowEnd,
      sort_by: "created_at",
      sort_dir: "desc",
    } satisfies ITodoAppAuditLog.IRequest;
    await api.functional.todoApp.systemAdmin.users.auditLogs.index(connection, {
      userId: admin.id,
      body: badBody,
    });
  });

  // 9) Malformed UUID in filter should error
  await TestValidator.error("malformed UUID filter must fail", async () => {
    const uuidBadBody = {
      page: 1,
      limit: 10,
      actor_user_id: "not-a-uuid", // tags.Format<"uuid"> violation
      created_from: windowStart,
      created_to: windowEnd,
    } satisfies ITodoAppAuditLog.IRequest;
    await api.functional.todoApp.systemAdmin.users.auditLogs.index(connection, {
      userId: admin.id,
      body: uuidBadBody,
    });
  });
}
