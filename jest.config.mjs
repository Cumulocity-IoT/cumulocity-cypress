export default {
  projects: [
    {
      preset: "ts-jest/presets/default-esm",
      extensionsToTreatAsEsm: [".ts"],
      roots: ["<rootDir>/src"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "<rootDir>/tsconfig.spec.json",
            useESM: true,
          },
        ],
        "^.+\\.jsx?$": "@swc/jest",
      },
      transformIgnorePatterns: [
        "node_modules/(?!(@apidevtools|@jsdevtools)/)",
      ],
      testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
      moduleNameMapper: {
        "^cumulocity-cypress/(.*)$": "<rootDir>/src/$1",
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
    },
  ],
};
