module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
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
        'build',
        'chore',
        'ci',
        'security',
        'revert',
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    /* Round-23: severity bumped from 1 (warn) to 2 (error). The warn
       level let any unknown scope through CI with only a console
       message, which made the enum slowly meaningless — `fix(typo):`
       and `fix(typo-fix):` both shipped because nobody noticed the
       warning. Errors keep the enum honest; growing it remains a
       deliberate one-line edit when a real new scope emerges. */
    'scope-enum': [
      2,
      'always',
      [
        'css',
        'js',
        'html',
        'build',
        'ci',
        'workflow',
        'release',
        'hotfix',
        'docs',
        'deps',
        'config',
        'a11y',
        'perf',
        'security',
        'sw',
        'tests',
      ],
    ],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 120],
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 120],
  },
};
