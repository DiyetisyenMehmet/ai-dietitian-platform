"use client";
import * as React from "react";

type Axis = "x" | "y";
interface Options<T extends string> {
  group: string;
  axis: Axis;
  ids: readonly T[];
  disabled?: boolean;
  onPreview: (ids: T[]) => void;
  onCommit: (ids: T[]) => void | Promise<unknown>;
}
interface Gesture<T> {
  id: T;
  pointer: number;
  touch: boolean;
  armed: boolean;
  active: boolean;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  origin: DOMRect;
  order: T[];
  centers: number[];
  element: HTMLElement;
  releaseScroll?: () => void;
}
const TOUCH_HOLD_MS = 170;
const ACTIVATION_DISTANCE = 5;
const TOUCH_SCROLL_TOLERANCE = 8;
const SETTLE_MS = 220;

export function useDashboardInlineReorder<T extends string>({
  group,
  axis,
  ids,
  disabled = false,
  onPreview,
  onCommit,
}: Options<T>) {
  const idsRef = React.useRef<T[]>([...ids]);
  const gesture = React.useRef<Gesture<T> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxes = React.useRef(new Map<T, DOMRect>());
  const lastLayoutOrder = React.useRef(ids.join("|"));
  const animations = React.useRef(new Map<HTMLElement, Animation>());
  const [draggingId, setDraggingId] = React.useState<T | null>(null);
  const callbacks = React.useRef({ onPreview, onCommit });
  callbacks.current = { onPreview, onCommit };
  const elements = React.useCallback(
    () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-personalize-group="${group}"][data-personalize-item]`,
        ),
      ),
    [group],
  );
  const animate = React.useCallback((element: HTMLElement, dx: number, dy: number) => {
    animations.current.get(element)?.cancel();
    animations.current.delete(element);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.animate(
      [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
      { duration: SETTLE_MS, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    animations.current.set(element, animation);
    animation.onfinish = () => {
      if (animations.current.get(element) === animation) animations.current.delete(element);
    };
  }, []);
  const positionActive = React.useCallback(() => {
    const current = gesture.current;
    if (!current?.active) return;
    const { element, origin } = current;
    element.style.transform = "";
    const layout = element.getBoundingClientRect();
    const dx = axis === "x" ? current.lastX - current.x + origin.left - layout.left : 0;
    const dy = axis === "y" ? current.lastY - current.y + origin.top - layout.top : 0;
    element.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.008)`;
  }, [axis]);
  React.useLayoutEffect(() => {
    const order = ids.join("|");
    const changedOrder = lastLayoutOrder.current !== order;
    lastLayoutOrder.current = order;
    for (const node of elements()) {
      const id = node.dataset.personalizeItem as T;
      if (id === gesture.current?.id && gesture.current.active) continue;
      const old = boxes.current.get(id);
      const running = animations.current.get(node);
      const visual = node.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const next = new DOMRect(
        visual.left - matrix.m41 + window.scrollX,
        visual.top - matrix.m42 + window.scrollY,
        node.offsetWidth,
        node.offsetHeight,
      );
      if (disabled && running) {
        running.cancel();
        animations.current.delete(node);
      }
      // Scroll and responsive layout changes are not reorders. Store document
      // coordinates so a real reorder never includes the page's scroll offset.
      if (
        !disabled &&
        changedOrder &&
        old &&
        (Math.abs(old.left - next.left) > 1 || Math.abs(old.top - next.top) > 1)
      ) {
        animate(
          node,
          (running ? visual.left + window.scrollX : old.left) - next.left,
          (running ? visual.top + window.scrollY : old.top) - next.top,
        );
      }
      boxes.current.set(id, next);
    }
    if (!gesture.current) idsRef.current = [...ids];
    positionActive();
  }, [ids, disabled, animate, elements, positionActive]);
  const finish = React.useCallback(
    (commit: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const current = gesture.current;
      gesture.current = null;
      if (!current) return;
      current.releaseScroll?.();
      if (current.active) {
        const visual = current.element.getBoundingClientRect();
        current.element.style.transform = "";
        const layout = current.element.getBoundingClientRect();
        animate(current.element, visual.left - layout.left, visual.top - layout.top);
        setDraggingId(null);
        if (!commit) {
          idsRef.current = [...current.order];
          callbacks.current.onPreview([...current.order]);
        } else if (current.order.join("|") !== idsRef.current.join("|")) {
          void callbacks.current.onCommit([...idsRef.current]);
        }
      }
    },
    [animate],
  );
  const move = React.useCallback(
    (x: number, y: number): boolean => {
      const current = gesture.current;
      if (!current) return false;
      const distance = Math.hypot(x - current.x, y - current.y);
      if (!current.active) {
        if (current.touch && !current.armed) {
          if (distance > TOUCH_SCROLL_TOLERANCE) finish(false);
          return false;
        }
        if (distance < ACTIVATION_DISTANCE) return current.touch && current.armed;
        current.active = true;
        animations.current.get(current.element)?.cancel();
        setDraggingId(current.id);
      }
      current.lastX = x;
      current.lastY = y;
      positionActive();
      // Fixed slot midpoints avoid edge-triggered swaps and oscillation.
      const center =
        axis === "x"
          ? current.origin.left + current.origin.width / 2 + x - current.x
          : current.origin.top + current.origin.height / 2 + y - current.y;
      let targetIndex = idsRef.current.indexOf(current.id);
      while (targetIndex < current.centers.length - 1 && center > current.centers[targetIndex + 1])
        targetIndex++;
      while (targetIndex > 0 && center < current.centers[targetIndex - 1]) targetIndex--;
      const next = current.order.filter((id) => id !== current.id);
      next.splice(targetIndex, 0, current.id);
      if (next.join("|") !== idsRef.current.join("|")) {
        idsRef.current = next;
        callbacks.current.onPreview(next);
      }
      return true;
    },
    [axis, finish, positionActive],
  );
  React.useEffect(() => {
    const runningAnimations = animations.current;
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) finish(false);
    };
    const pointerMove = (event: PointerEvent) => {
      if (gesture.current?.touch || event.pointerId !== gesture.current?.pointer) return;
      if (move(event.clientX, event.clientY)) event.preventDefault();
    };
    const pointerEnd = (event: PointerEvent) => {
      if (!gesture.current?.touch && event.pointerId === gesture.current?.pointer)
        finish(event.type === "pointerup");
    };
    const touchMove = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current?.touch) return;
      if (event.touches.length !== 1) {
        finish(false);
        return;
      }
      const touch = Array.from(event.touches).find((item) => item.identifier === current.pointer);
      if (touch && move(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
    };
    const touchEnd = (event: TouchEvent) => {
      if (gesture.current?.touch) finish(event.type === "touchend");
    };
    const cancel = () => finish(false);
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerEnd);
    window.addEventListener("pointercancel", pointerEnd);
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd);
    window.addEventListener("touchcancel", touchEnd);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerEnd);
      window.removeEventListener("pointercancel", pointerEnd);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
      window.removeEventListener("blur", cancel);
      if (timer.current) clearTimeout(timer.current);
      gesture.current?.releaseScroll?.();
      gesture.current?.element.style.removeProperty("transform");
      runningAnimations.forEach((animation) => animation.cancel());
    };
  }, [finish, move]);
  React.useEffect(() => {
    if (disabled) finish(false);
  }, [disabled, finish]);
  const start = React.useCallback(
    (element: HTMLElement, id: T, x: number, y: number, pointer: number, touch: boolean) => {
      if (disabled || gesture.current || idsRef.current.length < 2) return;
      const nodes = elements();
      const rects = nodes.map((node) => node.getBoundingClientRect());
      boxes.current = new Map(
        nodes.map((node, index) => [
          node.dataset.personalizeItem as T,
          new DOMRect(
            rects[index].left + window.scrollX,
            rects[index].top + window.scrollY,
            rects[index].width,
            rects[index].height,
          ),
        ]),
      );
      gesture.current = {
        id,
        pointer,
        touch,
        armed: !touch,
        active: false,
        x,
        y,
        lastX: x,
        lastY: y,
        element,
        origin: element.getBoundingClientRect(),
        order: [...idsRef.current],
        centers: rects.map((rect) =>
          axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2,
        ),
      };
      if (touch)
        timer.current = setTimeout(() => {
          const current = gesture.current;
          if (!current) return;
          current.armed = true;
          current.active = true;
          // A touch that interrupts a fling may already be uncancelable. Lock
          // native viewport panning only after the intentional stationary hold.
          // Immediate swipes cancel before this timer and keep native scrolling.
          const viewport = document.documentElement;
          const overflow = viewport.style.getPropertyValue("overflow");
          const priority = viewport.style.getPropertyPriority("overflow");
          viewport.style.setProperty("overflow", "hidden");
          current.releaseScroll = () => {
            if (overflow) viewport.style.setProperty("overflow", overflow, priority);
            else viewport.style.removeProperty("overflow");
          };
          animations.current.get(current.element)?.cancel();
          animations.current.delete(current.element);
          setDraggingId(current.id);
          positionActive();
        }, TOUCH_HOLD_MS);
    },
    [axis, disabled, elements, positionActive],
  );
  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>, id: T) => {
      if (event.pointerType === "touch" || event.button !== 0 || !event.isPrimary) return;
      start(event.currentTarget, id, event.clientX, event.clientY, event.pointerId, false);
    },
    [start],
  );
  const onTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLElement>, id: T) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      start(event.currentTarget, id, touch.clientX, touch.clientY, touch.identifier, true);
    },
    [start],
  );
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, id: T) => {
      if (disabled || gesture.current) return;
      const previousKey = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const nextKey = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (event.key !== previousKey && event.key !== nextKey) return;
      event.preventDefault();
      const next = [...idsRef.current];
      const index = next.indexOf(id);
      const target = index + (event.key === previousKey ? -1 : 1);
      if (index < 0 || target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      idsRef.current = next;
      callbacks.current.onPreview(next);
      void callbacks.current.onCommit(next);
    },
    [axis, disabled],
  );
  return { draggingId, onPointerDown, onTouchStart, onKeyDown };
}
