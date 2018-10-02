// This module was created with reference to the following article.
// https://daveceddia.com/customize-create-react-app-webpack-without-ejecting/
const path = require('path');
const _ = require('lodash');
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

    return (config, paths) => getConfig(config, paths, custom);
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
  const config = defaults.__get__('config');
  const paths = defaults.__get__('paths');
  customizer(config, { ...paths
  });
}

const flattenMessages = (nestedMessages, prefix = '') => Object.keys(nestedMessages).reduce((messages, key) => {
  const value = nestedMessages[key];
  const prefixedKey = prefix ? `${prefix}.${key}` : key;
  if (typeof value !== 'object' || value === null) {
    messages[prefixedKey] = value;
  } else {
    Object.assign(messages, flattenMessages(value, prefixedKey));
  }
  return messages;
}, {});

function getConfig(config, paths, overrides) {
  const {
    oneOf,
  } = overrides(paths);

  const jsonPath = Object.keys(flattenMessages(config.module.rules))
    .filter(e => e.search(/\.oneOf\./) !== -1)
    .map(e => e.replace(/(\.oneOf)\..*$/, '$1').split('.'))[0].map((e) => {
      const num = parseInt(e, 10);
      return isNaN(num) ? e : `[${num}]`;
    }).join('.');

  let target = _.get(config.module.rules, jsonPath);
  if (oneOf.$unshift) {
    target = [
      ...oneOf.$unshift,
      ...target,
    ];
  }

  _.set(config.module.rules, jsonPath, target);


  return config;
}

const args = getArgs();

switch (args.mode) {
  case 'start':
    // The "start" script is run during development mode
    {
      rewireModule(`${args.script}/scripts/start.js`, loadCustomizer(args.config));
      break;
    }

  case 'build':
    // The "build" script is run to produce a production bundle
    {
      rewireModule(`${args.script}/scripts/build.js`, loadCustomizer(args.config));
      break;
    }

  case 'test':
    // The "test" script runs all the tests with Jest
    {
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