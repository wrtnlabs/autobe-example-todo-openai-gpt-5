// File path: src/decorators/GuestAuth.ts
import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { guestAuthorize } from "../providers/authorize/guestAuthorize";

/**
 * GuestAuth decorator
 *
 * Adds Bearer auth requirement to Swagger and injects the authenticated
 * `GuestPayload` into the controller method parameter.
 */
export const GuestAuth = (): ParameterDecorator =>
  (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    // Add Bearer security requirement to Swagger
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({ bearer: [] });
    })(target, propertyKey as string, undefined!);

    // Bind parameter decorator (singleton for efficiency)
    singleton.get()(target, propertyKey, parameterIndex);
  };

const singleton = new Singleton(() =>
  createParamDecorator(async (_0: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return guestAuthorize(request);
  })(),
);
