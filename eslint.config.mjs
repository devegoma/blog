import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import prettier from "eslint-config-prettier";

export default [
    {
        ignores: [
            "dist/**",
            "dist-verification/**",
            ".astro/**",
            ".astro-verification/**",
            "playwright-report/**",
            "test-results/**",
            "tmp/worktrees/**",
        ],
    },
    ...tseslint.configs.recommended,
    ...astro.configs.recommended,
    prettier,
];
