import _ from "lodash";

import { ScreenshotSetup, Selector } from "../lib/screenshots/types";

export function getSelector(
  selector: any | string | undefined,
  predefined?: ScreenshotSetup["selectors"]
): string | undefined {
  if (!selector) return undefined;
  if (_.isString(selector)) {
    const sharedSelector = _.isArrayLike(predefined)
      ? _.get(_.first(predefined.filter((s) => selector in s)), selector)
      : _.get(predefined, selector);
    return sharedSelector ?? selector;
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

export function findCommonParent(
  $elements: JQuery<HTMLElement>
): HTMLElement | undefined {
  if (!$elements || $elements.length === 0) return undefined;

  const getParents = (element: HTMLElement) => {
    const parents = [];
    while (element.parentElement) {
      parents.push(element.parentElement);
      element = element.parentElement;
    }
    return parents;
  };

  const firstElementParents = getParents($elements[0]);
  for (const parent of firstElementParents) {
    const isCommonParent = Array.from($elements).every((el) =>
      el.closest(parent.tagName.toLowerCase())
    );
    if (isCommonParent === true) {
      return parent;
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
