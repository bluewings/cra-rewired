module.exports = function (paths) {
  return {
    // path in webpack.config
    'module.rules...oneOf': {
      // operation: $unshift | $push | $set
      $unshift: [
        {
          test: /\.pug$/,
          include: paths.appSrc,
          use: [
            {
              loader: 'babel-loader',
              options: {
                presets: ['@babel/preset-env', '@babel/preset-react'],
              },
            }, {
              loader: 'pug-as-jsx-loader',
              options: {
                autoUpdateJsFile: true,
              },
            },
          ],
        },
      ],
    },
  };
};
