import dts from "rollup-plugin-dts";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import alias from "@rollup/plugin-alias";
import json from "@rollup/plugin-json";
import shebang from 'rollup-plugin-shebang-bin'

// eslint-disable-next-line import/no-named-as-default
import glob from 'glob';

import path from "node:path";
import { fileURLToPath } from "node:url";

export default [
  {
    input: "dist/plugin/index.js",
    output: [
      {
        name: "c8y",
        file: "dist/plugin/index.js",
        format: "commonjs",
        sourcemap: true,
      },
    ],
    plugins: [
      resolve({
        resolveOnly: ["./src/**"],
      }),
      commonjs(),
      json(),
    ],
  },
  {
    input: "dist/plugin/index.d.ts",
    output: [
      { file: "dist/plugin/index.d.ts", format: "es", sourcemap: false },
    ],
    plugins: [dts()],
  },
  {
    input:
      "./packages/pact-http-controller/dist/packages/pact-http-controller/src/startup.js",
    output: [
      {
        name: "c8yctrl",
        file: "dist/bin/c8yctrl.js",
        format: "cjs",
      },
    ],
    plugins: [
      includePaths(includePathOptions),
      resolve({
        extensions: [".js"],
        preferBuiltins: true,
        mainFields: ["main", "module"],
        resolveOnly: ["./packages/pact-http-controller/dist/**"],
      }),
      alias(aliasConfig),
      commonjs(),
      json(),
    ],
  },
  {
    input: "dist/shared/c8yctrl/index.d.ts",
    output: [{ file: "dist/bin/c8yctrl.d.ts", format: "es", sourcemap: false }],
    plugins: [dts()],
  },
  {
    input: Object.fromEntries(
      // eslint-disable-next-line import/no-named-as-default-member
      glob.sync("dist/screenshot/*.js").map((file) => [
        path.relative(
          "dist",
          file.slice(0, file.length - path.extname(file).length)
        ),
        fileURLToPath(new URL(file, import.meta.url)),
      ])
    ),
    output: [
      {
        dir: "dist",
        format: "commonjs",
      },
    ],
    plugins: [
      resolve({
        only: ["./src/**"],
      }),
      commonjs(),
      json(),
      shebang(
        {
          include: [
            "dist/screenshot/startup.js",
          ]
        }
      )
    ],
  }
];
