import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
import pluginCypress from 'eslint-plugin-cypress/flat'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  pluginCypress.configs.recommended,
  {
    ignores: ["**/dist/", "test/", "**/cypress/*.js", "**/*.spec.*", ".github/", "**/.yalc/"],
  },
  {
    rules: {
      "no-debugger": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": ["error", { "allowDeclarations": true }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "minimumDescriptionLength": 0
        }
      ],
      "@typescript-eslint/no-restricted-imports": "error",
      'cypress/no-unnecessary-waiting': 'off'
    }
  }
);