import { authenticateRequest, AuthenticatedRequestContext, RequestAuthError } from "@/lib/request-auth";
import { getEnv } from "@/lib/config";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { jsonError } from "@/lib/http";

export async function withProtectedRoute(
  request: Request,
  routeId: string,
  handler: (authContext: AuthenticatedRequestContext) => Promise<Response>
) {
  const env = getEnv();

  if (!env.FIREBASE_AUTH_ENFORCED) {
    return handler({
      uid: "local-dev",
      appId: "local-dev",
      ipAddress: "local-dev"
    });
  }

  try {
    const authContext = await authenticateRequest(request);
    enforceRateLimit(`${routeId}:${authContext.uid}:${authContext.ipAddress}`);
    return await handler(authContext);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return jsonError(error.status, error.message);
    }

    if (error instanceof RateLimitError) {
      return jsonError(429, "Rate limit exceeded.", {
        retryAfterSeconds: error.retryAfterSeconds
      });
    }

    throw error;
  }
}
