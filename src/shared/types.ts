/**
 * Tenant ID of a Cumulocity tenant.
 * @example t123456
 */
export type C8yTenant = string;

/**
 * Base URL of a Cumulocity tenant.
 * @example https://tenant.eu-latest.cumulocity.com
 */
export type C8yBaseUrl = string;

export interface C8yHighlightOptions {
    /**
     * The border style. Use any valid CSS border style. If provided an object, keys override the default border style.
     * @examples ["1px solid red"]
     */
    border?: string | any;
    /**
     * The CSS styles to apply to the DOM element. Use any valid CSS styles.
     * @examples [["background-color: yellow", "outline: dashed", "outline-offset: +3px"]]
     */
    styles?: any;
    /**
     * Overwrite the width of the highlighted element. If smaller than 1, the value is used as percentage of the element width.
     */
    width?: number;
    /**
     * Overwrite the height of the highlighted element. If smaller than 1, the value is used as percentage of the element height.
     */
    height?: number;
    /**
     * If true, existing highlights will be cleared before highlighting. The default is false.
     * @default false
     */
    clear?: boolean;
  }