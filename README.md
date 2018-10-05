# cra-rewired

You can add loaders or change other webpack configs without ```npm run eject``` from ```create-react-app```

## Quick Overview

```sh
create-react-app my-app
cd my-app
npm install cra-rewired --save-dev
echo "SKIP_PREFLIGHT_CHECK=true" >> .env
```

Then create a custom options file. This example adds a loader that loads the contents of the yaml file json.
```js
// webpack.custom.js
module.exports = function (paths) {
  return {
    // path in webpack.config
    'module.rules...oneOf': {
      // operation: $unshift | $push | $set
      $unshift: [
        {
          test: /\.(yml|yaml)$/,
          include: paths.appSrc,
          use: ['json-loader', 'yaml-loader']
        }
      ]
    }
  };
};
```

Update ```scripts.start``` in ```package.json``` as follows.

```
{
  ...
  "scripts": {
    "start_old": "react-scripts start",
    "start": "cra-rewired -s react-scripts -m start -c webpack.custom.js",
    ...
  },
  ...
}
```

[Check the changes to apply yaml-loader.](https://github.com/bluewings/cra-rewired/commit/b7e17ad0e172716d510333bfe6e74d902e559037)

Now you can import yaml file contents.

```js
import data from './data.yml';

console.log(data); // { message: 'hello world' }
```
