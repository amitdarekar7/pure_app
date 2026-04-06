const expoConfig = require('eslint-config-expo/flat')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

module.exports = [
  ...expoConfig,
  {
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'build/**'],
  },
]
