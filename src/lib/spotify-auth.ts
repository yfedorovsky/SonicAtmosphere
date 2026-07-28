import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db";
import { spotifyAccounts, users } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSessionUserId } from "@/lib/session";
import { getCurrentUser, refreshAccessToken } from "@/lib/spotify";
import type { SpotifyUser } from "@/types";

// Refresh slightly early so a token never expires mid-request.
const REFRESH_BUFFER_MS = 60_000;

export interface SpotifyTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface SpotifyProfile {
  id: string;
  display_name?: string;
  email?: string;
  images?: { url: string }[];
}

// Single source of truth for "give me a working user access token".
// DB-backed accounts refresh + persist (including rotated refresh tokens);
// sessions from the pre-DB era fall back to the legacy token cookies.
export async function getValidSpotifyToken(): Promise<string | null> {
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    const [account] = await db
      .select()
      .from(spotifyAccounts)
      .where(eq(spotifyAccounts.userId, userId))
      .limit(1);

    if (account?.accessToken) {
      const access = decryptSecret(account.accessToken);
      const fresh =
        account.tokenExpiresAt &&
        account.tokenExpiresAt.getTime() - REFRESH_BUFFER_MS > Date.now();
      if (access && fresh) return access;

      const refresh = account.refreshToken ? decryptSecret(account.refreshToken) : null;
      if (refresh) {
        const result = await refreshAccessToken(refresh);
        if (result) {
          await db
            .update(spotifyAccounts)
            .set({
              accessToken: encryptSecret(result.access_token),
              refreshToken: result.refresh_token
                ? encryptSecret(result.refresh_token)
                : account.refreshToken,
              tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000),
              updatedAt: new Date(),
            })
            .where(eq(spotifyAccounts.id, account.id));
          return result.access_token;
        }
      }
    }
  }

  return getLegacyCookieToken();
}

async function getLegacyCookieToken(): Promise<string | null> {
  const store = await cookies();
  const access = store.get("spotify_access_token")?.value;
  if (access) return access;

  const refresh = store.get("spotify_refresh_token")?.value;
  if (!refresh) return null;

  const result = await refreshAccessToken(refresh);
  if (!result) return null;
  store.set("spotify_access_token", result.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: result.expires_in,
    path: "/",
  });
  return result.access_token;
}

// Called from the OAuth callback. If this Spotify account is already linked
// to a user (e.g. connecting from a second browser), adopt that user so their
// drafts follow the Spotify identity; otherwise link it to the session user
// (creating the user row if needed). Never writes cookies — the callback sets
// the session cookie on its redirect response with the returned userId.
export async function linkSpotifyAccount(
  profile: SpotifyProfile,
  tokens: SpotifyTokens,
  sessionUserId: string | null,
): Promise<string> {
  const db = await getDb();
  const tokenFields = {
    displayName: profile.display_name ?? null,
    email: profile.email ?? null,
    imageUrl: profile.images?.[0]?.url ?? null,
    accessToken: encryptSecret(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope ?? null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select()
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.spotifyUserId, profile.id))
    .limit(1);

  if (existing) {
    await db
      .update(spotifyAccounts)
      .set({
        ...tokenFields,
        // Keep the existing refresh token if Spotify didn't send a new one.
        refreshToken: tokenFields.refreshToken ?? existing.refreshToken,
      })
      .where(eq(spotifyAccounts.id, existing.id));
    return existing.userId;
  }

  let userId = sessionUserId;
  if (userId) {
    await db.insert(users).values({ id: userId }).onConflictDoNothing();
  } else {
    const [row] = await db.insert(users).values({}).returning({ id: users.id });
    userId = row.id;
  }
  // The session user may already have a (different) Spotify account linked —
  // user_id is unique, so switching accounts must replace the existing row.
  await db
    .insert(spotifyAccounts)
    .values({
      userId,
      spotifyUserId: profile.id,
      ...tokenFields,
    })
    .onConflictDoUpdate({
      target: spotifyAccounts.userId,
      set: {
        spotifyUserId: profile.id,
        ...tokenFields,
      },
    });
  return userId;
}

// Connection status for /api/auth/status: DB first, legacy cookies second.
export async function getConnectedSpotifyUser(): Promise<SpotifyUser | null> {
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    const [account] = await db
      .select()
      .from(spotifyAccounts)
      .where(eq(spotifyAccounts.userId, userId))
      .limit(1);
    if (account) {
      return {
        id: account.spotifyUserId,
        display_name: account.displayName ?? "",
        images: account.imageUrl ? [{ url: account.imageUrl }] : [],
        email: account.email ?? "",
      };
    }
  }

  const token = await getLegacyCookieToken();
  if (!token) return null;
  return getCurrentUser(token);
}
