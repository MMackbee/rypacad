module.exports = {
  env: {
    es6: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    // Node 22 runtime (functions/package.json engines). 2018 could not parse
    // the optional-chaining / nullish-coalescing the portal modules use.
    ecmaVersion: 2022,
  },
  extends: [
    'eslint:recommended',
    'google',
  ],
  rules: {
    'no-restricted-globals': ['error', 'name', 'length'],
    'prefer-arrow-callback': 'error',
    // Sprint 13 pin I: align the rule to the files' single-quote convention
    // instead of rewriting every string in index.js.
    'quotes': ['error', 'single', {'allowTemplateLiterals': true}],
    // eslint-config-google pins 'unix', but this repo is checked out with
    // core.autocrlf=true, so every working-tree file is CRLF while git stores
    // LF. The rule can therefore never pass on the machines this code is
    // edited on, and would flip to failing the other way on a Linux CI
    // checkout. Line endings are git's job here, not ESLint's.
    'linebreak-style': 'off',
  },
  overrides: [
    {
      files: ['**/*.spec.*', '**/*.test.js'],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
