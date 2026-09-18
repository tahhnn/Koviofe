import coreWebVitals from 'eslint-config-next/core-web-vitals'
import next from 'eslint-config-next'

// eslint-config-next 16 ships native flat configs, so they are imported directly.
// Do not route these through @eslint/eslintrc FlatCompat — the plugin objects are
// self-referential and FlatCompat's validator throws on the circular structure.
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'scratch/**',
      'public/**',
      'uploads/**',
    ],
  },
  ...next,
  ...coreWebVitals,
]

export default config
