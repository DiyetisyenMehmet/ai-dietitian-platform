"use client";

import * as React from "react";

type Axis = "x" | "y";
type KeyboardDirection = "previous" | "next";

interface UseDashboardInlineReorderOptions<T extends string> {
  group: string;
  axis: Axis;
  ids: readonly T[];
  disabled?: boolean;
  onPreview: (ids: T[]) => void;
  onCommit: (ids: T[]) => void | Promise<unknown>;
}

export function useDashboardInlineReorder<T extends string>({
  group,
  axis,
  ids,
  disabled = false,
  onPreview,
  onCommit,
}: UseDashboardInlineReorderOptions<T>) {
  const idsRef = React.useRef<T[]>([...ids]);
  const startOrderRef = React.useRef<T[] | null>(null);
  const activeIdRef = React.useRef<T | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const [draggingId, setDraggingId] = React.useState<T | null>(null);

  React.useEffect(() => {
    if (!activeIdRef.current) idsRef.current = [...ids];
  }, [ids]);

  const previewAt = React.useCallback(
    (clientX: number, clientY: number) => {
      const activeId = activeIdRef.current;
      if (!activeId) return;

      const target = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>(
          `[data-personalize-group="${group}"][data-personalize-item]`,
        );
      const targetId = target?.dataset.personalizeItem as T | undefined;
      if (!target || !targetId || targetId === activeId || !idsRef.current.includes(targetId)) {
        return;
      }

      const sourceIndex = idsRef.current.indexOf(activeId);
      const targetIndex = idsRef.current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;

      const box = target.getBoundingClientRect();
      const after =
        axis === "x"
          ? clientX > box.left + box.width / 2
          : clientY > box.top + box.height / 2;
      let insertionIndex = targetIndex + (after ? 1 : 0);
      const next = [...idsRef.current];
      next.splice(sourceIndex, 1);
      if (sourceIndex < insertionIndex) insertionIndex -= 1;
      insertionIndex = Math.max(0, Math.min(insertionIndex, next.length));
      next.splice(insertionIndex, 0, activeId);

      if (next.join("|") === idsRef.current.join("|")) return;
      idsRef.current = next;
      onPreview(next);
    },
    [axis, group, onPreview],
  );

  const finish = React.useCallback(
    (commit: boolean) => {
      if (!activeIdRef.current) return;
      const start = startOrderRef.current;
      const next = [...idsRef.current];

      activeIdRef.current = null;
      pointerIdRef.current = null;
      startOrderRef.current = null;
      setDraggingId(null);

      if (!commit) {
        if (start) {
          idsRef.current = [...start];
          onPreview([...start]);
        }
        return;
      }

      if (start && start.join("|") !== next.join("|")) {
        void onCommit(next);
      }
    },
    [onCommit, onPreview],
  );

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (pointerIdRef.current === null || event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      previewAt(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (pointerIdRef.current === null || event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      finish(true);
    };
    const onCancel = (event: PointerEvent) => {
      if (pointerIdRef.current === null || event.pointerId !== pointerIdRef.current) return;
      finish(false);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onCancel, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [finish, previewAt]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, id: T) => {
      if (disabled || activeIdRef.current || idsRef.current.length < 2) return;
      event.preventDefault();
      activeIdRef.current = id;
      pointerIdRef.current = event.pointerId;
      startOrderRef.current = [...idsRef.current];
      setDraggingId(id);
    },
    [disabled],
  );

  const moveByKeyboard = React.useCallback(
    (id: T, direction: KeyboardDirection) => {
      if (disabled) return;
      const current = [...idsRef.current];
      const index = current.indexOf(id);
      const target = direction === "previous" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= current.length) return;
      [current[index], current[target]] = [current[target], current[index]];
      idsRef.current = current;
      onPreview(current);
      void onCommit(current);
    },
    [disabled, onCommit, onPreview],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, id: T) => {
      const previousKey = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const nextKey = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (event.key === previousKey) {
        event.preventDefault();
        moveByKeyboard(id, "previous");
      } else if (event.key === nextKey) {
        event.preventDefault();
        moveByKeyboard(id, "next");
      }
    },
    [axis, moveByKeyboard],
  );

  return {
    draggingId,
    onPointerDown,
    onKeyDown,
  };
}
