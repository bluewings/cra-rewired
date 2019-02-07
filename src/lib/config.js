const _ = require('lodash');
const entries = require('object.entries');

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
      .map(([operation, value]) => ({
        operation,
        value
      }));
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
          case '$update':
            if (typeof value === 'function') {
              target = value(target);
            }
            break;
          case '$filter':
            if (typeof value === 'function') {
              target = target.filter(value);
            }
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

export default getConfig;