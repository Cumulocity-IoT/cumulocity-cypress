import { Client, IResult, IUserGroup } from "@c8y/client";
import { to_array } from "../util";
import { expectSuccessfulDelete, maxPageSize } from "./helper";

/**
 * Creates a global role (user group) with the specified permissions.
 * 
 * Global roles are user groups that define a set of permissions. This function:
 * 1. Creates a new user group with the specified name
 * 2. Assigns the specified role permissions to the group
 * 
 * @param client - The Cumulocity client instance
 * @param roleOptions - Role name as string, or object with name and optional description
 * @param roles - Array of role IDs or names to assign to this global role (e.g., ['ROLE_USER_MANAGEMENT', 'ROLE_INVENTORY_READ'])
 * @returns Promise resolving to the created user group result
 * 
 * @throws Error if role creation fails or if any of the specified roles cannot be found
 * 
 * @example
 * const roleResult = await createGlobalRole(
 *   client,
 *   { name: 'Custom Admin', description: 'Custom admin role with specific permissions' },
 *   ['ROLE_USER_MANAGEMENT', 'ROLE_INVENTORY_ADMIN']
 * );
 */
export async function createGlobalRole(
  client: Client,
  roleOptions: string | { name: string; description?: string },
  roles: string[]
): Promise<IResult<IUserGroup>> {
  const roleConfig =
    typeof roleOptions === "string" ? { name: roleOptions } : roleOptions;

  if (!roleConfig.name || roleConfig.name.trim() === "") {
    throw new Error("Missing argument. Requiring a name for the global role.");
  }

  // Create the user group
  const createResponse = await client.userGroup.create(roleConfig);
  const userGroup = createResponse.data;

  const userGroupId = userGroup.id;
  if (!userGroupId) {
    throw new Error("Failed to create global role. UserGroup id is missing.");
  }

  // Get all available roles
  const listResponse = await client.userRole.list({
    pageSize: maxPageSize,
    withTotalPages: false,
  });
  const listRoles = listResponse.data || [];

  if (!listRoles || listRoles.length === 0) {
    throw new Error("Failed to load roles. No roles found.");
  }

  // Find matching roles
  const matches = listRoles.filter(
    (r) => roles?.find((item) => item === r.id || item === r.name) != null
  );

  if (matches.length < roles.length) {
    throw new Error(
      `Failed to assign one of provided userRoles to ${roleConfig.name}. User role not found.`
    );
  }

  // Assign roles to the group
  for (const match of matches) {
    if (!match.self) continue;
    await client.userGroup.addRoleToGroup(userGroupId, match.self);
  }

  return createResponse;
}

/**
 * Deletes one or more global roles (user groups) by name.
 * 
 * @param client - The Cumulocity client instance
 * @param roleNames - Single role name or array of role names to delete
 * @param options - Optional configuration
 * @param options.ignoreNotFound - If true (default), ignores 404 errors when role is not found
 * @returns Promise that resolves when all roles are deleted
 * 
 * @throws Error if role names are missing or if deletion fails (unless ignoreNotFound is true)
 * 
 * @example
 * // Delete single role
 * await deleteGlobalRoles(client, 'CustomRole');
 * 
 * @example
 * // Delete multiple roles
 * await deleteGlobalRoles(client, ['Role1', 'Role2', 'Role3']);
 */
export async function deleteGlobalRoles(
  client: Client,
  roleNames: string | string[],
  options?: { ignoreNotFound?: boolean }
) {
  const roleNamesArray = to_array(roleNames) ?? [];
  if (!roleNamesArray || roleNamesArray.length === 0) {
    throw new Error("Missing argument. Requiring an array of role names.");
  }

  const ignoreNotFound = options?.ignoreNotFound ?? true;
  const listResponse = await client.userGroup.list({ pageSize: maxPageSize });
  const groups: IUserGroup[] = listResponse.data || [];

  if (!ignoreNotFound && (!groups || groups.length === 0)) {
    throw new Error("Failed to load userGroups. No groups found.");
  }

  for (const group of groups) {
    if (group.name && roleNames.includes(group.name) && group.id) {
      try {
        const response = await client.userGroup.delete(group.id);
        expectSuccessfulDelete(response.res?.status || 204);
      } catch (error: any) {
        if (error?.res?.status !== 404) {
          throw error;
        }
      }
    }
  }
}