const { _ } = Cypress;

import { C8yHighlightOptions } from "../../shared/types";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Highlights one or multiple DOM elements with custom css styles.
       *
       * If multiple elements are selected, the union area of all elements is
       * highlighted and the style is applied to a container element added to
       * the common parent of all elements. If only a single element is selected,
       * the style is applied directly to the element.
       *
       * Pass an object with CSS styles to apply to the element(s) with the keys
       * being the CSS property names. Use options to customize the highlight
       * behavior. If the width or height options are provided, the highlight
       * area is calculated based on the union area of all elements with the
       * width and height options applied. If the clear option is true, existing
       * highlights will be cleared before highlighting.
       * 
       * Default highlight style:
       * ```json
       * {
       *   "outline": "2px",
       *   "outline-style": "solid",
       *   "outline-offset": "-2px",
       *   "outline-color": "#FF9300",
       * }
       *
       * @example
       * cy.get('button').highlight();
       * cy.get('button').highlight({ border: '1px solid red' });
       *
       * @param {Object} style - The CSS styles to apply to the DOM element
       * @param {Object} options - The options to customize the highlight behavior
       */
      highlight(
        style?: any,
        options?: HighlightOptions
      ): Chainable<JQuery<HTMLElement>>;

      /**
       * Clears all existing highlights to revert the DOM elements to their
       * original state. This command is useful to clean up the DOM after
       * highlighting elements and before possibly highlighting new elements.
       */
      clearHighlights(): Chainable<void>;
    }
  }

  interface HighlightOptions
    extends Omit<C8yHighlightOptions, "styles" | "border"> {}
}

const HighlightStyleDefaults: any = {
  outline: "2px",
  "outline-style": "solid",
  "outline-offset": "-2px",
  "outline-color": "#FF9300",
};

Cypress.Commands.add(
  "highlight",
  { prevSubject: "element" },
  (subject, highlightStyle, options) => {
    let customizedElements: Array<[JQuery<HTMLElement>, any]> =
      Cypress.env("_c8yscrnCustomizedElements") || [];
    let highlightElements: Array<JQuery<HTMLElement>> =
      Cypress.env("_c8yscrnHighlightElements") || [];

    if (_.isObject(options) && (options?.clear ?? false) === true) {
      customizedElements.forEach(([$element, styles]) => $element.css(styles));
      customizedElements = [];
      highlightElements.forEach(($element) => $element.remove());
      highlightElements = [];
    }

    const style = { ...(highlightStyle ?? HighlightStyleDefaults) };
    const consoleProps: any = {
      style: style || null,
      options: options || null,
    };

    const logger = Cypress.log({
      name: "highlight",
      consoleProps: () => consoleProps,
      message: options?.clear === true ? "(clear)" : "",
      $el: subject,
      autoEnd: false,
    });

    if (subject.length === 0) {
      logger.end();
      return;
    }

    const applyElementStyle = ($elements: JQuery<HTMLElement>) => {
      const styledProperties = Object.keys(style);
      const currentStyles = $elements.css(styledProperties);
      customizedElements.push([$elements, currentStyles]);
      $elements.css(style);
      logger.set({ $el: $elements });
    };

    const applyMultiStyle = (
      $elements: JQuery<HTMLElement>,
      width?: number,
      height?: number
    ) => {
      let $parent = findCommonParent($elements);
      if (!$parent) {
        $parent = Cypress.$("body").get(0);
      } else {
        // make sure the new container is positioned correctly
        Cypress.$($parent).css("position", "relative");
      }

      const unionRect = $elements.toArray().reduce(
        (acc, el) => {
          const rect = getElementPositionWithinParent(el, $parent);
          acc.top = Math.min(acc.top, rect.top);
          acc.left = Math.min(acc.left, rect.left);
          acc.bottom = Math.max(acc.bottom, rect.bottom);
          acc.right = Math.max(acc.right, rect.right);
          return acc;
        },
        {
          top: Infinity,
          left: Infinity,
          bottom: -Infinity,
          right: -Infinity,
        }
      );

      let _w = unionRect.right - unionRect.left;
      if (width != null) {
        _w = width <= 1 ? _w * width : width;
      }

      let _h = unionRect.bottom - unionRect.top;
      if (height != null) {
        _h = height <= 1 ? _h * height : height;
      }

      const css = {
        position: "absolute",
        top: `${unionRect.top}px`,
        left: `${unionRect.left}px`,
        width: `${_w}px`,
        height: `${_h}px`,
        pointerEvents: "none",
        ...style,
      };

      const $container = Cypress.$(
        "<div _c8yscrn-highlight-container></div>"
      ).css(css);
      Cypress.$($parent).append($container);
      highlightElements.push($container);

      const container = {
        unionRect: unionRect || null,
        style: css || null,
        element: $container || null,
        parent: $parent || null,
      };

      if (consoleProps.container) {
        if (_.isArray(consoleProps.container)) {
          consoleProps.container.push(container);
        } else {
          consoleProps.container = [consoleProps.container, container];
        }
      } else {
        consoleProps.container = container;
      }
    };

    const needsSizeConstraints =
      options?.width != null || options?.height != null;

    // we need to wait for the element to transition and animate into final
    // position before we can calculate the absolute highlight area
    cy.wait(500, { log: false }).then(() => {
      const e = options?.multiple === true ? subject.toArray() : [subject];

      e.forEach(($el) => {
        const $element = !isJQueryElement($el) ? Cypress.$($el) : $el;
        if ($element.length > 1 || needsSizeConstraints) {
          applyMultiStyle($element, options?.width, options?.height);
        } else {
          applyElementStyle($element);
        }
      });
    });

    cy.then(() => {
      Cypress.env("_c8yscrnCustomizedElements", customizedElements);
      Cypress.env("_c8yscrnHighlightElements", highlightElements);
      logger.end();
      return subject;
    });
  }
);

Cypress.Commands.add("clearHighlights", () => {
  let customizedElements: Array<[JQuery<HTMLElement>, any]> =
    Cypress.env("_c8yscrnCustomizedElements") || [];
  let highlightElements: Array<JQuery<HTMLElement>> =
    Cypress.env("_c8yscrnHighlightElements") || [];

  const consoleProps: any = {
    customizedElements: customizedElements || null,
    highlightElements: highlightElements || null,
  };

  Cypress.log({
    name: "clearHighlights",
    consoleProps: () => consoleProps,
    message: "",
  });

  customizedElements.forEach(([$element, styles]) => $element.css(styles));
  customizedElements = [];
  highlightElements.forEach(($element) => $element.remove());
  highlightElements = [];
});

function isJQueryElement(obj: any): obj is JQuery<HTMLElement> {
  return (
    obj instanceof Cypress.$ && _.isArray(obj) && obj[0] instanceof HTMLElement
  );
}

function findCommonParent(
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
    if (isCommonParent === true && r.width > 0 && r.height > 0) {
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
function hasParent(element: HTMLElement, parent: HTMLElement): boolean {
  let currentElement = element;

  while (currentElement.parentElement) {
    if (currentElement.parentElement === parent) {
      return true;
    }
    currentElement = currentElement.parentElement;
  }

  return false;
}

function getElementPositionWithinParent($e: HTMLElement, $p: HTMLElement) {
  const childRect = $e.getBoundingClientRect();
  const parentRect = $p.getBoundingClientRect();

  return new DOMRectReadOnly(
    childRect.left - parentRect.left,
    childRect.top - parentRect.top,
    childRect.width,
    childRect.height
  );
}
