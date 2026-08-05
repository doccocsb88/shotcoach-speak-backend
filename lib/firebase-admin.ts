import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createSign } from "node:crypto";

import { getEnv } from "@/lib/config";

function getPrivateKey() {
  return getEnv().FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function getFirebaseApp() {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const env = getEnv();
  const privateKey = getPrivateKey();

  if (env.FIREBASE_CLIENT_EMAIL && privateKey && env.FIREBASE_PROJECT_ID) {
    return initializeApp({
      credential: cert({
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
        projectId: env.FIREBASE_PROJECT_ID
      }),
      projectId: env.FIREBASE_PROJECT_ID
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: env.FIREBASE_PROJECT_ID
  });
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
