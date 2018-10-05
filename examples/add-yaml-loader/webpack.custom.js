module.exports = function (paths) {
  return {
    // path in webpack.config
    'module.rules...oneOf': {
      // operation: $unshift | $push | $set
      $unshift: [{
        test: /\.(yml|yaml)$/,
        include: paths.appSrc,
        use: ['json-loader', 'yaml-loader']
      }]
    }
  };
};