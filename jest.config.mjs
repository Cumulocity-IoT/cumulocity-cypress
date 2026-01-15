export default {
  projects: [
    {
      roots: ["<rootDir>/src"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "<rootDir>/tsconfig.spec.json",
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
      },
    },
  ],
};
