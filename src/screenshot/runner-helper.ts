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
    const parents: HTMLElement[] = [];
    while (element.parentElement) {
      parents.push(element.parentElement);
      element = element.parentElement;
    }
    return parents;
  };

  const firstElementParents = getParents($elements[0]);
  for (const parent of firstElementParents) {
    const isCommonParent = Array.from($elements).every((el) =>
      hasParent(el, parent)
    );
    const r = parent.getBoundingClientRect();
    // When an element has display: contents, it is rendered as if it weren't there
    // at all. Its children are rendered as if they were direct children of its parent. 
    // This means that the element itself doesn't have a bounding rectangle, which is 
    // why getBoundingClientRect() returns 0 for all values.
    // Make sure that the parent has a width and height so the parent is actually visible
    if (isCommonParent === true && (r.width > 0 && r.height > 0)) {
      return parent;
    }
  }
  return undefined;
}

/**
 * Checks if an element has a specific parent element
 * @param {HTMLElement} element - The element to check
 * @param {HTMLElement} parent - The parent element to check for
 * @returns {boolean} - True if the element has the parent element
 */
export function hasParent(element: HTMLElement, parent: HTMLElement): boolean {
  let currentElement = element;

  while (currentElement.parentElement) {
    if (currentElement.parentElement === parent) {
      return true;
    }
    currentElement = currentElement.parentElement;
  }

  return false;
}

export function getElementPositionWithinParent($e: HTMLElement, $p: HTMLElement) {
  const childRect = $e.getBoundingClientRect();
  const parentRect = $p.getBoundingClientRect();

  return new DOMRectReadOnly(
    childRect.left - parentRect.left,
    childRect.top - parentRect.top,
    childRect.width,
    childRect.height
  );
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
