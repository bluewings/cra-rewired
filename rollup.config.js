import babel from 'rollup-plugin-babel';
import commonjs from 'rollup-plugin-commonjs';
import nodeResolve from 'rollup-plugin-node-resolve';

const pkg = require('./package.json');

const external = Object.keys(pkg.dependencies);

export default 		{
  input: 'src/index.js',
  output: { file: 'bin/cra-rewired.js', format: 'cjs', banner: '#!/usr/bin/env node' },
  plugins: [
    babel({
      runtimeHelpers: true,
      presets: [['@babel/env', { loose: true }], '@babel/react'],
      plugins: [['@babel/proposal-class-properties', { loose: true }], 'annotate-pure-calls'],
    }),
    nodeResolve(),
    commonjs(),
  ],
  external,
};
