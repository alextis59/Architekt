module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  settings: {
    react: {
      version: 'detect'
    }
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build'
  ],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        'react/prop-types': 'off',
        'react/react-in-jsx-scope': 'off',
        'react/jsx-uses-react': 'off'
      }
    },
    {
      files: ['packages/frontend/**/*.{ts,tsx}'],
      env: {
        browser: true
      }
    }
  ]
};
