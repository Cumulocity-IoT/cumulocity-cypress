import _ from "lodash";

import { ScreenshotSetup, Selector } from "../lib/screenshots/types";

export function getSelector(
  selector: any | string | undefined,
  predefined?: ScreenshotSetup["selectors"]
): string | undefined {
  if (!selector) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getPredefinedSelector = (name: string) => {
    const sharedSelector = _.isArray(predefined)
      ? _.get(_.first(predefined.filter((s) => name in s)), name)
      : _.get(predefined, name);
      
    return sharedSelector ?? name;
  };

  const getResolvedSelector = (name: string) => {
    if (!predefined) return name;
    let result = name;
    if (_.isArray(predefined)) {
      for (const item of predefined) {
        const sortedKeys = Object.keys(item).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            result = result.split(key).join(item[key]);
        }
      }
    } else {
      const sortedKeys = Object.keys(predefined).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        result = result.split(key).join(predefined[key]);
      }
    }
    return result;
  };

  if (_.isArray(selector)) {
    return selector.map((s) => getResolvedSelector(s)).join(" ");
  }

  if (_.isString(selector)) {
    return getResolvedSelector(selector);
  }
  
  if (_.isPlainObject(selector)) {
    if ("data-cy" in selector) {
      return `[data-cy=${_.get(selector, "data-cy")}]`;
    }
    if ("selector" in selector) {
      return getSelector(selector.selector as Selector, predefined);
    }
  }
  
  return undefined;
}

/**
 * Simple parser for parsing DOM selector components into an array
 * representing its sub-selectors. Its only used to get the individual
 * sub-selectors from a compound selector string without analyzing the
 * actual structure of the component.
 * @param {string} selector - The selector string to parse
 * @returns {string[]} - The selector components as an array
 */
export function parseSelector(selector: string): string[] {
  const result = [];
  let buffer = "";
  let inBrackets = false;
  let inParentheses = false;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (char === "[") {
      inBrackets = true;
    } else if (char === "]") {
      inBrackets = false;
    } else if (char === "(") {
      inParentheses = true;
    } else if (char === ")") {
      inParentheses = false;
    }

    if ((char === " " || char === ">") && !inBrackets && !inParentheses) {
      if (buffer.trim()) {
        result.push(buffer.trim());
      }
      buffer = "";
    } else {
      buffer += char;
    }
  }

  if (buffer.trim()) {
    result.push(buffer.trim());
  }

  return result;
}

export function imageName(name: string): string {
  return name.replace(/.png$/i, "");
}
