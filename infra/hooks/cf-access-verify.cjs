"use strict";
// Helpers for cf-access-login.cjs: Cloudflare Access token check and cookie parsing.

const crypto = require("crypto");

const AUTH_COOKIE = "n8n-auth";
const SKIP =
  /^\/(webhook|webhook-test|webhook-waiting|form|form-test|form-waiting|healthz|api\/v1)(\/|$)/;

function b64urlJson(part) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  for (const piece of (header || "").split(";")) {
    const i = piece.indexOf("=");
    if (i > 0) out[piece.slice(0, i).trim()] = piece.slice(i + 1).trim();
  }
  return out;
}

function withoutCookie(header, name) {
  return (header || "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(`${name}=`))
    .join("; ");
}

function createVerifier({ teamDomain, aud }) {
  const issuer = `https://${teamDomain}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  let keys = new Map();
  let fetchedAt = 0;

  async function refresh() {
    if (Date.now() - fetchedAt < 60_000 && keys.size) return;
    const res = await fetch(certsUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`certs ${res.status}`);
    const body = await res.json();
    const next = new Map();
    for (const jwk of body.keys || []) {
      if (jwk.kid && jwk.kty === "RSA")
        next.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
    }
    keys = next;
    fetchedAt = Date.now();
  }

  return async function verify(token) {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const header = b64urlJson(parts[0]);
    if (!header || header.alg !== "RS256" || !header.kid) return null;
    if (!keys.has(header.kid)) {
      fetchedAt = 0;
      await refresh();
    }
    const key = keys.get(header.kid);
    if (!key) return null;
    const ok = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    );
    if (!ok) return null;
    const claims = b64urlJson(parts[1]);
    if (!claims) return null;
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !auds.includes(aud)) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= now - 30) return null;
    if (Number.isFinite(claims.nbf) && claims.nbf > now + 30) return null;
    if (typeof claims.email !== "string") return null;
    return claims;
  };
}

module.exports = {
  AUTH_COOKIE,
  SKIP,
  parseCookies,
  withoutCookie,
  createVerifier,
};
