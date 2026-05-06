import fs from "fs/promises";
import path from "path";
import { app } from "electron";

const getConfigPath = () => {
  const isPortable = process.env.PORTABLE_MODE === "true";
  return isPortable
    ? path.join(process.cwd(), "data")
    : path.join(app.getPath("appData"), "Industrial Protocol Studio");
};

export async function saveConfig(key: string, value: unknown) {
  const dir = getConfigPath();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify(value, null, 2));
}

export async function loadConfig(key: string) {
  try {
    const data = await fs.readFile(path.join(getConfigPath(), `${key}.json`), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// ── Template Management ──────────────────────────────────────────────

export interface ConfigTemplate {
  id: string;
  name: string;
  protocol: string;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type ConfigTemplateInput = Omit<ConfigTemplate, "createdAt" | "updatedAt">;

const TEMPLATES_DIR = "templates";

function getTemplatesPath() {
  return path.join(getConfigPath(), TEMPLATES_DIR);
}

function getTemplateFilePath(templateId: string) {
  return path.join(getTemplatesPath(), `${templateId}.json`);
}

export async function listTemplates(): Promise<ConfigTemplate[]> {
  try {
    const dir = getTemplatesPath();
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const templates: ConfigTemplate[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      try {
        const data = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const parsed = JSON.parse(data) as ConfigTemplate;
        if (parsed.id && parsed.name && parsed.protocol) {
          templates.push(parsed);
        }
      } catch {
        // Skip malformed template files
      }
    }

    return templates.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveTemplate(template: ConfigTemplateInput): Promise<ConfigTemplate> {
  const dir = getTemplatesPath();
  await fs.mkdir(dir, { recursive: true });

  const now = Date.now();
  const existing = await loadTemplate(template.id);
  const record: ConfigTemplate = {
    ...template,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await fs.writeFile(getTemplateFilePath(record.id), JSON.stringify(record, null, 2));
  return record;
}

export async function loadTemplate(templateId: string): Promise<ConfigTemplate | null> {
  try {
    const data = await fs.readFile(getTemplateFilePath(templateId), "utf-8");
    return JSON.parse(data) as ConfigTemplate;
  } catch {
    return null;
  }
}

export async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    await fs.unlink(getTemplateFilePath(templateId));
    return true;
  } catch {
    return false;
  }
}

export async function exportTemplate(templateId: string, targetPath?: string): Promise<string | null> {
  const template = await loadTemplate(templateId);
  if (!template) {
    return null;
  }

  if (targetPath) {
    await fs.writeFile(targetPath, JSON.stringify(template, null, 2));
    return targetPath;
  }

  return JSON.stringify(template, null, 2);
}

export async function importTemplateFromFile(filePath: string): Promise<ConfigTemplate | null> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data) as ConfigTemplate;
    if (!parsed.id || !parsed.name || !parsed.protocol || !parsed.config) {
      return null;
    }
    // Re-assign id to avoid collisions
    const now = Date.now();
    const record: ConfigTemplate = {
      ...parsed,
      id: `imported-${now}`,
      createdAt: now,
      updatedAt: now
    };
    return await saveTemplate(record);
  } catch {
    return null;
  }
}
