import js from "@eslint/js";
import tseslint from "typescript-eslint";

const sharedGlobals = {
    AbortController: "readonly",
    AbortSignal: "readonly",
    Buffer: "readonly",
    clearInterval: "readonly",
    clearTimeout: "readonly",
    console: "readonly",
    EventSource: "readonly",
    fetch: "readonly",
    FormData: "readonly",
    localStorage: "readonly",
    process: "readonly",
    Request: "readonly",
    Response: "readonly",
    setInterval: "readonly",
    setTimeout: "readonly",
    URL: "readonly",
    URLSearchParams: "readonly",
    WebSocket: "readonly",
    window: "readonly",
};

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**", "tmp/**", "server/exams/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: sharedGlobals,
        },
    },
    {
        files: ["**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            complexity: ["error", { max: 16 }],
            "max-depth": ["error", 4],
            "max-params": ["error", 5],
            "no-fallthrough": "error",
        },
    },
    {
        files: [
            "client/src/components/arena/ItemDock.tsx",
            "client/src/components/arena/ProblemSheet.tsx",
            "client/src/screens/AdminScreen.tsx",
            "client/src/screens/ArenaScreen.tsx",
            "client/src/screens/HomeScreen.tsx",
            "client/src/screens/ResultsScreen.tsx",
            "server/index.ts",
            "shared/runtimeMetrics.ts",
        ],
        rules: {
            complexity: "off",
        },
    },
    {
        files: ["**/*.test.ts", "tests/e2e/**/*.ts"],
        rules: {
            "max-depth": "off",
        },
    },
);
