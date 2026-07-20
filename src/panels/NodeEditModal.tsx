import { useState, useEffect } from "react";
import { FileText, Link, Tag, Pencil, Check, Plus, Trash2 } from "lucide-react";
import { Dialog } from "../components/Dialog";
import { Button, Input } from "../components/ui";

export interface NodeSource {
  url: string;
  source_type: string;
  sort_order: number;
}

export interface NodeEditData {
  title: string;
  description: string;
  sources: NodeSource[];
  tags: string[];
}

interface NodeEditModalProps {
  open: boolean;
  onClose: () => void;
  data: NodeEditData;
  onSave: (data: NodeEditData) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onAddSource: (url: string, sourceType: "file" | "link") => void;
  onRemoveSource: (index: number) => void;
}

export default function NodeEditModal({
  open, onClose, data, onSave,
  onAddTag, onRemoveTag,
  onAddSource, onRemoveSource,
}: NodeEditModalProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(data.title);
  const [draftDescription, setDraftDescription] = useState(data.description);
  const [draftTags, setDraftTags] = useState(data.tags);
  const [draftSources, setDraftSources] = useState(data.sources);
  const [newTag, setNewTag] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState<"file" | "link">("file");

  useEffect(() => {
    if (open) {
      setEditing(false);
      setDraftTitle(data.title);
      setDraftDescription(data.description);
      setDraftTags(data.tags);
      setDraftSources(data.sources);
      setNewTag("");
      setNewSourceUrl("");
    }
  }, [open, data]);

  function handleSave() {
    onSave({
      title: draftTitle,
      description: draftDescription,
      sources: draftSources,
      tags: draftTags,
    });
    setEditing(false);
  }

  function handleAddTag() {
    if (newTag.trim()) {
      onAddTag(newTag.trim());
      setDraftTags([...draftTags, newTag.trim()]);
      setNewTag("");
    }
  }

  function handleRemoveTag(tag: string) {
    onRemoveTag(tag);
    setDraftTags(draftTags.filter((t) => t !== tag));
  }

  function handleAddSource() {
    if (newSourceUrl.trim()) {
      onAddSource(newSourceUrl.trim(), newSourceType);
      setDraftSources([...draftSources, { url: newSourceUrl.trim(), source_type: newSourceType, sort_order: draftSources.length }]);
      setNewSourceUrl("");
    }
  }

  function handleRemoveSource(idx: number) {
    onRemoveSource(idx);
    setDraftSources(draftSources.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      setEditing((prev) => !prev);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="node-edit-modal"
      width={500}
      onKeyDown={handleKeyDown}
      header={
        <div className="node-edit-modal__header">
          <span className="node-edit-modal__header-title">
            <FileText size={13} />
            {data.title || "Untitled Node"}
          </span>
          <Button
            variant={editing ? "primary" : "ghost"}
            size="sm"
            onClick={() => {
              if (editing) {
                handleSave();
              } else {
                setEditing(true);
              }
            }}
          >
            {editing ? <Check size={12} /> : <Pencil size={12} />}
            {editing ? " Done" : " Edit"}
          </Button>
        </div>
      }
    >
      {/* Read-only view */}
      {!editing && (
        <div className="node-edit-modal__body">
          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">Description</div>
            <div className="node-edit-modal__text">
              {data.description || "No description"}
            </div>
          </div>

          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">
              Sources ({data.sources.length})
            </div>
            {data.sources.length === 0 ? (
              <div className="node-edit-modal__text node-edit-modal__text--dim">No sources</div>
            ) : (
              <div className="node-edit-modal__list">
                {data.sources.map((s, i) => (
                  <div key={i} className="node-edit-modal__list-item">
                    {s.source_type === "file" ? <FileText size={12} /> : <Link size={12} />}
                    <span className="node-edit-modal__list-item-text">{s.url}</span>
                    <span className="node-edit-modal__list-item-type">{s.source_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">
              <Tag size={12} /> Tags ({data.tags.length})
            </div>
            {data.tags.length === 0 ? (
              <div className="node-edit-modal__text node-edit-modal__text--dim">No tags</div>
            ) : (
              <div className="node-edit-modal__tags">
                {data.tags.map((t, i) => (
                  <span key={i} className="canvas-node-tag">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit view */}
      {editing && (
        <div className="node-edit-modal__body">
          <Input
            label="Title"
            value={draftTitle}
            onChange={setDraftTitle}
            placeholder="Node title"
          />

          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">Description</div>
            <textarea
              className="dialog-input"
              rows={4}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              placeholder="Description..."
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">Sources</div>
            <div className="node-edit-modal__add-row">
              <select
                value={newSourceType}
                onChange={(e) => setNewSourceType(e.target.value as "file" | "link")}
                className="dialog-input"
                style={{ width: "80px" }}
              >
                <option value="file">File</option>
                <option value="link">Link</option>
              </select>
              <Input
                value={newSourceUrl}
                onChange={setNewSourceUrl}
                placeholder="path or URL"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddSource(); }}
              />
              <Button variant="ghost" size="sm" onClick={handleAddSource}>
                <Plus size={12} />
              </Button>
            </div>
            {draftSources.length > 0 && (
              <div className="node-edit-modal__list">
                {draftSources.map((s, i) => (
                  <div key={i} className="node-edit-modal__list-item">
                    {s.source_type === "file" ? <FileText size={12} /> : <Link size={12} />}
                    <span className="node-edit-modal__list-item-text">{s.url}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveSource(i)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">Tags</div>
            <div className="node-edit-modal__add-row">
              <Input
                value={newTag}
                onChange={setNewTag}
                placeholder="Add tag..."
                onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); }}
              />
              <Button variant="ghost" size="sm" onClick={handleAddTag}>
                <Plus size={12} />
              </Button>
            </div>
            {draftTags.length > 0 && (
              <div className="node-edit-modal__tags">
                {draftTags.map((t, i) => (
                  <span key={i} className="canvas-node-tag canvas-node-tag--removable" onClick={() => handleRemoveTag(t)}>
                    {t} ×
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="node-edit-modal__footer">
        <kbd>⌘</kbd><kbd>E</kbd> {editing ? "done" : "edit"}
        <span className="node-edit-modal__footer-sep" />
        <kbd>Esc</kbd> close
      </div>
    </Dialog>
  );
}
