import { Client, IApplication, IResult, IResultList, IUser } from "@c8y/client";
import { to_array } from "../util";
import { wrapFetchResponse } from "../c8yclient";
import { expectSuccessfulDelete, maxPageSize } from "./helper";

/**
 * Creates a user with the specified global roles and optionally assigns applications.
 *
 * This function:
 * 1. Creates the user in Cumulocity
 * 2. Assigns the user to the specified global role groups
 * 3. Optionally assigns applications to the user (by name or IApplication object)
 *
 * @param client - The Cumulocity client instance
 * @param user - The user object to create (must include userName, email, etc.)
 * @param globalRoles - Array of global role names to assign to the user
 * @param applications - Optional array of application names (strings) or IApplication objects to assign
 * @returns Promise resolving to the created user result
 *
 * @throws Error if user creation fails or if roles/applications cannot be assigned
 *
 * @example
 * const userResult = await createUser(
 *   client,
 *   { userName: 'john.doe', email: 'john@example.com', password: 'SecurePass123!' },
 *   ['business'],
 *   ['cockpit', 'devicemanagement']
 * );
 */
export async function createUser(
  client: Client,
  user: IUser,
  globalRoles: string[],
  applications?: string[] | IApplication[]
): Promise<IResult<IUser>> {
  const userResponse: any = await client.user.create(user);
  for (const role of globalRoles) {
    const groupResponse = await wrapFetchResponse(
      await client.core.fetch(
        "/user/" + client.core.tenant + "/groupByName/" + role
      )
    );
    const childId = userResponse?.data?.self;
    const groupId = groupResponse?.data?.id;
    if (!childId || !groupId) {
      throw `Failed to add user ${childId} to group ${childId}.`;
    }
    await client.userGroup.addUserToGroup(groupId, childId);
  }

  const userId = userResponse.data.id;

  // Handle applications if provided
  if (applications && applications.length > 0) {
    const allApps: any[] = [];
    for (const app of applications) {
      if (typeof app === "string") {
        // Fetch application by name
        const applicationResponse = await wrapFetchResponse(
          await client.core.fetch(`/application/applicationsByName/${app}`, {
            headers: {
              accept:
                "application/vnd.com.nsn.cumulocity.applicationcollection+json",
            },
          })
        );

        const applicationsData =
          applicationResponse.data?.applications || applicationResponse.data;
        if (!applicationsData || !Array.isArray(applicationsData)) {
          throw new Error(
            `Application ${app} not found. No or empty response.`
          );
        }

        const apps = applicationsData
          .map((a: any) => {
            if (typeof a === "string") {
              return { type: "HOSTED", id: a };
            } else if (typeof a === "object" && a.id) {
              return { id: a.id, type: a.type || "HOSTED" };
            }
            return undefined;
          })
          .filter((a: any) => a !== undefined);

        allApps.push(...apps);
      } else if (typeof app === "object" && app.id) {
        allApps.push({
          id: app.id,
          type: app.type || "HOSTED",
        });
      } else {
        throw new Error(
          "Invalid application format. Expected string (name) or IApplication object with id."
        );
      }
    }

    // Get user details and merge applications
    if (userId && allApps.length > 0) {
      const userDetailResponse = await client.user.detail(userId);
      const existingApps = userDetailResponse.data?.applications || [];

      // Merge with existing applications, avoiding duplicates by id
      const mergedApps = [...existingApps];
      for (const app of allApps) {
        if (!mergedApps.find((existing: any) => existing.id === app.id)) {
          mergedApps.push(app);
        }
      }
      await client.user.update({ id: userId, applications: mergedApps });
    }
  }

  return userResponse;
}

function isIdentifiedObject(user: IUser): boolean {
  return (
    typeof user === "object" &&
    (user.id != null ||
      user.userName != null ||
      user.displayName != null ||
      user.self != null ||
      user.email != null)
  );
}

type DeleteUserInput =
  | string
  | IUser
  | string[]
  | IUser[]
  | ((filter: IUser) => boolean);

function needsAllUsersFetch(users: DeleteUserInput): boolean {
  const userArray = to_array(users) ?? [];
  return (
    userArray.filter(
      (u) =>
        typeof u === "string" ||
        typeof u === "function" ||
        typeof u === "string" ||
        (typeof u === "object" && u.userName == null && u.id == null)
    ).length > 0
  );
}

/**
 * Deletes one or more users from Cumulocity.
 *
 * Supports multiple input formats:
 * - Single username string
 * - Single IUser object (matched by id, userName, displayName, self, or email)
 * - Array of usernames or IUser objects
 * - Filter function to select users to delete
 *
 * When an IUser object is provided, the function matches it against existing users using
 * any available identifying properties (id, userName, displayName, self, email). This allows
 * for flexible matching even with partial user objects.
 *
 * @param client - The Cumulocity client instance
 * @param user - Username(s), IUser object(s), or filter function to identify users to delete
 * @param options - Optional configuration
 * @param options.ignoreNotFound - If true (default), ignores 404 errors when user is not found
 * @returns Promise that resolves when all users are deleted
 *
 * @throws Error if user is missing required properties or if deletion fails (unless ignoreNotFound is true)
 *
 * @example
 * // Delete single user by username
 * await deleteUser(client, 'john.doe');
 *
 * @example
 * // Delete multiple users
 * await deleteUser(client, ['user1', 'user2', 'user3']);
 *
 * @example
 * // Delete users matching a filter
 * await deleteUser(client, (user) => user.email?.includes('@example.com'));
 *
 * @example
 * // Delete user by partial IUser object
 * await deleteUser(client, { displayName: 'John Doe', email: 'john@example.com' });
 */
export async function deleteUser(
  client: Client,
  user: string | IUser | string[] | IUser[] | ((filter: IUser) => boolean),
  options?: { ignoreNotFound?: boolean }
): Promise<void> {
  if (!user) {
    throw new Error(
      "Missing user argument. deleteUser() requires IUser object or username string."
    );
  }

  const userArray = to_array(user) ?? [];
  const ignoreNotFound = options?.ignoreNotFound ?? true;

  let allUsersResponse: IResultList<IUser> | undefined = undefined;
  if (needsAllUsersFetch(user)) {
    try {
      allUsersResponse = await client.user.list({
        pageSize: maxPageSize,
      });
    } catch (error) {
      throw new Error(`Failed to fetch list of users for list of usernames or filter function: ${error}`);
    }
  }

  let allUsers: IUser[] | undefined = undefined;
  if (typeof user === "function") {
    const fn = user as (filter: IUser) => boolean;
    allUsers = allUsersResponse?.data.filter((userItem) => fn(userItem));
  } else {
    allUsers = userArray.reduce((acc: IUser[], u) => {
      if (typeof u === "string") {
        const lowerU = u.toLowerCase();
        const foundUser = allUsersResponse?.data.find(
          (userItem) =>
            userItem.userName?.toLowerCase() === lowerU ||
            userItem.id?.toLowerCase() === lowerU
        ) ?? false;
        if (!foundUser) {
          if (ignoreNotFound) {
            return acc;
          }
          throw new Error(`User with username '${u}' not found.`);
        }
        acc.push(foundUser);
      } else if (typeof u === "object") {
        if (!isIdentifiedObject(u)) {
          throw new Error(
            "IUser object must have at least one identifying property (id, userName, displayName, self, or email)."
          );
        }
        if (u.id != null || u.userName != null) {
          acc.push(u);
          return acc;
        }

        // If u is IUser object, match using fields available in u
        // Properties used for matching: id, userName, displayName, self, email
        const foundUser =
          allUsersResponse?.data.find((userItem) => {
            if (u.displayName && userItem.displayName !== u.displayName)
              return false;
            if (u.self && userItem.self !== u.self) return false;
            if (
              u.email &&
              userItem.email?.toLowerCase() !== u.email.toLowerCase()
            )
              return false;
            return true;
          }) ?? false;

        if (!foundUser) {
          if (ignoreNotFound) {
            return acc;
          }
          const identifier =
            u.userName || u.email || u.displayName || u.id || "unknown";
          throw new Error(`User with identifier '${identifier}' not found.`);
        }
        acc.push(foundUser);
      }
      return acc;
    }, []);
  }

  for (const user of allUsers ?? []) {
    try {
      const response = await client.user.delete(user.id ?? user.userName!);
      expectSuccessfulDelete(response.res?.status || 204);
    } catch (error: any) {
      if (error?.res?.status && error?.res?.status !== 404) throw error;
    }
  }
}

/**
 * Assigns one or more global roles to a user.
 *
 * This function adds the user to the specified global role groups, granting them
 * the permissions associated with those roles.
 *
 * @param client - The Cumulocity client instance
 * @param username - Username string or IUser object (must have userName property)
 * @param roles - Array of global role names to assign to the user
 * @returns Promise that resolves when all roles are assigned
 *
 * @throws Error if username is missing, roles array is empty, or if role assignment fails
 *
 * @example
 * await assignUserRoles(client, 'john.doe', ['business', 'admins']);
 *
 * @example
 * const user = await client.user.detail('john.doe');
 * await assignUserRoles(client, user.data, ['devicemanagement']);
 */
export async function assignUserRoles(
  client: Client,
  username: string | IUser,
  roles: string[]
) {
  const userIdentifier =
    typeof username === "object" && username.userName
      ? username.userName
      : username;

  if (!userIdentifier || (typeof username === "object" && !username.userName)) {
    throw new Error(
      "Missing argument. Requiring IUser object with userName or username argument."
    );
  }

  if (!roles || roles.length === 0) {
    throw new Error("Missing argument. Requiring a string array with roles.");
  }

  const userResponse = await client.user.detail(userIdentifier);
  const childId = userResponse.data?.self;
  if (!childId) {
    throw new Error(
      `Failed to assign roles to user ${userIdentifier}. User data null or does not contain self linking.`
    );
  }

  for (const role of roles) {
    const groupResponse: any = await client.core.fetch(
      `/user/${client.core.tenant}/groupByName/${role}`
    );
    const groupId = groupResponse.data?.id;

    if (!childId || !groupId) {
      throw new Error(`Failed to add user ${childId} to group ${groupId}.`);
    }

    await client.userGroup.addUserToGroup(groupId, childId);
  }
}

/**
 * Removes all global roles currently assigned to a user.
 *
 * This function removes the user from all global role groups, effectively
 * revoking all role-based permissions.
 *
 * @param client - The Cumulocity client instance
 * @param username - Username string or IUser object (must have userName property)
 * @returns Promise that resolves when all roles are removed
 *
 * @throws Error if username is missing or if role removal fails
 *
 * @example
 * await clearUserRoles(client, 'john.doe');
 *
 * @example
 * const user = await client.user.detail('john.doe');
 * await clearUserRoles(client, user.data);
 */
export async function clearUserRoles(client: Client, username: string | IUser) {
  const userIdentifier =
    typeof username === "object" && username.userName
      ? username.userName
      : username;

  if (!userIdentifier || (typeof username === "object" && !username.userName)) {
    throw new Error(
      "Missing argument. Requiring IUser object with userName or username argument."
    );
  }

  const response = await client.user.detail(userIdentifier);
  const assignedRoles = response.data.groups?.references;

  if (!assignedRoles || assignedRoles.length === 0) {
    return;
  }

  for (const assignedRole of assignedRoles) {
    await client.userGroup.removeUserFromGroup(
      assignedRole.group.id,
      userIdentifier
    );
  }
}

/**
 * Generates a secure random password with mixed case letters, numbers, and special characters.
 *
 * The password includes:
 * - Uppercase and lowercase letters (50% chance for each letter)
 * - Numbers (from timestamp)
 * - Special characters (!@#$%^&*())
 *
 * @param length - The desired length of the password (default: 28, minimum: 8)
 * @returns A randomly generated password string
 *
 * @example
 * const password = generatePassword();
 * // Returns something like: "2Kl9j8Gh!4m2@x7n#5p3q8r9"
 *
 * @example
 * const shortPassword = generatePassword(12);
 * // Returns a 12-character password
 */
export function generatePassword(length: number = 28): string {
  const minLength = 8;
  const targetLength = Math.max(length, minLength);

  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2);
  const random2 = Math.random().toString(36).substring(2);

  // Build password ensuring minimum length before randomization
  const base = `${timestamp}-${random1}-${random2}`.substring(0, targetLength);
  const specialChars = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

  return randomizePassword(base, specialChars);
}

/**
 * Converts letters to uppercase by 50% chance and replaces hyphens with special characters.
 * Ensures at least one uppercase character is included.
 *
 * @param text - The base text to randomize
 * @param replaceOptions - Array of special characters to use for replacing hyphens
 * @returns The randomized password string
 *
 * @internal
 */
function randomizePassword(text: string, replaceOptions: string[]) {
  let randomizedString = "";
  // make sure that at least one char is uppercase by using isFirst flag
  let isFirst = true;

  for (let i = 0; i < text.length; i++) {
    const character = text.charAt(i);

    if (/^[a-zA-Z]$/.test(character)) {
      const transformedCharacter =
        isFirst || Math.random() < 0.5
          ? character.toUpperCase()
          : character.toLowerCase();
      randomizedString += transformedCharacter;
      isFirst = false;
      continue;
    }

    if (character === "-") {
      const index = Math.floor(Math.random() * replaceOptions.length);
      randomizedString += replaceOptions[index];
      continue;
    }

    randomizedString += character;
  }

  return randomizedString;
}
