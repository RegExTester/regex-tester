import os from 'node:os';
import { getCapabilities } from '../services/capabilities.js';

let cachedVersion = null;
let cachedAt = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const homeController = {
  /**
   * @openapi
   * /:
   *   get:
   *     tags: [Home]
   *     summary: Redirect to the Vue.js frontend.
   *     responses:
   *       302:
   *         description: HTTP 302 redirect to `https://regextester.github.io/`.
   */
  redirect(_req, res) {
    res.redirect(302, 'https://regextester.github.io/');
  },

  /**
   * @openapi
   * /api/version:
   *   get:
   *     tags: [Version]
   *     summary: Return engine identity and runtime version information for the host.
   *     description: |
   *       Response is cached for 24 hours. `osDescription` and `frameworkDescription` are
   *       deprecated aliases for `os` and `framework`, retained for one release.
   *     responses:
   *       200:
   *         description: Version information.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VersionResult'
   */
  version(_req, res) {
    const now = Date.now();
    if (!cachedVersion || now - cachedAt > CACHE_TTL) {
      const osValue = `${os.type()} ${os.release()} ${os.arch()}`;
      const frameworkValue = `Node.js ${process.version}`;
      cachedVersion = {
        engineKey: 'NODEJS',
        engineName: 'Node.js',
        contractVersion: '1.0',
        os: osValue,
        framework: frameworkValue,
        // Deprecated aliases, retained for one release.
        osDescription: osValue,
        frameworkDescription: frameworkValue,
      };
      cachedAt = now;
    }
    res.json(cachedVersion);
  },

  /**
   * @openapi
   * /api/capabilities:
   *   get:
   *     tags: [Capabilities]
   *     summary: Report the options, limits, and features this engine supports.
   *     description: |
   *       Cacheable for 24 hours; capabilities do not change between requests for a given
   *       deployed engine version.
   *     responses:
   *       200:
   *         description: Capability description for this engine.
   *         headers:
   *           Cache-Control:
   *             description: Capabilities are static for a given deployment; cacheable for 24 hours.
   *             schema:
   *               type: string
   *             example: public, max-age=86400
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Capabilities'
   */
  capabilities(_req, res) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(getCapabilities());
  },
};
