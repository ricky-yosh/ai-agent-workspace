import { useRef, useCallback, useEffect, type ReactNode, type KeyboardEvent, type FocusEvent } from "react";
import { AnimatePresence } from "motion/react";
import SearchBar from "../SearchBar";
import { Button } from "./Button";
import "./FilterableList.css";

export interface FilterableListRowHelpers {
  isFocused: boolean;
  onFocus: () => void;
  onBlur: (e: FocusEvent) => void;
  setCardRef: (el: HTMLDivElement | null) => void;
}

export interface FilterableListProps<T extends { id: string }> {
  items: T[];

  focusedIndex: number | null;
  onFocusedIndexChange: (index: number | null) => void;

  title?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;

  createLabel?: string;
  createKey?: string;
  onCreateClick?: () => void;

  /** Called for every keydown on the list container that isn't ArrowUp/Down/Home/End/Escape/createKey */
  onItemExtraKey?: (item: T, e: KeyboardEvent) => void;

  /** Total unfiltered count (for filter display like "3/10"). Defaults to items.length */
  totalCount?: number;
  /** Called when all AnimatePresence exit animations have completed */
  onExitComplete?: () => void;
  emptyMessage?: string;
  noMatchesMessage?: string;

  children: (item: T, index: number, helpers: FilterableListRowHelpers) => ReactNode;
}

const containerClass = "filterable-list__container";

export function FilterableList<T extends { id: string }>({
  items,
  focusedIndex,
  onFocusedIndexChange,
  title,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Filter… (press /)",
  createLabel,
  createKey,
  onCreateClick,
  onItemExtraKey,
  totalCount,
  onExitComplete,
  emptyMessage = "No items",
  noMatchesMessage = "No matching items",
  children,
}: FilterableListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearchMode = searchQuery !== undefined && onSearchChange !== undefined;

  const moveFocus = useCallback(
    (newIndex: number) => {
      onFocusedIndexChange(newIndex);
      rowRefs.current.get(newIndex)?.focus();
    },
    [onFocusedIndexChange],
  );

  const handleListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target === searchInputRef.current) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveFocus(focusedIndex === null ? 0 : Math.min(focusedIndex + 1, items.length - 1));
          return;
        case "ArrowUp":
          e.preventDefault();
          if (focusedIndex !== null && focusedIndex > 0) {
            moveFocus(focusedIndex - 1);
          } else {
            onFocusedIndexChange(null);
            searchInputRef.current?.focus();
          }
          return;
        case "Home":
          e.preventDefault();
          moveFocus(0);
          return;
        case "End":
          e.preventDefault();
          moveFocus(items.length - 1);
          return;
        case "Escape":
          onFocusedIndexChange(null);
          return;
      }

      if (createKey && onCreateClick && (e.key === createKey || e.key === createKey.toUpperCase())) {
        e.preventDefault();
        onCreateClick();
        return;
      }

      if (focusedIndex !== null && items[focusedIndex] && onItemExtraKey) {
        onItemExtraKey(items[focusedIndex], e);
      }
    },
    [focusedIndex, items, moveFocus, onFocusedIndexChange, createKey, onCreateClick, onItemExtraKey],
  );

  useEffect(() => {
    function onGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if (
        e.key === "/" &&
        listRef.current?.contains(document.activeElement) &&
        document.activeElement !== searchInputRef.current
      ) {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onGlobalKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (focusedIndex === null) return;
    rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  return (
    <div className="filterable-list">
      {(title || isSearchMode || createLabel) && (
        <div className="filterable-list__toolbar">
          {title && !isSearchMode ? (
            <div className="filterable-list__title">{title}</div>
          ) : isSearchMode ? (
            <div className="filterable-list__search-wrap">
              <SearchBar
                ref={searchInputRef}
                value={searchQuery}
                onChange={(v: string) => {
                  onSearchChange(v);
                  onFocusedIndexChange(null);
                }}
                placeholder={searchPlaceholder}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onSearchChange("");
                    onFocusedIndexChange(null);
                    rowRefs.current.get(0)?.focus();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (items.length > 0) moveFocus(0);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (items.length > 0) moveFocus(items.length - 1);
                  }
                }}
                onBlur={(e: FocusEvent<HTMLInputElement>) => {
                  if (!listRef.current?.contains(e.relatedTarget as Node)) {
                    onFocusedIndexChange(null);
                  }
                }}
                trailing={
                  searchQuery ? (
                    <>
                      <span className="filterable-list__count">
                        {items.length}/{totalCount ?? items.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onSearchChange("");
                          onFocusedIndexChange(null);
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear filter"
                      >
                        ✕
                      </Button>
                    </>
                  ) : null
                }
              />
            </div>
          ) : null}
          {createLabel && onCreateClick && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onCreateClick}
              title={`${createLabel}${createKey ? ` (${createKey})` : ""}`}
            >
              + {createLabel}
            </Button>
          )}
        </div>
      )}

      <div
        ref={listRef}
        tabIndex={0}
        className={containerClass}
        onKeyDown={handleListKeyDown}
        onFocus={(e) => {
          if (e.target === e.currentTarget && focusedIndex === null && items.length > 0) {
            moveFocus(0);
          }
        }}
      >
        {items.length === 0 ? (
          <div className="filterable-list__empty">
            {isSearchMode && searchQuery ? noMatchesMessage : emptyMessage}
          </div>
        ) : (
          <AnimatePresence mode="popLayout" onExitComplete={onExitComplete}>
            {items.map((item, idx) => {
              const isFocused = focusedIndex === idx;
              return children(item, idx, {
                isFocused,
                onFocus: () => onFocusedIndexChange(idx),
                onBlur: (e: FocusEvent) => {
                  if (!listRef.current?.contains(e.relatedTarget as Node)) {
                    onFocusedIndexChange(null);
                  }
                },
                setCardRef: (el) => {
                  if (el) rowRefs.current.set(idx, el);
                  else rowRefs.current.delete(idx);
                },
              }) as ReactNode;
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
