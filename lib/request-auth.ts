import { verifyFirebaseAppCheckToken, verifyFirebaseIdToken } from "@/lib/firebase-admin";

export type AuthenticatedRequestContext = {
  uid: string;
  appId: string;
  ipAddress: string;
};

export class RequestAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestAuthError";
    this.status = status;
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    throw new RequestAuthError(401, "Missing Authorization header.");
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new RequestAuthError(401, "Invalid Authorization header.");
  }

  return token;
}

function getAppCheckToken(request: Request) {
  const token = request.headers.get("x-firebase-appcheck")?.trim();
  if (!token) {
    throw new RequestAuthError(401, "Missing X-Firebase-AppCheck header.");
  }
  return token;
}

export function getClientIpAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequestContext> {
  const idToken = getBearerToken(request);
  const appCheckToken = getAppCheckToken(request);

  try {
    const [decodedIdToken, appCheckResult] = await Promise.all([
      verifyFirebaseIdToken(idToken),
      verifyFirebaseAppCheckToken(appCheckToken)
    ]);

    return {
      uid: decodedIdToken.uid,
      appId: "verified-via-rest",
      ipAddress: getClientIpAddress(request)
    };
  } catch (error) {
    throw new RequestAuthError(401, error instanceof Error ? error.message : "Token verification failed.");
  }
}
