// ============================================================
// OIDC Client — Works with any OpenID Connect provider
// (Keycloak, Google, Azure AD, Okta, etc.)
// ============================================================

interface OIDCConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

interface UserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
}

interface OIDCDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let discoveryCache: OIDCDiscovery | null = null;
// In dev, bust the cache on every restart (bun --watch handles this automatically).
// Set OIDC_DISCOVERY_CACHE=false to disable caching (useful when testing env changes).
const CACHE_ENABLED = process.env.OIDC_DISCOVERY_CACHE !== "false";

function getConfig(): OIDCConfig {
  return {
    issuer: process.env.OIDC_ISSUER || "http://localhost:8080/realms/xekuchat",
    clientId: process.env.OIDC_CLIENT_ID || "xekuchat",
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    redirectUri: process.env.OIDC_REDIRECT_URI || "http://localhost:3000/auth/callback",
  };
}

/**
 * In dev/tunnel scenarios, OIDC_PUBLIC_ISSUER is the publicly reachable base URL
 * (e.g. the zrok URL).  The server still talks to Keycloak internally via OIDC_ISSUER,
 * but the browser-facing auth redirect URL gets its host rewritten to OIDC_PUBLIC_ISSUER.
 */
function rewriteToPublic(url: string): string {
  const publicIssuer = process.env.OIDC_PUBLIC_ISSUER;
  if (!publicIssuer) return url;
  const internalIssuer = process.env.OIDC_ISSUER || "http://localhost:8080/realms/xekuchat";
  if (publicIssuer === internalIssuer) return url;
  try {
    const pub = new URL(publicIssuer);
    const target = new URL(url);
    target.protocol = pub.protocol;
    target.hostname = pub.hostname;
    target.port = pub.port;
    return target.toString();
  } catch {
    return url;
  }
}

async function discover(): Promise<OIDCDiscovery> {
  if (CACHE_ENABLED && discoveryCache) return discoveryCache;

  const config = getConfig();
  const res = await fetch(`${config.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);

  discoveryCache = (await res.json()) as OIDCDiscovery;
  return discoveryCache;
}

export async function getOIDCAuthUrl(): Promise<string> {
  const config = getConfig();
  const discovery = await discover();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid profile email",
    state: crypto.randomUUID(),
  });

  // Rewrite host to the public-facing URL (zrok / tunnel) when configured,
  // while token_endpoint / userinfo_endpoint keep using the internal URL.
  const authEndpoint = rewriteToPublic(discovery.authorization_endpoint);
  return `${authEndpoint}?${params}`;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const config = getConfig();
  const discovery = await discover();

  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const config = getConfig();
  const discovery = await discover();

  const res = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`UserInfo failed: ${res.status}`);

  const info = (await res.json()) as Record<string, unknown>;

  // Derive provider from issuer URL
  const issuer = config.issuer.toLowerCase();
  let provider = "oidc";
  if (issuer.includes("keycloak")) provider = "keycloak";
  else if (issuer.includes("google")) provider = "google";
  else if (issuer.includes("github")) provider = "github";
  else if (issuer.includes("microsoft") || issuer.includes("azure")) provider = "azure";

  return {
    sub: info.sub as string,
    email: info.email as string,
    name: (info.name as string) || (info.preferred_username as string) || "",
    picture: info.picture as string | undefined,
    provider,
  };
}
