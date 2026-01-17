import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { FlatCompat } from '@eslint/eslintrc'
import stylistic from '@stylistic/eslint-plugin'
import tsEslintPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import importPlugin from 'eslint-plugin-import'
import nPlugin from 'eslint-plugin-n'
import promisePlugin from 'eslint-plugin-promise'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
	baseDirectory: __dirname
})

const eslintConfig = [
	{
		ignores: [
			'coverage/**',
			'jest.config.js',
			'jest.setup.ts',
			'next.config.mjs'
		]
	},
	...nextCoreWebVitals,
	...nextTypescript,
	...compat.extends('prettier'),
	...compat.extends('plugin:import/typescript'),
	...compat.extends('plugin:import/errors'),
	...compat.extends('plugin:import/warnings'),
	...compat.extends('plugin:promise/recommended'),
	...compat.extends('plugin:n/recommended'),
	{
		plugins: {
			'@stylistic': stylistic,
			import: importPlugin,
			n: nPlugin,
			promise: promisePlugin,
			'@typescript-eslint': tsEslintPlugin
		},
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				projectService: true,
				ecmaVersion: 'latest',
				sourceType: 'module',
				ecmaFeatures: { jsx: true }
			}
		},
		settings: {
			react: { version: 'detect' },
			'import/resolver': {
				typescript: { project: './tsconfig.json' }
			}
		},
		rules: {
			'@typescript-eslint/strict-boolean-expressions': 'error',
			semi: ['error', 'never'],
			'no-extra-semi': 'error',
			quotes: ['error', 'single'],
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-tabs': 'off',
			indent: ['error', 'tab', { SwitchCase: 1 }],
			'react/jsx-curly-brace-presence': [
				'error',
				{ props: 'never', children: 'always' }
			],
			'object-curly-spacing': ['error', 'always'],
			'array-bracket-spacing': ['error', 'never'],
			'import/export': 'off',
			'import/first': 'error',
			'import/order': [
				'error',
				{
					alphabetize: { order: 'asc', caseInsensitive: true },
					groups: [
						'builtin',
						'external',
						'internal',
						'parent',
						'sibling',
						'index'
					],
					'newlines-between': 'always'
				}
			],
			'import/newline-after-import': 'error',
			'import/no-duplicates': 'error',
			'import/no-unresolved': 'error',
			'import/no-named-as-default': 'off',
			'import/no-named-as-default-member': 'off',
			'import/no-extraneous-dependencies': 'off',
			'import/no-mutable-exports': 'error',
			'import/no-amd': 'error',
			'import/no-commonjs': 'off',
			'import/no-nodejs-modules': 'off',
			'import/no-webpack-loader-syntax': 'error',
			'import/no-anonymous-default-export': 'off',
			'import/namespace': 'off',
			'import/default': 'off',
			'import/no-named-default': 'off',
			'import/no-cycle': 'off',
			'import/no-self-import': 'error',
			'import/no-useless-path-segments': 'error',
			'import/no-relative-parent-imports': 'off',
			'import/no-unused-modules': 'off',
			'import/no-import-module-exports': 'off',
			'import/no-internal-modules': 'off',
			'import/no-unassigned-import': 'off',
			'import/no-absolute-path': 'error',
			'import/extensions': 'off',
			'import/prefer-default-export': 'off',
			'import/group-exports': 'off',
			'import/dynamic-import-chunkname': 'off',
			'generator-star-spacing': ['error', { before: true, after: false }],
			'key-spacing': ['error', { beforeColon: false, afterColon: true }],
			'space-before-function-paren': ['error', 'always'],
			'brace-style': ['error', '1tbs', { allowSingleLine: true }],
			'no-multi-spaces': 'error',
			'block-spacing': ['error', 'always'],
			'space-in-parens': ['error', 'never'],
			'comma-dangle': ['error', 'never'],
			'lines-between-class-members': [
				'error',
				'always',
				{ exceptAfterSingleLine: true }
			],
			'padded-blocks': ['error', 'never'],
			'no-trailing-spaces': 'error',
			'react/jsx-filename-extension': ['error', { extensions: ['.tsx'] }],
			'n/no-missing-import': 'off',
			'spaced-comment': ['error', 'always'],
			'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
			curly: ['error', 'all']
		}
	},
	{
		files: ['eslint.config.mjs', 'postcss.config.mjs', 'tailwind.config.ts', 'next.config.mjs'],
		rules: {
			'n/no-extraneous-import': 'off',
			'n/no-unpublished-import': 'off'
		}
	},
	{
		files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
		rules: {
			'n/no-unpublished-import': ['error', {
				allowModules: ['@testing-library/react', '@testing-library/jest-dom']
			}]
		}
	},
	{
		files: ['postcss.config.mjs', 'next.config.mjs'],
		languageOptions: {
			parser: undefined,
			parserOptions: {}
		}
	},
	{
		rules: {
			'react-hooks/set-state-in-effect': 'off'
		}
	},
	{
		ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'postcss.config.mjs', 'eslint.config.mjs']
	}
]

export default eslintConfig
