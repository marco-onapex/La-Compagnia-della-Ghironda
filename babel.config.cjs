/**
 * Babel Configuration for Jest
 * Enables ES6 module transformation for testing environment
 * Supports modern browsers (ES2020+)
 */

module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current',
        browsers: 'last 2 versions, >0.2%',
      },
      modules: 'auto',
    }],
  ],
};
