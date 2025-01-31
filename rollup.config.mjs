import dts from "rollup-plugin-dts";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import shebang from 'rollup-plugin-shebang-bin'

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
    input: glob.sync('./dist/c8yctrl/*.js'),
    output: [
      {
        name: "c8yctrl",
        dir: "dist/c8yctrl",
        format: "commonjs",
      },
    ],
    plugins: [
      resolve({
        resolveOnly: ["./src/**"],
        preferBuiltins: true,
      }),
      commonjs(),
      json(),
      shebang(
        {
          include: [
            "dist/c8yctrl/startup.js",
          ]
        }
      )
    ],
  },
  {
    input: "dist/c8yctrl/index.d.ts",
    output: [{ file: "dist/c8yctrl/index.d.ts", format: "es", sourcemap: false }],
    plugins: [dts()],
  },
  {
    input: Object.fromEntries(
      // https://rollupjs.org/configuration-options/#input
      glob.sync("dist/c8yscrn/*.js").map((file) => [
        path.relative(
          "dist/",
          file.slice(0, file.length - path.extname(file).length)
        ),
        fileURLToPath(new URL(file, import.meta.url)),
      ])
    ),
    output: [
      {
        dir: "dist/",
        format: "commonjs",
      },
    ],
    plugins: [
      resolve({
        resolveOnly: ["./src/**"],
      }),
      commonjs(),
      json(),
      shebang(
        {
          include: [
            "dist/c8yscrn/startup.js",
          ]
        }
      )
    ],
  }
];
