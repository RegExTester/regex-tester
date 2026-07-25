/**
 * Express middleware that aborts the request after `ms` milliseconds.
 */
export function requestTimeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.json({
          error: `The request timed out (exceeded ${ms / 1000} seconds).`,
          replace: null,
          matches: [],
        });
      }
    }, ms);

    res.on('finish', () => clearTimeout(timer));
    next();
  };
}
