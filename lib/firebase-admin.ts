import { createPublicKey, createSign, verify as verifySignature } from "node:crypto";

import { getEnv } from "@/lib/config";

type FirebaseIdTokenPayload = {
  aud?: string;
  auth_time?: number;
  exp?: number;
  iat?: number;
  iss?: string;
  sub?: string;
  user_id?: string;
  uid?: string;
  [key: string]: unknown;
};

let secureTokenCertsCache:
  | {
      expiresAt: number;
      certs: Record<string, string>;
    }
  | null = null;

function getPrivateKey() {
  return getEnv().FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(decodeBase64Url(value).toString("utf8")) as T;
}

function getMaxAgeMs(cacheControl: string | null) {
  const match = cacheControl?.match(/max-age=(\d+)/i);
  if (!match) {
    return 60 * 60 * 1000;
  }

  return Number.parseInt(match[1], 10) * 1000;
}

async function getSecureTokenCerts() {
  if (secureTokenCertsCache && secureTokenCertsCache.expiresAt > Date.now()) {
    return secureTokenCertsCache.certs;
  }

  const response = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase public certs (${response.status}).`);
  }

  const certs = (await response.json()) as Record<string, string>;
  secureTokenCertsCache = {
    certs,
    expiresAt: Date.now() + getMaxAgeMs(response.headers.get("cache-control"))
  };

  return certs;
}

async function getServiceAccountAccessToken() {
  const env = getEnv();
  const privateKey = getPrivateKey();

  if (!env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    throw new Error("Firebase service account credentials are missing.");
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const jwtHeader = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtPayload = toBase64Url(
    JSON.stringify({
      iss: env.FIREBASE_CLIENT_EMAIL,
      sub: env.FIREBASE_CLIENT_EMAIL,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/firebase",
      iat: nowInSeconds,
      exp: nowInSeconds + 3600
    })
  );
  const unsignedJwt = `${jwtHeader}.${jwtPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = toBase64Url(signer.sign(privateKey));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedJwt}.${signature}`
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to mint Google access token (${response.status}).`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Google access token response did not include access_token.");
  }

  return payload.access_token;
}

export async function verifyFirebaseIdToken(idToken: string) {
  const env = getEnv();
  const parts = idToken.split(".");

  if (parts.length !== 3) {
    throw new Error("Firebase ID token is malformed.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJwtPart<{ alg?: string; kid?: string; typ?: string }>(encodedHeader);
  const payload = parseJwtPart<FirebaseIdTokenPayload>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Firebase ID token header is invalid.");
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required to verify Firebase ID tokens.");
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error("Firebase ID token audience mismatch.");
  }

  if (payload.iss !== expectedIssuer) {
    throw new Error("Firebase ID token issuer mismatch.");
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Firebase ID token subject is missing.");
  }

  if ((payload.sub as string).length > 128) {
    throw new Error("Firebase ID token subject is too long.");
  }

  if (typeof payload.exp !== "number" || payload.exp <= nowInSeconds) {
    throw new Error("Firebase ID token has expired.");
  }

  if (typeof payload.iat !== "number" || payload.iat > nowInSeconds + 300) {
    throw new Error("Firebase ID token issued-at time is invalid.");
  }

  if (typeof payload.auth_time !== "number" || payload.auth_time > nowInSeconds + 300) {
    throw new Error("Firebase ID token auth_time is invalid.");
  }

  const certs = await getSecureTokenCerts();
  const certificate = certs[header.kid];

  if (!certificate) {
    throw new Error("Firebase public certificate not found for token key id.");
  }

  const verified = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey(certificate),
    decodeBase64Url(encodedSignature)
  );

  if (!verified) {
    throw new Error("Firebase ID token signature verification failed.");
  }

  return {
    uid: (payload.user_id as string | undefined) ?? (payload.uid as string | undefined) ?? payload.sub
  };
}

export async function verifyFirebaseAppCheckToken(appCheckToken: string) {
  const env = getEnv();
  const projectId = env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required to verify App Check tokens.");
  }

  const accessToken = await getServiceAccountAccessToken();
  const response = await fetch(
    `https://firebaseappcheck.googleapis.com/v1beta/projects/${projectId}:verifyAppCheckToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        appCheckToken
      })
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message || `App Check verification failed (${response.status}).`);
  }

  return response.json() as Promise<{ alreadyConsumed?: boolean }>;
}
