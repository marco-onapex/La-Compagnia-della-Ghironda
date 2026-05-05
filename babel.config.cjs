/**
 * Babel configuration — used ONLY by Jest to transform ESM `import`
 * statements in unit tests. Browsers receive the esbuild-bundled
 * production JS, NOT this output, so a `browsers` target here would be
 * dead config (and was historically a copy-paste source of confusion).
 *
 * `node: 'current'` matches the version Jest is running on, which is the
 * Node version pinned in `.nvmrc` / `engines.node`.
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: 'auto',
      },
    ],
  ],
};
