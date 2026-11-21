"use strict";
// node --test infra/hooks/cf-access-verify.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const {
  createVerifier,
  parseCookies,
  withoutCookie,
  SKIP,
} = require("./cf-access-verify.cjs");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const { privateKey: otherKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
global.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });

const team = "team.cloudflareaccess.com";
const aud = "aud123";
function sign(claims, key = privateKey, header = { alg: "RS256", kid: "k1" }) {
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = crypto
    .sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key)
    .toString("base64url");
  return `${h}.${p}.${s}`;
}
const now = Math.floor(Date.now() / 1000);
const good = {
  iss: `https://${team}`,
  aud: [aud],
  exp: now + 600,
  nbf: now - 5,
  email: "a@x.me",
};

test("accepts a valid token", async () => {
  const v = createVerifier({ teamDomain: team, aud });
  assert.equal((await v(sign(good))).email, "a@x.me");
});
test("rejects wrong key, aud, issuer, expiry, alg, garbage", async () => {
  const v = createVerifier({ teamDomain: team, aud });
  assert.equal(await v(sign(good, otherKey)), null);
  assert.equal(await v(sign({ ...good, aud: ["other"] })), null);
  assert.equal(await v(sign({ ...good, iss: "https://evil.example" })), null);
  assert.equal(await v(sign({ ...good, exp: now - 120 })), null);
  assert.equal(
    await v(sign(good, privateKey, { alg: "none", kid: "k1" })),
    null,
  );
  assert.equal(
    await v(sign(good, privateKey, { alg: "RS256", kid: "unknown" })),
    null,
  );
  assert.equal(await v("not.a.jwt"), null);
  assert.equal(await v("x"), null);
});
test("cookies and skipped paths", () => {
  assert.deepEqual(parseCookies("a=1; n8n-auth=tok; b=2"), {
    a: "1",
    "n8n-auth": "tok",
    b: "2",
  });
  assert.equal(withoutCookie("a=1; n8n-auth=old; b=2", "n8n-auth"), "a=1; b=2");
  for (const p of [
    "/webhook/x",
    "/form/y",
    "/healthz",
    "/api/v1/workflows",
    "/webhook-test/z",
  ])
    assert.ok(SKIP.test(p), p);
  for (const p of ["/", "/home/workflows", "/rest/login", "/webhooks-ui"])
    assert.ok(!SKIP.test(p), p);
});
