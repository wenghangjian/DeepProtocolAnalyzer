import { useCallback, useEffect, useMemo, useState } from "react";

interface ConfigTemplate {
  id: string;
  name: string;
  protocol: string;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface ConfigTemplatesProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTemplate: (template: ConfigTemplate) => void;
  currentConfig?: {
    protocolId: string;
    transport: string;
    config: Record<string, unknown>;
  };
}

const panelStyles = `
  .template-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(6px);
  }
  .template-panel {
    width: 680px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
    overflow: hidden;
  }
  .template-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }
  .template-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .template-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }
  .template-toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .template-search {
    flex: 1;
    min-width: 200px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid #d7e3f4;
    background: #fff;
    color: #162033;
    font-size: 13px;
    outline: none;
  }
  .template-search:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
  .template-filter {
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid #d7e3f4;
    background: #fff;
    color: #162033;
    font-size: 13px;
    outline: none;
    min-width: 140px;
  }
  .template-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .template-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(191, 219, 254, 0.8);
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .template-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.1);
  }
  .template-info {
    flex: 1;
    min-width: 0;
  }
  .template-name {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 700;
    color: #162033;
  }
  .template-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .template-pill {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: #eff6ff;
    color: #1d4ed8;
  }
  .template-date {
    font-size: 11px;
    color: #94a3b8;
  }
  .template-actions {
    display: flex;
    gap: 6px;
    margin-left: 12px;
    flex-shrink: 0;
  }
  .template-btn {
    height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 120ms ease;
  }
  .template-btn:hover {
    opacity: 0.85;
  }
  .template-btn.primary {
    background: linear-gradient(135deg, #2563eb 0%, #0f766e 100%);
    color: #fff;
  }
  .template-btn.ghost {
    background: #f1f5f9;
    color: #475569;
  }
  .template-btn.danger {
    background: #fef2f2;
    color: #b91c1c;
  }
  .template-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .template-empty {
    padding: 32px 16px;
    border: 1px dashed #cbd5e1;
    border-radius: 14px;
    color: #64748b;
    text-align: center;
    font-size: 13px;
  }
  .template-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
    gap: 10px;
  }
  .template-footer-actions {
    display: flex;
    gap: 10px;
  }
  .template-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1100;
    padding: 12px 18px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
    animation: slideIn 200ms ease;
  }
  .template-notification.success {
    background: #ecfdf3;
    color: #15803d;
    border: 1px solid rgba(22, 163, 74, 0.2);
  }
  .template-notification.error {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid rgba(185, 28, 28, 0.2);
  }
  .template-save-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    margin-bottom: 16px;
    padding: 14px;
    border-radius: 14px;
    background: #f8fafc;
    border: 1px solid rgba(148, 163, 184, 0.18);
  }
  .template-save-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .template-save-field span {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
  }
  .template-save-field input {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid #d7e3f4;
    background: #fff;
    color: #162033;
    font-size: 13px;
    outline: none;
  }
  .template-save-field input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
  .template-confirm-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.3);
    border-radius: 14px;
    z-index: 10;
  }
  .template-confirm-box {
    padding: 16px;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
    text-align: center;
    max-width: 260px;
  }
  .template-confirm-box p {
    margin: 0 0 12px;
    font-size: 13px;
    color: #334155;
  }
  .template-confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  @keyframes slideIn {
    from { transform: translateX(20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;

export default function ConfigTemplates({ isOpen, onClose, onLoadTemplate, currentConfig }: ConfigTemplatesProps) {
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("");
  const [saveName, setSaveName] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showNotification = useCallback((type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const refreshTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.templateApi.list();
      setTemplates(list);
    } catch {
      showNotification("error", "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    if (isOpen) {
      void refreshTemplates();
    }
  }, [isOpen, refreshTemplates]);

  const protocols = useMemo(() => {
    const set = new Set(templates.map((t) => t.protocol));
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (protocolFilter && template.protocol !== protocolFilter) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          template.name.toLowerCase().includes(query) ||
          template.protocol.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [templates, searchQuery, protocolFilter]);

  async function handleSave() {
    if (!currentConfig) {
      showNotification("error", "No session configuration to save.");
      return;
    }
    const name = saveName.trim();
    if (!name) {
      showNotification("error", "Enter a template name before saving.");
      return;
    }

    try {
      const result = await window.templateApi.save({
        id: `tpl-${Date.now()}`,
        name,
        protocol: currentConfig.protocolId,
        config: currentConfig.config
      });
      if (result.success) {
        showNotification("success", `Template "${name}" saved.`);
        setSaveName("");
        void refreshTemplates();
      } else {
        showNotification("error", result.error ?? "Failed to save template.");
      }
    } catch {
      showNotification("error", "Failed to save template.");
    }
  }

  async function handleLoad(template: ConfigTemplate) {
    onLoadTemplate(template);
    showNotification("success", `Template "${template.name}" loaded.`);
    onClose();
  }

  async function handleDelete(templateId: string) {
    try {
      const result = await window.templateApi.delete(templateId);
      if (result.success) {
        showNotification("success", "Template deleted.");
        void refreshTemplates();
      } else {
        showNotification("error", result.error ?? "Failed to delete template.");
      }
    } catch {
      showNotification("error", "Failed to delete template.");
    }
    setConfirmDeleteId(null);
  }

  async function handleExport(templateId: string) {
    try {
      const result = await window.templateApi.export(templateId);
      if (result.success) {
        showNotification("success", `Template exported${result.filePath ? ` to ${result.filePath}` : ""}.`);
      } else if (result.error !== "Export cancelled") {
        showNotification("error", result.error ?? "Failed to export template.");
      }
    } catch {
      showNotification("error", "Failed to export template.");
    }
  }

  async function handleImport() {
    try {
      const result = await window.templateApi.import();
      if (result.success) {
        showNotification("success", `Template "${result.template?.name}" imported.`);
        void refreshTemplates();
      } else if (result.error !== "Import cancelled") {
        showNotification("error", result.error ?? "Failed to import template.");
      }
    } catch {
      showNotification("error", "Failed to import template.");
    }
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <style>{panelStyles}</style>
      {notification ? (
        <div className={`template-notification ${notification.type}`}>
          {notification.message}
        </div>
      ) : null}
      <div className="template-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Config Templates" data-testid="template-panel">
        <div className="template-panel" onClick={(e) => e.stopPropagation()}>
          <div className="template-header">
            <h2>Config Templates</h2>
            <button type="button" className="template-btn ghost" onClick={onClose} aria-label="Close config templates dialog" data-testid="template-close">
              Close
            </button>
          </div>

          <div className="template-body">
            {currentConfig ? (
              <div className="template-save-row">
                <div className="template-save-field">
                  <span>Save Current Config as Template</span>
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g. Modbus lab bench"
                    aria-label="Template name"
                    data-testid="template-save-name"
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
                  />
                </div>
                <button
                  type="button"
                  className="template-btn primary"
                  onClick={() => void handleSave()}
                  disabled={!saveName.trim()}
                  aria-label="Save current configuration as template"
                  data-testid="template-save-btn"
                >
                  Save
                </button>
              </div>
            ) : null}

            <div className="template-toolbar">
              <input
                className="template-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                aria-label="Search templates"
                data-testid="template-search"
              />
              <select
                className="template-filter"
                value={protocolFilter}
                onChange={(e) => setProtocolFilter(e.target.value)}
                aria-label="Filter templates by protocol"
                data-testid="template-protocol-filter"
              >
                <option value="">All Protocols</option>
                {protocols.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="template-empty">Loading templates...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="template-empty">
                {templates.length === 0
                  ? "No templates saved yet. Save your current config above or import a template file."
                  : "No templates match your search."}
              </div>
            ) : (
              <div className="template-list" data-testid="template-list">
                {filteredTemplates.map((template) => (
                  <div key={template.id} className="template-card" style={{ position: "relative" }}>
                    {confirmDeleteId === template.id ? (
                      <div className="template-confirm-overlay">
                        <div className="template-confirm-box">
                          <p>Delete "{template.name}"?</p>
                          <div className="template-confirm-actions">
                            <button
                              type="button"
                              className="template-btn danger"
                              onClick={() => void handleDelete(template.id)}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              className="template-btn ghost"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="template-info">
                      <p className="template-name">{template.name}</p>
                      <div className="template-meta">
                        <span className="template-pill">{template.protocol}</span>
                        <span className="template-date">Updated {formatDate(template.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="template-actions">
                      <button
                        type="button"
                        className="template-btn primary"
                        onClick={() => void handleLoad(template)}
                        aria-label={`Load template ${template.name}`}
                        data-testid={`template-load-${template.id}`}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="template-btn ghost"
                        onClick={() => void handleExport(template.id)}
                        aria-label={`Export template ${template.name}`}
                        data-testid={`template-export-${template.id}`}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        className="template-btn danger"
                        onClick={() => setConfirmDeleteId(template.id)}
                        aria-label={`Delete template ${template.name}`}
                        data-testid={`template-delete-${template.id}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="template-footer">
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              {filteredTemplates.length} of {templates.length} template(s)
            </span>
            <div className="template-footer-actions">
              <button type="button" className="template-btn ghost" onClick={() => void handleImport()} data-testid="template-import-btn">
                Import from File
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
