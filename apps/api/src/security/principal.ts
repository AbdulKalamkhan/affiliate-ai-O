// Authenticated principal.
//
// Every approval, money write and audit row must be attributable to WHO caused
// it. Previously the caller could PUT their own name in the request body
// (`decidedBy`, `approvedBy`), which is not authentication — anyone with a valid
// API key could claim to be the owner.
//
// The principal is resolved by the guard from the credentials presented with the
// request and is attached to the request. Controllers read it with
// `@CurrentPrincipal()`; a value in the body can never override it.

import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type AuthMethod = "api_key";

export interface Principal {
  /** Stable, non-secret identifier for the caller (never the raw credential). */
  id: string;
  /** Role used for authorization decisions. */
  role: "owner" | "operator" | "viewer";
  authMethod: AuthMethod;
}

/** Request property the guard writes the principal to. */
export const PRINCIPAL_KEY = "principal";

/**
 * The single shared API key configured for this deployment authenticates the
 * OWNER. It is a deployment-level credential, so it maps to the owner role and
 * is labelled `api-key-owner` in the audit trail rather than a person's name.
 */
export const API_KEY_PRINCIPAL: Principal = {
  id: "api-key-owner",
  role: "owner",
  authMethod: "api_key",
};

/** Principal for a public route: authenticated as nobody, never guessed. */
export const ANONYMOUS_PRINCIPAL: Principal = {
  id: "anonymous",
  role: "viewer",
  authMethod: "api_key",
};

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal => {
  const request = context.switchToHttp().getRequest<{ [PRINCIPAL_KEY]?: Principal }>();
  return request[PRINCIPAL_KEY] ?? API_KEY_PRINCIPAL;
});
