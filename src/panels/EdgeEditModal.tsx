import { useState, useEffect } from "react";
import { Pencil, Check, ArrowRight } from "lucide-react";
import { Dialog } from "../components/Dialog";
import { Button, Input } from "../components/ui";

interface EdgeEditModalProps {
  open: boolean;
  onClose: () => void;
  label: string;
  metadataJson: string | null;
  onSave: (label: string, metadataJson: string | null) => void;
}

export default function EdgeEditModal({
  open, onClose, label, metadataJson, onSave,
}: EdgeEditModalProps) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftMetadata, setDraftMetadata] = useState(metadataJson || "");

  useEffect(() => {
    if (open) {
      setEditing(false);
      setDraftLabel(label);
      setDraftMetadata(metadataJson || "");
    }
  }, [open, label, metadataJson]);

  function handleSave() {
    onSave(draftLabel, draftMetadata || null);
    setEditing(false);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      setEditing((prev) => !prev);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (editing) {
        setEditing(false);
        setDraftLabel(label);
      } else {
        onClose();
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={440}
      onKeyDown={handleKeyDown}
      header={
        <div className="node-edit-modal__header">
          <span className="node-edit-modal__header-title">
            <ArrowRight size={13} />
            Edge
          </span>
          <Button
            variant={editing ? "primary" : "ghost"}
            size="sm"
            onClick={() => setEditing((prev) => !prev)}
          >
            {editing ? <Check size={12} /> : <Pencil size={12} />}
            {editing ? " Done" : " Edit"}
          </Button>
        </div>
      }
    >
      {!editing ? (
        <div className="node-edit-modal__body">
          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">Label</div>
            <div className="node-edit-modal__text">
              {label || "No label"}
            </div>
          </div>
          <div className="node-edit-modal__field">
            <div className="node-edit-modal__label">Metadata</div>
            <div className="node-edit-modal__text node-edit-modal__text--dim">
              {metadataJson || "No metadata"}
            </div>
          </div>
        </div>
      ) : (
        <div className="node-edit-modal__body">
          <Input
            label="Label"
            value={draftLabel}
            onChange={setDraftLabel}
            placeholder="Edge label"
            autoFocus
          />
          <Input
            label="Metadata (JSON)"
            value={draftMetadata}
            onChange={setDraftMetadata}
            placeholder="{}"
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <Button variant="ghost" onClick={() => { setEditing(false); setDraftLabel(label); }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save
            </Button>
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
