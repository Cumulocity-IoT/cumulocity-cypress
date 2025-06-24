import { C8ySchemaGenerator } from "../shared/c8ypact/schema";

/**
 * C8ySchemaGenerator implementation using quicktype library with target language
 * json-schema. From the generated schema, all non-standard keywords are removed
 * to ensure compatibility with any json-schema validators.
 *
 * Quicktype has been reported to cause issues in browser runtimes. If you encounter
 * issues with quicktype, consider implementing a custom schema generator.
 */
export class C8yQicktypeSchemaGenerator implements C8ySchemaGenerator {
  async generate(obj: any, options: any = {}): Promise<any> {
    let InputData, jsonInputForTargetLanguage, quicktype;
    try {
      // @ts-expect-error
      const quicktypeCore = await import("quicktype-core");
      ({ InputData, jsonInputForTargetLanguage, quicktype } = quicktypeCore);
    } catch {
      throw new Error(
        "quicktype-core is not installed. Please run `npm install quicktype-core` in your project to use this feature."
      );
    }

    const { name } = options;
    const inputData = new InputData();
    const jsonInput = jsonInputForTargetLanguage("json-schema");
    await jsonInput.addSource({
      name: name || "root",
      samples: [JSON.stringify(obj)],
    });
    inputData.addInput(jsonInput);

    const result = await quicktype({
      inputData,
      lang: "json-schema",
    });
    const schema = JSON.parse(result.lines.join("\n"));
    this.removeNonStandardKeywords(schema);
    return schema;
  }

  protected removeNonStandardKeywords(schema: any) {
    for (const key in schema) {
      if (key.startsWith("qt-")) {
        delete schema[key];
      } else if (typeof schema[key] === "object") {
        this.removeNonStandardKeywords(schema[key]);
      }
    }
  }
}
