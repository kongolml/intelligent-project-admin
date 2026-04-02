import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'

/** @type {import('eslint').Linter.FlatConfig[]} */
const eslintConfig = [
  js.configs.recommended,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        crypto: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Blob: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        structuredClone: 'readonly',
        DOMException: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
      },
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**'],
  },
]

export default eslintConfig
