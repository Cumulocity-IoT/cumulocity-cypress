import { getUnionDOMRect } from "./highlight";

const { _ } = Cypress;

// custom implementation of screenshot command to take screenshot of
// multiple elements by using union of their bounding client rectangles

Cypress.Commands.overwrite<"screenshot", "element">(
  "screenshot",
  (originalFn, ...args) => {
    const subject = args[0];
    if (subject != null && subject.length > 1) {
      const [_name, _options] = args.slice(1);

      let o: Partial<Cypress.ScreenshotOptions> = {};
      let n: string | undefined = undefined;

      if (_.isObjectLike(_name)) {
        o = _name as Partial<Cypress.ScreenshotOptions>;
        n = undefined;
      } else {
        n = _name as string;
        o = (_options as Cypress.ScreenshotOptions) || {};
      }

      const padding = _.pick(o, "padding");
      const unionRect = getUnionDOMRect(subject, padding);
      const clip: Cypress.ScreenshotOptions["clip"] = {
        x: unionRect.left,
        y: unionRect.top,
        width: unionRect.width,
        height: unionRect.height,
      };
      o.clip = clip;

      return originalFn(
        undefined as any,
        n ?? (o as any),
        n ? o : (undefined as any)
      );
    }

    return originalFn(...args);
  }
);
