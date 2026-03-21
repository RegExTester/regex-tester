import os from 'node:os';

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
   *     tags: [Home]
   *     summary: Return runtime version information for the host.
   *     description: Response is cached for 24 hours.
   *     responses:
   *       200:
   *         description: Version information.
   *         content:
   *           application/json: {}
   */
  version(_req, res) {
    const now = Date.now();
    if (!cachedVersion || now - cachedAt > CACHE_TTL) {
      cachedVersion = {
        osDescription: `${os.type()} ${os.release()} ${os.arch()}`,
        frameworkDescription: `Node.js ${process.version}`,
      };
      cachedAt = now;
    }
    res.json(cachedVersion);
  },
};
