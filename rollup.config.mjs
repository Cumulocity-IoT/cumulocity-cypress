import dts from "rollup-plugin-dts";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import shebang from "rollup-plugin-shebang-bin";

import { glob } from "glob";

import path from "node:path";
import { fileURLToPath } from "node:url";

// Helper to create JS bundle config
const createJsConfig = (input, options = {}) => ({
  input,
  output: [
    {
      name: options.name || "c8y",
      ...(options.dir ? { dir: options.dir } : { file: input }),
      format: "commonjs",
      ...(options.sourcemap !== false && { sourcemap: true }),
    },
  ],
  plugins: [
    resolve({
      resolveOnly: ["./src/**"],
      ...(options.preferBuiltins && { preferBuiltins: true }),
    }),
    commonjs(),
    json(),
    ...(options.shebang ? [shebang({ include: options.shebang })] : []),
  ],
});

// Helper to create TypeScript declaration config
const createDtsConfig = (input) => ({
  input,
  output: [{ file: input, format: "es", sourcemap: false }],
  plugins: [dts()],
});

// Standard module entries (JS + DTS pairs)
const moduleEntries = [
  { path: "dist/index", name: "c8y" },
  { path: "dist/shared/c8yclient/index", name: "c8y" },
  { path: "dist/plugin/index", name: "c8y" },
  { path: "dist/c8yctrl/index", name: "c8yctrl" },
];

// Build configuration array
const configs = [
  // Standard module entries (JS + DTS)
  ...moduleEntries.flatMap((entry) => [
    createJsConfig(`${entry.path}.js`, { name: entry.name }),
    createDtsConfig(`${entry.path}.d.ts`),
  ]),

  // c8yctrl with special glob input and shebang
  {
    input: glob.sync("./dist/c8yctrl/*.js"),
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
      shebang({
        include: ["dist/c8yctrl/startup.js"],
      }),
    ],
  },

  // c8yscrn with multiple entry points
  {
    input: Object.fromEntries(
      glob
        .sync("dist/c8yscrn/*.js")
        .map((file) => [
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
      shebang({
        include: ["dist/c8yscrn/startup.js"],
      }),
    ],
  },
];

export default configs;
