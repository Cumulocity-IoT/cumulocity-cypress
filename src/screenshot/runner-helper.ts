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

export function imageName(name: string): string {
  return name.replace(/.png$/i, "");
}
