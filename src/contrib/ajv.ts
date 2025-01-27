import _ from "lodash";
import * as semver from "semver";

import Ajv, { AnySchemaObject, SchemaObject } from "ajv";
import addFormats from "ajv-formats";

import { C8ySchemaMatcher } from "../shared/c8ypact/schema";

import draft06Schema from "ajv/lib/refs/json-schema-draft-06.json";

/**
 * Default implementation of C8ySchemaMatcher using AJV. By default
 * json-schema-draft-07 meta schema is used. Other meta schema can be added
 * by passing in constructor. If options.strictMatching is disabled for match,
 * additionalProperties will be set to true allowing additional properties
 * in the object to match the schema.
 */
export class C8yAjvSchemaMatcher implements C8ySchemaMatcher {
  ajv: Ajv;

  constructor(metas?: AnySchemaObject[]) {
    //https://ajv.js.org/options.html
    this.ajv = new Ajv({ strict: "log" });
    addFormats(this.ajv, [
      "uri",
      "uri-reference",
      "url",
      "uuid",
      "hostname",
      "date-time",
      "date",
      "password",
    ]);

    this.ajv.addFormat("integer", {
      type: "number",
      validate: (x: any) => _.isInteger(x),
    });

    this.ajv.addFormat("boolean", {
      validate: (x: any) => _.isBoolean(x),
    });

    this.ajv.addFormat("boolean", {
      type: "string",
      validate: (x: any) =>
        _.isString(x) && ["true", "false"].includes(_.lowerCase(x)),
    });

    this.ajv.addFormat("semver-range", {
      type: "string",
      validate: (x: any) => {
        return semver.validRange(x) != null;
      },
    });

    this.ajv.addFormat("semver-version", {
      type: "string",
      validate: (x: any) => {
        return semver.valid(x) != null;
      },
    });

    if (metas && _.isArrayLike(metas)) {
      metas.forEach((m) => {
        this.ajv.addMetaSchema(m);
      });
    }
  }

  match(
    obj: any,
    schema: SchemaObject,
    strictMatching: boolean = true
  ): boolean {
    if (!schema) return false;
    const schemaClone = _.cloneDeep(schema);
    this.updateAdditionalProperties(schemaClone, !strictMatching);

    const valid = this.ajv.validate(schemaClone, obj);
    if (!valid) {
      throw new Error(this.ajv.errorsText());
    }
    return valid;
  }

  protected updateAdditionalProperties(schema: any, value: boolean) {
    if (_.isObjectLike(schema)) {
      if ("additionalProperties" in schema || schema.type === "object") {
        schema.additionalProperties = value;
      }
      Object.values(schema).forEach((v: any) => {
        this.updateAdditionalProperties(v, value);
      });
    } else if (_.isArray(schema)) {
      schema.forEach((v: any) => {
        this.updateAdditionalProperties(v, value);
      });
    }
  }
}

export class C8yAjvJson6SchemaMatcher extends C8yAjvSchemaMatcher {
  constructor() {
    super([draft06Schema]);
  }
}
