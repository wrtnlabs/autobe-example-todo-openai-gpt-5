// File path: src/decorators/AdminAuth.ts
import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { adminAuthorize } from "../providers/authorize/adminAuthorize";

/**
 * Parameter decorator authenticating Admin requests via Bearer token.
 *
 * Usage: controllerMethod(@AdminAuth() admin: AdminPayload) { ... }
 */
export const AdminAuth = (): ParameterDecorator =>
  (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    // Add Bearer token security to this route in Swagger
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({ bearer: [] });
    })(target, propertyKey as string, undefined!);

    // Register the parameter decorator via singleton instance
    singleton.get()(target, propertyKey, parameterIndex);
  };

// Singleton wrapper to avoid recreating the decorator factory
const singleton = new Singleton(() =>
  createParamDecorator(async (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return adminAuthorize(request);
  })(),
);
