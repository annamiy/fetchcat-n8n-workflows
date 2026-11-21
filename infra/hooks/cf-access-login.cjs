"use strict";
// n8n external hook: sign a Cloudflare Access user straight into n8n.
//
// n8n cannot turn its own login off. When a browser request carries a valid
// Cloudflare Access token (Cf-Access-Jwt-Assertion, RS256 signed by the team
// domain, matching issuer, app AUD and expiry) for an allowed email, and has no
// valid n8n session cookie, this issues the normal n8n session cookie for the
// configured n8n user. Plain email headers are never trusted. Requests without
// an Access token (webhooks, forms, /healthz, /api/v1, the VPS itself) are left
// to n8n unchanged, so n8n's own login stays the fallback.
//
// Settings (all required, otherwise the hook stays off):
//   N8N_CF_ACCESS_TEAM_DOMAIN  e.g. nosova.cloudflareaccess.com
//   N8N_CF_ACCESS_AUD          the n8n Access application AUD tag
//   N8N_CF_ACCESS_EMAILS       comma-separated Access emails allowed in
//   N8N_CF_ACCESS_USER         email of the n8n user they are signed in as

const path = require("path");
const { createRequire } = require("module");

const {
  AUTH_COOKIE,
  SKIP,
  parseCookies,
  withoutCookie,
  createVerifier,
} = require("./cf-access-verify.cjs");

async function setup(server) {
  const teamDomain = process.env.N8N_CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.N8N_CF_ACCESS_AUD;
  const allowed = new Set(
    (process.env.N8N_CF_ACCESS_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  const targetEmail = (process.env.N8N_CF_ACCESS_USER || "")
    .trim()
    .toLowerCase();
  const log = server.logger || console;
  if (!teamDomain || !aud || !allowed.size || !targetEmail) {
    log.info("Cloudflare Access sign-in hook: not configured, off");
    return;
  }

  const n8nRequire = createRequire(require.main.filename);
  const dist = path.join(path.dirname(require.main.filename), "..", "dist");
  const { Container } = n8nRequire("@n8n/di");
  const { AuthService } = n8nRequire(
    path.join(dist, "auth", "auth.service.js"),
  );
  const authService = Container.get(AuthService);
  const verify = createVerifier({ teamDomain, aud });

  async function findTarget() {
    const repo = authService.personRepository;
    const found = await repo.findByEmail(targetEmail);
    if (!found) return null;
    return repo.findByIdWithRole(found.id);
  }

  async function middleware(req, res, next) {
    try {
      const accessToken = req.headers["cf-access-jwt-assertion"];
      if (!accessToken || SKIP.test(req.path)) return next();

      const existing = parseCookies(req.headers.cookie)[AUTH_COOKIE];
      if (existing) {
        try {
          authService.jwtService.verify("session", existing, {
            algorithms: ["HS256"],
          });
          return next();
        } catch {
          // expired or invalid n8n session: fall through and reissue
        }
      }

      const claims = await verify(accessToken);
      if (!claims || !allowed.has(claims.email.toLowerCase())) return next();

      const user = await findTarget();
      if (!user || user.disabled) return next();

      const token = authService.issueJWT(user, false);
      const { samesite, secure } = authService.globalConfig.auth.cookie;
      res.cookie(AUTH_COOKIE, token, {
        maxAge: authService.jwtExpiration * 1000,
        httpOnly: true,
        sameSite: samesite,
        secure,
      });
      const rest = withoutCookie(req.headers.cookie, AUTH_COOKIE);
      req.headers.cookie = rest
        ? `${rest}; ${AUTH_COOKIE}=${token}`
        : `${AUTH_COOKIE}=${token}`;
      log.info(
        `Cloudflare Access sign-in: ${claims.email} -> n8n user ${targetEmail}`,
      );
    } catch (error) {
      log.warn(
        `Cloudflare Access sign-in hook skipped: ${error && error.message}`,
      );
    }
    return next();
  }

  const app = server.app;
  const router = app.router || app._router;
  app.use(middleware);
  const layer = router.stack.pop();
  router.stack.unshift(layer);
  log.info(
    `Cloudflare Access sign-in hook enabled for ${allowed.size} email(s)`,
  );
}

module.exports = {
  n8n: {
    ready: [
      async function cfAccessLogin(server) {
        try {
          await setup(server);
        } catch (error) {
          // Never stop n8n from starting: without the hook its own login still works.
          (server.logger || console).warn(
            `Cloudflare Access sign-in hook not installed: ${error && error.message}`,
          );
        }
      },
    ],
  },
};
