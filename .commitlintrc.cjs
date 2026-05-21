/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: /^\[AX-(\d+)\] (\w+)(?:\(([\w-]+)\))?: (.+)$/,
      headerCorrespondence: ['ticket', 'type', 'scope', 'subject'],
    },
  },
  plugins: [
    {
      rules: {
        'header-pattern': (parsed, _when, pattern) => {
          const valid = pattern.test(parsed.header ?? '');
          return [
            valid,
            `header must match format: [AX-NNN] type(scope): description\n  got: "${parsed.header}"`,
          ];
        },
      },
    },
  ],
  rules: {
    'header-pattern': [
      2,
      'always',
      /^\[AX-(\d+)\] (\w+)(?:\(([\w-]+)\))?: (.+)$/,
    ],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'chore',
        'build',
        'ci',
        'revert',
      ],
    ],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 120],
  },
};
