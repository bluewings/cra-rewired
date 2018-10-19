#!/usr/bin/env node

// This module was created with reference to the following article.
// https://daveceddia.com/customize-create-react-app-webpack-without-ejecting/
const path = require('path');
const _ = require('lodash');
const entries = require('object.entries');
const rewire = require('rewire');
const proxyquire = require('proxyquire');
const minimist = require('minimist');

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

// Attempt to load the given module and return null if it fails.
function loadCustomizer(module) {
  try {
    const custom = require(module);
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

function aggregate(data, stageOrStages) {
  const stages = Array.isArray(stageOrStages) ? stageOrStages : [stageOrStages];
  return stages.reduce((prev, stage) => {
    const match = typeof stage.$match === 'function' ? stage.$match : () => true;
    return prev.map(e => {
      if (!match(e)) {
        return e;
      }
      if (typeof stage.$update === 'function') {
        return stage.$update(e);
      }
      return e;
    });
  }, data);
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
  const config = defaults.__get__('config');
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

  customizer(config, { ...paths }, { ...packageJson }, shared);
}

const flattenMessages = (nestedMessages, prefix = '') =>
  Object.keys(nestedMessages).reduce((messages, key) => {
    const value = nestedMessages[key];
    const prefixedKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value !== 'object' || value === null) {
      messages[prefixedKey] = value;
    } else {
      Object.assign(messages, flattenMessages(value, prefixedKey));
    }
    return messages;
  }, {});

function getJsonPath(needle, config) {
  const [path1, path2] = needle.split('...');
  if (path1 && path2) {
    const root = _.get(config, path1);
    return [
        path1,
        Object.keys(flattenMessages(root))
        .filter(e => e.search(path2) !== -1)[0]
        .split(path2)[0] + path2,
      ]
      .join('.')
      .replace(/\.([0-9]+)\./g, '[$1].');
  }
  return path1;
}

function getConfig(config, paths, packageJson, shared, getCustoms) {
  const customs = getCustoms(paths, packageJson);

  if (customs.$proxyConfig) {
    shared.$proxyConfig = entries(customs.$proxyConfig)
      .map(([operation, value]) => ({ operation, value }));
  }

  if (customs.$moduleScope) {
    config.resolve.plugins = config.resolve.plugins.forEach((plugin) => {
      if (plugin.constructor.name === 'ModuleScopePlugin') {
        // https://github.com/facebook/create-react-app/commit/1922f4d4d8cf54c20237d38691cd5bee154f032e#diff-c17bf19ab7e052d143c785608119dc91
        // Before the commit on Mar 23, 2018, there was no appSrcs option.
        if (plugin.appSrcs) {
          const moduleScope = Array.isArray(customs.$moduleScope) ?
            customs.$moduleScope : [customs.$moduleScope];
          plugin.appSrcs = [...plugin.appSrcs, ...moduleScope];
        } else {
          if (typeof customs.$moduleScope !== 'string') {
            throw new Error('$moduleScope must be a string.');
          }
          plugin.appSrc = customs.$moduleScope;
        }
      }
    });
  }

  entries(customs).forEach(([needle, custom]) => {
    const jsonPath = getJsonPath(needle, config);
    let target = _.get(config, jsonPath);
    if (target) {
      entries(custom).forEach(([operation, value]) => {
        switch (operation) {
          case '$aggregate':
            target = aggregate(target, value);
            break;
          case '$unshift':
            target = [...value, ...target];
            break;
          case '$push':
            target = [...target, ...value];
            break;
          case '$set':
            target = {
              ...target,
              ...value,
            };
            break;
          default:
            break;
        }
      });
      _.set(config, jsonPath, target);
    }
  });

  return config;
}

const args = getArgs();

switch (args.mode) {
  // The "start" script is run during development mode
  case 'start': {
    rewireModule(
      `${args.script}/scripts/start.js`,
      loadCustomizer(args.config),
    );
    break;
  }

  // The "build" script is run to produce a production bundle
  case 'build': {
    rewireModule(
      `${args.script}/scripts/build.js`,
      loadCustomizer(args.config),
    );
    break;
  }

  // The "test" script runs all the tests with Jest
  case 'test': {
    // Load customizations from the config-overrides.testing file.
    // That file should export a single function that takes a config and returns a config
    const customizer = loadCustomizer(args.config);
    proxyquire(`${args.script}/scripts/test.js`, {
      // When test.js asks for '../utils/createJestConfig' it will get this instead:
      '../utils/createJestConfig': (...args) => {
        // Use the existing createJestConfig function to create a config, then pass
        // it through the customizer
        const createJestConfig = require(`${args.script}/utils/createJestConfig`);
        return customizer(createJestConfig(...args));
      },
    });
    break;
  }

  default:
    console.log('customized-config only supports "start", "build", and "test" options.');
    process.exit(-1);
}
