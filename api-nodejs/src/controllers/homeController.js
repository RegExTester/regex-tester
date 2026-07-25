import { getCapabilities } from '../services/capabilities.js';

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
