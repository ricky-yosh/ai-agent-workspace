# Plan: Toggle Zoom Pane (Cmd+Shift+Enter)

## Goal
Add the ability to press `Cmd+Shift+Enter` on a focused panel to temporarily expand it to fill the entire layout. Pressing the shortcut again restores the original split arrangement. Modeled after Ghostty's `toggle_split_zoom` and Blender's `Ctrl+Space` maximize area.

## Architecture: State Flow

```
App (holds zoomedPath, provides onToggleZoom via ref)
├── MainArea (holds focusedPath, handles zoom toggle logic)
│   └── SplitLayout (renders zoomed or full tree based on zoomedPath)
└── KeyboardShortcutsHandler (calls ref.onToggleZoom() on Cmd+Shift+Enter)
```

`focusedPath` lives in `MainArea` (where the panels are).  
`zoomedPath` also lives in `MainArea` (ephemeral UI state, not persisted).  
`KeyboardShortcutsHandler` triggers zoom via a ref to avoid prop drilling.

## Implementation Steps

### Step 1: Add `focusedPath` + `zoomedPath` state to `MainArea`

**File:** `src/App.tsx` — `MainArea` component (line 21)

- Add `focusedPath` state: `useState<number[] | null>(null)`
- Add `zoomedPath` state: `useState<number[] | null>(null)`
- Add `toggleZoom` callback:
  ```ts
  const toggleZoom = useCallback(() => {
    if (!focusedPath) return;
    setZoomedPath((prev) =>
      prev && pathsEqual(prev, focusedPath) ? null : focusedPath
    );
  }, [focusedPath]);
  ```
- Helper `pathsEqual(a, b)` compares two `number[]` for deep equality
- Pass `focusedPath`, `onFocusedPathChange`, `zoomedPath` to `<SplitLayout>`

### Step 2: Expose `toggleZoom` to `KeyboardShortcutsHandler` via ref

**File:** `src/App.tsx` — `App` component (line 364)

- Create `toggleZoomRef = useRef<() => void>(() => {})` at `App` level
- Pass `ref={toggleZoomRef}` to `MainArea`, and `onToggleZoom` prop
- `MainArea` updates the ref: `useEffect(() => { toggleZoomRef.current = toggleZoom; }, [toggleZoom])`
- `KeyboardShortcutsHandler` receives `toggleZoomRef` and calls `toggleZoomRef.current()` on `Cmd+Shift+Enter`

### Step 3: Track focused panel via `onMouseDown`

**File:** `src/SplitLayout.tsx`

- Add `focusedPath` and `onFocusedPathChange` to `SplitLayoutProps`
- On the `.split-layout-panel-wrapper` div (line 110), add:
  ```tsx
  onMouseDown={() => onFocusedPathChange?.(path)}
  ```
- Add a `focused` CSS class when `focusedPath` matches the current `path`:
  ```tsx
  className={`split-layout-panel-wrapper${pathsEqual(focusedPath, path) ? ' focused' : ''}`}
  ```

### Step 4: Render zoomed or full tree

**File:** `src/SplitLayout.tsx` — `renderNode` function (line 79)

- At the top of `renderNode`, if `zoomedPath` is set, walk the tree to extract only the node at `zoomedPath`, then render just that node (full size, no splits):
  ```ts
  if (zoomedPath && zoomedPath.length > 0) {
    const zoomedNode = getNodeAtPath(tree.tree, zoomedPath);
    if (zoomedNode) return renderNode(zoomedNode);
  }
  ```
- Add helper `getNodeAtPath(node, path)` that recursively follows the path indices to return the target node

### Step 5: Add focused panel CSS indicator

**File:** `src/SplitLayout.css`

- Add a subtle border or outline for the focused panel:
  ```css
  .split-layout-panel-wrapper.focused {
    outline: 1px solid var(--accent-color);
    outline-offset: -1px;
  }
  ```

### Step 6: Add keyboard shortcut

**File:** `src/App.tsx` — `KeyboardShortcutsHandler` (line 282)

- Add to the `onKeyDown` handler:
  ```ts
  if (e.metaKey && e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    toggleZoomRef.current();
    return;
  }
  ```
- This fires after the existing modifier checks, before the `?` shortcut

### Step 7: Update shortcuts modal

**File:** `src/ShortcutsModal.tsx`

- Add a new group "Panels" or add to "General":
  ```ts
  {
    group: "Panels",
    shortcuts: [
      { keys: "⌘⇧↵", action: "Zoom focused panel" },
    ],
  }
  ```

### Step 8: Clear zoom on layout changes

**File:** `src/App.tsx` — `MainArea`

- When the workspace changes (tab switch, session change), clear `zoomedPath`:
  ```ts
  useEffect(() => { setZoomedPath(null); }, [activeWorkspace?.id]);
  ```

## Files Modified

| File | Change |
|---|---|
| `src/App.tsx` | Add focusedPath/zoomedPath state, ref for toggleZoom, pass props, add shortcut |
| `src/SplitLayout.tsx` | Accept focusedPath/zoomedPath props, onMouseDown tracking, zoomed rendering |
| `src/SplitLayout.css` | Add `.focused` outline style |
| `src/ShortcutsModal.tsx` | Document the new shortcut |

## Verification

1. Create a workspace with 2+ panels (right-click → Split Vertical/Horizontal)
2. Click a panel → it gets a blue outline (focused indicator)
3. Press `Cmd+Shift+Enter` → that panel fills the entire layout, other panels hidden
4. Press `Cmd+Shift+Enter` again → original splits restored
5. Click a different panel, press `Cmd+Shift+Enter` → different panel zooms
6. Switch workspace tabs → zoom clears, full layout restored
7. Press `?` → shortcuts modal shows the new "Zoom focused panel" entry
