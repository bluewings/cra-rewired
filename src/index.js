// This module was created with reference to the following article.
// https://daveceddia.com/customize-create-react-app-webpack-without-ejecting/
const path = require('path');
const _ = require('lodash');
const entries = require('object.entries');
const rewire = require('rewire');
const proxyquire = require('proxyquire');
const minimist = require('minimist');
const { getConfig } = require('./utils');

function getArgs() {
  const argv = minimist(process.argv.slice(2));

  const short = {
    s: 'script',
    m: 'mode',
    c: 'config',
  };

  let args = {
    script: 'react-scripts',
    mode: 'start',
    config: undefined,
  };

  Object.keys(argv).forEach((e) => {
    const key = args[e] ? e : short[e];
    if (key in args && typeof argv[e] === 'string') {
      args = {
        ...args,
        [key]: argv[e],
      };
    }
  });

  if (!args.config) {
    throw new Error('config is required.');
  }

  args.script = path.join(process.env.PWD, 'node_modules', args.script);
  args.config = path.join(process.env.PWD, args.config);
  return args;
}

function getCustom(module) {
  const custom = require(module);
  return custom;
}

// Attempt to load the given module and return null if it fails.
function loadCustomizer(custom) {
  try {
    return (config, paths, packageJson, shared) => getConfig(config, paths, packageJson, shared, custom);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
  }

  // If the module doesn't exist, return a
  // noop that simply returns the config it's given.
  return config => config;
}

function rewireModule(modulePath, customizer) {
  // Load the module with `rewire`, which allows modifying the
  // script's internal variables.
  const defaults = rewire(modulePath);

  // Reach into the module, grab its global 'config' variable,
  // and pass it through the customizer function.
  // The customizer should *mutate* the config object, because
  // react-scripts imports the config as a `const` and we can't
  // modify that reference.
  let config;
  let configFactory;
  try {
    config = defaults.__get__('config');
  } catch(ignore) {
    configFactory = defaults.__get__('configFactory');
  }
  const paths = defaults.__get__('paths');
  let prepareProxy;
  try {
    prepareProxy = defaults.__get__('prepareProxy');
  } catch (err) { /* ignore */ }

  const shared = {};

  if (typeof prepareProxy === 'function') {
    defaults.__set__('prepareProxy', (...args) => {
      let proxy = prepareProxy(...args);
      if (shared.$proxyConfig) {
        proxy = (Array.isArray(proxy) ? proxy : [proxy]).filter(e => e);
        proxy = shared.$proxyConfig.reduce((prev, { operation, value }) => {
          let next = prev;
          switch (operation) {
            case '$unshift':
              next = [...value, ...next];
              break;
            case '$push':
              next = [...next, ...value];
              break;
            case '$filter':
              if (typeof value === 'function') {
                next = next.filter(value);
              }
              break;
            default:
              break;
          }
          return next;
        }, proxy);
      }
      return proxy;
    });
  }

  const packageJson = require(paths.appPackageJson);

  const updateConfig = (configOpts) => {
    customizer(configOpts, { ...paths }, { ...packageJson }, shared);
  };

  if (config) {
    updateConfig(config);
  } else if (configFactory) {
    defaults.__set__('configFactory', (webpackEnv) => {
      const configOpts = configFactory(webpackEnv);
      updateConfig(configOpts);
      return configOpts;
    });
  }
}

const args = getArgs();

const custom = getCustom(args.config);

switch (args.mode) {
  // The "start" script is run during development mode
  case 'start': {
    rewireModule(
      `${args.script}/scripts/start.js`,
      loadCustomizer(custom),
    );
    break;
  }

  // The "build" script is run to produce a production bundle
  case 'build': {
    rewireModule(
      `${args.script}/scripts/build.js`,
      loadCustomizer(custom),
    );
    break;
  }

  // The "test" script runs all the tests with Jest
  case 'test': {
    // Load customizations from the config-overrides.testing file.
    // That file should export a single function that takes a config and returns a config
    const customizer = loadCustomizer(custom);
    process.argv = [];
    proxyquire(`${args.script}/scripts/test.js`, {
      // When test.js asks for './utils/createJestConfig' it will get this instead:
      './utils/createJestConfig': (...params) => {
        // Use the existing createJestConfig function to create a config, then pass
        // it through the customizer
        const createJestConfig = require(`${args.script}/scripts/utils/createJestConfig`);
        return customizer(createJestConfig(...params));
      },
    });
    break;
  }

  default:
    console.log('customized-config only supports "start", "build", and "test" options.');
    process.exit(-1);
}
