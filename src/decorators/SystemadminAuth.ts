import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { systemadminAuthorize } from "../providers/authorize/systemadminAuthorize";

/**
 * Parameter decorator to inject authenticated System Admin payload.
 *
 * Usage:
 *   someMethod(@SystemadminAuth() admin: SystemadminPayload) { ... }
 */
export const SystemadminAuth =
  (): ParameterDecorator =>
  (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    // Add bearer auth requirement to Swagger docs
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({
        bearer: [],
      });
    })(target, propertyKey as string, undefined!);

    // Register the singleton decorator instance on the parameter
    singleton.get()(target, propertyKey, parameterIndex);
  };

// Singleton wrapper for the createParamDecorator to avoid redundant instances
const singleton = new Singleton(() =>
  createParamDecorator(async (_0: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return systemadminAuthorize(request);
  })(),
);
