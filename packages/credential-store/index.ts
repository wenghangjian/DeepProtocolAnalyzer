import { execSync } from "child_process";
import log from "electron-log";

// ── Types ─────────────────────────────────────────────────────────────

export interface CredentialEntry {
  target: string;
  username: string;
  password: string;
}

// ── Platform Detection ────────────────────────────────────────────────

const isWindows = process.platform === "win32";

function warnIfUnsupported(operation: string): void {
  if (!isWindows) {
    log.warn(
      `[credential-store] ${operation}: Windows Credential Manager is not available on ${process.platform}. ` +
      "Credential will be stored in memory only and will not persist across restarts."
    );
  }
}

// ── In-Memory Fallback (non-Windows) ──────────────────────────────────

const memoryStore = new Map<string, CredentialEntry>();

// ── Credential CRUD via cmdkey.exe ────────────────────────────────────

/**
 * Store a credential in Windows Credential Manager.
 * On non-Windows platforms, falls back to an in-memory store.
 */
export function storeCredential(target: string, username: string, password: string): void {
  if (!isWindows) {
    warnIfUnsupported("store");
    memoryStore.set(target, { target, username, password });
    return;
  }

  try {
    // Escape special characters in the password for cmd.exe
    const escapedPassword = password.replace(/([%^&|<>])/g, "^$1");
    const escapedUsername = username.replace(/([%^&|<>])/g, "^$1");
    const escapedTarget = target.replace(/([%^&|<>])/g, "^$1");

    execSync(
      `cmdkey /generic:"${escapedTarget}" /user:"${escapedUsername}" /pass:"${escapedPassword}"`,
      { stdio: "pipe", timeout: 10_000 }
    );
    log.info(`[credential-store] Stored credential: ${target}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[credential-store] Failed to store credential ${target}: ${message}`);
    throw new Error(`Failed to store credential: ${message}`);
  }
}

/**
 * Retrieve a credential from Windows Credential Manager.
 * Returns null if the credential does not exist.
 * On non-Windows platforms, reads from the in-memory store.
 */
export function retrieveCredential(target: string): CredentialEntry | null {
  if (!isWindows) {
    warnIfUnsupported("retrieve");
    return memoryStore.get(target) ?? null;
  }

  try {
    const escapedTarget = target.replace(/([%^&|<>])/g, "^$1");
    const output = execSync(`cmdkey /list:"${escapedTarget}"`, {
      stdio: "pipe",
      timeout: 10_000,
      encoding: "utf-8"
    });

    // cmdkey /list output format:
    //   Target: Domain:target=TERMSRV/...
    //   Type: Generic
    //   User: username
    //   ...
    if (!output || output.includes("No credentials")) {
      return null;
    }

    const targetMatch = output.match(/Target:\s*(.+)/);
    const userMatch = output.match(/User:\s*(.+)/);

    if (!targetMatch) {
      return null;
    }

    // cmdkey does not expose the password directly.
    // We use PowerShell to read the actual password via the Credential Manager API.
    const psCommand = [
      "Add-Type -AssemblyName System.Security;",
      "$cred = New-Object System.Net.NetworkCredential;",
      `$cred.UserName = '${userMatch?.[1]?.trim() ?? ""}';`,
      // Use cmdkey to verify existence, then use CredRead via P/Invoke for the password
      "Add-Type @\"",
      "using System;",
      "using System.Runtime.InteropServices;",
      "public class CredNative {",
      "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
      "  public struct CREDENTIAL {",
      "    public int Flags;",
      "    public int Type;",
      "    public string TargetName;",
      "    public string Comment;",
      "    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;",
      "    public int CredentialBlobSize;",
      "    public IntPtr CredentialBlob;",
      "    public int Persist;",
      "    public int AttributeCount;",
      "    public IntPtr Attributes;",
      "    public string TargetAlias;",
      "    public string UserName;",
      "  }",
      "  [DllImport(\"advapi32.dll\", SetLastError = true, CharSet = CharSet.Unicode)]",
      "  public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);",
      "  [DllImport(\"advapi32.dll\", SetLastError = true)]",
      "  public static extern void CredFree(IntPtr buffer);",
      "}",
      "\"@;",
      `$ptr = [IntPtr]::Zero;`,
      `$ok = [CredNative]::CredRead('${target.replace(/'/g, "''")}', 1, 0, [ref]$ptr);`,
      "if ($ok) {",
      "  $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][CredNative+CREDENTIAL]);",
      "  $password = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, $cred.CredentialBlobSize / 2);",
      "  [CredNative]::CredFree($ptr);",
      "  Write-Output $password;",
      "} else {",
      "  Write-Output '';",
      "}"
    ].join("\n");

    const password = execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      stdio: "pipe",
      timeout: 15_000,
      encoding: "utf-8"
    }).trim();

    if (!password) {
      return null;
    }

    return {
      target: targetMatch[1].trim(),
      username: userMatch?.[1]?.trim() ?? "",
      password
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[credential-store] Failed to retrieve credential ${target}: ${message}`);
    return null;
  }
}

/**
 * Delete a credential from Windows Credential Manager.
 * Returns true if deleted, false if not found.
 * On non-Windows platforms, removes from the in-memory store.
 */
export function deleteCredential(target: string): boolean {
  if (!isWindows) {
    warnIfUnsupported("delete");
    return memoryStore.delete(target);
  }

  try {
    const escapedTarget = target.replace(/([%^&|<>])/g, "^$1");
    execSync(`cmdkey /delete:"${escapedTarget}"`, {
      stdio: "pipe",
      timeout: 10_000
    });
    log.info(`[credential-store] Deleted credential: ${target}`);
    return true;
  } catch (error) {
    // cmdkey returns non-zero exit code if credential doesn't exist
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("ERROR_NOT_FOUND")) {
      return false;
    }
    log.error(`[credential-store] Failed to delete credential ${target}: ${message}`);
    return false;
  }
}

/**
 * List all credential target names with a specific prefix.
 * On non-Windows platforms, filters the in-memory store.
 */
export function listCredentials(prefix: string): string[] {
  if (!isWindows) {
    warnIfUnsupported("list");
    return Array.from(memoryStore.keys()).filter((key) => key.startsWith(prefix));
  }

  try {
    const output = execSync("cmdkey /list", {
      stdio: "pipe",
      timeout: 10_000,
      encoding: "utf-8"
    });

    if (!output) {
      return [];
    }

    // Parse cmdkey /list output — each credential block starts with "Target: ..."
    const targets: string[] = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*Target:\s*(.+)$/);
      if (match) {
        const targetName = match[1].trim();
        if (targetName.startsWith(prefix)) {
          targets.push(targetName);
        }
      }
    }

    return targets;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[credential-store] Failed to list credentials: ${message}`);
    return [];
  }
}

// ── DPAPI Encryption (for config file values) ─────────────────────────

/**
 * Encrypt a string value using Windows DPAPI (Data Protection API).
 * Returns a hex-encoded string suitable for storage in config files.
 * On non-Windows platforms, returns the plaintext with a warning.
 */
export function encryptWithDPAPI(data: string): string {
  if (!isWindows) {
    warnIfUnsupported("encryptWithDPAPI");
    return data;
  }

  try {
    const psCommand = [
      "$secure = ConvertTo-SecureString -String '" + data.replace(/'/g, "''") + "' -AsPlainText -Force;",
      "$encrypted = ConvertFrom-SecureString -SecureString $secure;",
      "Write-Output $encrypted"
    ].join(" ");

    const result = execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      stdio: "pipe",
      timeout: 10_000,
      encoding: "utf-8"
    }).trim();

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[credential-store] DPAPI encryption failed: ${message}`);
    throw new Error(`DPAPI encryption failed: ${message}`);
  }
}

/**
 * Decrypt a DPAPI-encrypted hex string back to plaintext.
 * On non-Windows platforms, returns the input as-is.
 */
export function decryptWithDPAPI(encryptedData: string): string {
  if (!isWindows) {
    warnIfUnsupported("decryptWithDPAPI");
    return encryptedData;
  }

  try {
    const psCommand = [
      "$secure = ConvertTo-SecureString -String '" + encryptedData.replace(/'/g, "''") + "';",
      "$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);",
      "$plaintext = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR);",
      "[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR);",
      "Write-Output $plaintext"
    ].join(" ");

    const result = execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      stdio: "pipe",
      timeout: 10_000,
      encoding: "utf-8"
    }).trim();

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[credential-store] DPAPI decryption failed: ${message}`);
    throw new Error(`DPAPI decryption failed: ${message}`);
  }
}

// ── Credential Reference Helpers ──────────────────────────────────────

const CREDENTIAL_REF_PREFIX = "__credential__:";

/**
 * Check if a config value is a credential reference.
 */
export function isCredentialRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(CREDENTIAL_REF_PREFIX);
}

/**
 * Create a credential reference string for storage in config files.
 */
export function createCredentialRef(target: string): string {
  return `${CREDENTIAL_REF_PREFIX}${target}`;
}

/**
 * Extract the credential target from a reference string.
 */
export function parseCredentialRef(ref: string): string | null {
  if (!isCredentialRef(ref)) {
    return null;
  }
  return ref.slice(CREDENTIAL_REF_PREFIX.length);
}

/**
 * Build a standardized credential target name.
 * Format: DPA:<protocol>:<sessionId>:<fieldName>
 */
export function buildCredentialTarget(protocol: string, sessionId: string, fieldName: string): string {
  return `DPA:${protocol}:${sessionId}:${fieldName}`;
}

/**
 * Walk a config object and replace sensitive field values with credential references.
 * Sensitive fields are identified by key name patterns.
 */
export function extractSensitiveFields(
  config: Record<string, unknown>,
  protocol: string,
  sessionId: string
): { sanitized: Record<string, unknown>; stored: Array<{ target: string; field: string }> } {
  const sensitiveKeys = ["password", "token", "secret", "key", "apiKey", "api_key", "passphrase", "credential"];
  const sanitized = { ...config };
  const stored: Array<{ target: string; field: string }> = [];

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && value.length > 0) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()));

      if (isSensitive && !isCredentialRef(value)) {
        const target = buildCredentialTarget(protocol, sessionId, key);
        storeCredential(target, sessionId, value);
        sanitized[key] = createCredentialRef(target);
        stored.push({ target, field: key });
      }
    }
  }

  return { sanitized, stored };
}

/**
 * Walk a config object and resolve credential references back to actual values.
 */
export function resolveCredentialRefs(config: Record<string, unknown>): Record<string, unknown> {
  const resolved = { ...config };

  for (const [key, value] of Object.entries(resolved)) {
    if (isCredentialRef(value)) {
      const target = parseCredentialRef(value);
      if (target) {
        const entry = retrieveCredential(target);
        if (entry) {
          resolved[key] = entry.password;
        } else {
          log.warn(`[credential-store] Credential not found for ref: ${value}`);
        }
      }
    }
  }

  return resolved;
}

/**
 * Delete all credentials associated with a session.
 */
export function deleteSessionCredentials(protocol: string, sessionId: string): number {
  const prefix = `DPA:${protocol}:${sessionId}:`;
  const targets = listCredentials(prefix);
  let deleted = 0;

  for (const target of targets) {
    if (deleteCredential(target)) {
      deleted++;
    }
  }

  return deleted;
}
