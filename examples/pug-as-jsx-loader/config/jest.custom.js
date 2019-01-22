module.exports = function (paths) {
  return {
    'transform': {
      $update: (options) => ({
        "^.+\\.pug$": "jest-transform-pug-as-jsx",
        ...options,
      }),
    },
  };
};
