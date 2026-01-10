import { IFetchResponse, IResult } from "@c8y/client";

export const maxPageSize = 2000;

/**
 * Wraps a fetch response into a Cumulocity IResult format.
 * 
 * Converts raw IFetchResponse from client.core.fetch() into a standardized
 * IResult object with data and response properties.
 * 
 * @param response - The IFetchResponse from a fetch call
 * @returns Promise resolving to an IResult object with parsed JSON data
 * 
 * @example
 * const fetchResponse = await client.core.fetch('/user/tenant/users');
 * const result = await wrapFetchResponse(fetchResponse);
 * console.log(result.data); // Parsed JSON data
 */
export async function wrapFetchResponse(
  response: IFetchResponse
): Promise<IResult<any>> {
  const body = await response.text();
  const data = JSON.parse(body);
  return {
    data,
    res: response,
  };
}

/**
 * Validates that a delete operation was successful.
 * 
 * Accepts status codes:
 * - 204 (No Content) - Successfully deleted
 * - 404 (Not Found) - Resource already deleted or never existed
 * 
 * @param status - HTTP status code to validate
 * @throws Error if status is not 204 or 404
 * 
 * @internal
 */
export function expectSuccessfulDelete(status: number): void {
  if (status !== 204 && status !== 404) {
    throw new Error(`Expected status 204 or 404, but got ${status}`);
  }
}
