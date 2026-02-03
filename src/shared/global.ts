/**
 * Global type augmentations for Response and Cypress.Response interfaces.
 * This module extends the global interfaces to add custom properties used by c8yclient.
 */

declare global {
  interface Response {
    data?: string | any;
    method?: string;
    responseObj?: Partial<Cypress.Response<any>>;
    requestBody?: string | any;
  }

  namespace Cypress {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Response<T> {
      url?: string;
      requestBody?: string | any;
      method?: string;
      $body?: any;
    }
  }
}

// This export makes this a module, ensuring the declarations are processed
export {};
