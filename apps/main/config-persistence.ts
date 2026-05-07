import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import {
  saveConfig,
  loadConfig,
  listTemplates,
  saveTemplate,
  loadTemplate,
  deleteTemplate,
  exportTemplate,
  importTemplateFromFile,
  type ConfigTemplateInput
} from "../../packages/config-manager";
import {
  storeCredential,
  retrieveCredential,
  deleteCredential,
  listCredentials
} from "../../packages/credential-store";

// ── Types ─────────────────────────────────────────────────────────────

export interface LogFunction {
  (level: "info" | "warn" | "error", message: string, meta?: unknown): void;
}

// ── Zod Schemas ───────────────────────────────────────────────────────

export const TemplateSaveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  protocol: z.string().min(1),
  config: z.record(z.unknown())
});

export const CredentialStoreSchema = z.object({
  target: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1)
});

export const CredentialTargetSchema = z.string().min(1);

export const CredentialListSchema = z.object({
  prefix: z.string().min(1)
});

// ── Config Operations ─────────────────────────────────────────────────

export async function getConfig(key: string): Promise<unknown> {
  return loadConfig(key);
}

export async function setConfig(key: string, value: unknown): Promise<{ success: true }> {
  await saveConfig(key, value);
  return { success: true };
}

// ── Template Operations ───────────────────────────────────────────────

export async function listAllTemplates(recordLog: LogFunction): Promise<unknown[]> {
  try {
    return await listTemplates();
  } catch (error) {
    recordLog("error", "Failed to list templates", error);
    return [];
  }
}

export async function saveTemplateEntry(
  template: ConfigTemplateInput,
  recordLog: LogFunction
): Promise<{ success: true; template: unknown } | { success: false; error: string }> {
  try {
    const saved = await saveTemplate(template);
    recordLog("info", `Template saved: ${saved.name}`, { id: saved.id });
    return { success: true, template: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save template";
    recordLog("error", "Failed to save template", error);
    return { success: false, error: message };
  }
}

export async function loadTemplateEntry(
  templateId: string,
  recordLog: LogFunction
): Promise<{ success: true; template: unknown } | { success: false; error: string }> {
  try {
    const template = await loadTemplate(templateId);
    if (!template) {
      return { success: false, error: "Template not found" };
    }
    return { success: true, template };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load template";
    recordLog("error", "Failed to load template", error);
    return { success: false, error: message };
  }
}

export async function deleteTemplateEntry(
  templateId: string,
  recordLog: LogFunction
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const deleted = await deleteTemplate(templateId);
    if (!deleted) {
      return { success: false, error: "Template not found" };
    }
    recordLog("info", `Template deleted: ${templateId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete template";
    recordLog("error", "Failed to delete template", error);
    return { success: false, error: message };
  }
}

export async function exportTemplateEntry(
  templateId: string,
  targetPath: string | undefined,
  mainWindow: BrowserWindow | null,
  recordLog: LogFunction
): Promise<{ success: true; filePath: string } | { success: false; error: string }> {
  try {
    if (targetPath) {
      const result = await exportTemplate(templateId, targetPath);
      return result
        ? { success: true, filePath: result }
        : { success: false, error: "Template not found" };
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "Export Template",
      defaultPath: "protocol-template.json",
      filters: [{ name: "JSON Files", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: "Export cancelled" };
    }

    const exported = await exportTemplate(templateId, result.filePath);
    return exported
      ? { success: true, filePath: exported }
      : { success: false, error: "Template not found" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export template";
    recordLog("error", "Failed to export template", error);
    return { success: false, error: message };
  }
}

export async function importTemplateEntry(
  filePath: string | undefined,
  mainWindow: BrowserWindow | null,
  recordLog: LogFunction
): Promise<{ success: true; template: unknown } | { success: false; error: string }> {
  try {
    let targetPath = filePath;

    if (!targetPath) {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "Import Template",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: "Import cancelled" };
      }

      targetPath = result.filePaths[0];
    }

    const template = await importTemplateFromFile(targetPath);
    if (!template) {
      return { success: false, error: "Invalid template file" };
    }

    recordLog("info", `Template imported: ${template.name}`, { id: template.id });
    return { success: true, template };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import template";
    recordLog("error", "Failed to import template", error);
    return { success: false, error: message };
  }
}

// ── Credential Operations ─────────────────────────────────────────────

export function storeCredentialEntry(
  target: string,
  username: string,
  password: string,
  recordLog: LogFunction
): { success: true } | { success: false; error: string } {
  try {
    storeCredential(target, username, password);
    recordLog("info", `Credential stored: ${target}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store credential";
    recordLog("error", `Failed to store credential: ${target}`, error);
    return { success: false, error: message };
  }
}

export function retrieveCredentialEntry(
  target: string,
  recordLog: LogFunction
): { success: true; credential: unknown } | { success: false; error: string } {
  try {
    const entry = retrieveCredential(target);
    if (!entry) {
      return { success: false, error: "Credential not found" };
    }
    return { success: true, credential: entry };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve credential";
    recordLog("error", `Failed to retrieve credential: ${target}`, error);
    return { success: false, error: message };
  }
}

export function deleteCredentialEntry(
  target: string,
  recordLog: LogFunction
): { success: boolean } | { success: false; error: string } {
  try {
    const deleted = deleteCredential(target);
    if (deleted) {
      recordLog("info", `Credential deleted: ${target}`);
    }
    return { success: deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete credential";
    recordLog("error", `Failed to delete credential: ${target}`, error);
    return { success: false, error: message };
  }
}

export function listCredentialEntries(
  prefix: string,
  recordLog: LogFunction
): { success: true; targets: string[] } | { success: false; error: string; targets: string[] } {
  try {
    const targets = listCredentials(prefix);
    return { success: true, targets };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list credentials";
    recordLog("error", "Failed to list credentials", error);
    return { success: false, error: message, targets: [] };
  }
}
