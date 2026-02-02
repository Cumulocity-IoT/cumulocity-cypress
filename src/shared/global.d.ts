declare global {
  interface Response {
    data?: string | any;
    method?: string;
    responseObj?: Partial<Cypress.Response<any>>;
    requestBody?: string | any;
  }
  namespace Cypress {
    interface Response {
      url?: string;
      requestBody?: string | any;
      method?: string;
      $body?: any;
    }
  }
}

export {};
