import { authStore } from "@/application/auth/auth-store";
import { apiStream } from "@/infrastructure/api/http-client";
import { chatStore } from "./chat-store";

let dataOwner: string | null = null;

type Change = { type: string; conversationId: string; version: string };
const TYPES = new Set(["created", "turn", "renamed", "pinned", "deleted"]);

/** Bounded SSE decoder uses getReader(), supported by Safari/WebKit as well as Chromium. */
export async function readCoachEvents(
  response: Response,
  signal: AbortSignal,
  receive: (type: string, data: unknown) => void,
): Promise<void> {
  if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("Invalid Coach stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  let idle = setTimeout(cancel, 60000);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(idle);
      idle = setTimeout(cancel, 60000);
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      if (buffer.length > 65536) throw new Error("Coach stream frame too large");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = frame.split("\n");
        const type = lines
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (type && data && !signal.aborted) receive(type, JSON.parse(data));
      }
    }
  } finally {
    clearTimeout(idle);
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** One coordinator per mounted Coach. No conversation timers in live mode. */
export function mountCoachSync(): () => void {
  let nativeSuspended = false;
  let disposed = false,
    suspended = document.visibilityState !== "visible",
    online = navigator.onLine;
  let owner: string | null = null,
    lastVersion: bigint | null = null;
  let controller: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let legacy: ReturnType<typeof setInterval> | undefined;
  let failures = 0,
    epoch = 0,
    fullSnapshot = false,
    draining = false;
  const pending = new Map<string, Change>();
  const active = () =>
    !disposed &&
    !suspended &&
    !nativeSuspended &&
    document.visibilityState === "visible" &&
    online &&
    !!owner;
  const stop = () => {
    epoch += 1;
    controller?.abort();
    controller = null;
    clearTimeout(retry);
    retry = undefined;
    clearInterval(legacy);
    legacy = undefined;
  };
  const drain = async () => {
    if (draining || !active() || chatStore.isBusy()) return;
    draining = true;
    const generation = epoch;
    try {
      if (fullSnapshot) {
        fullSnapshot = false;
        if (!(await chatStore.syncSnapshot()) && generation === epoch) fullSnapshot = true;
      }
      while (
        !fullSnapshot &&
        pending.size &&
        active() &&
        generation === epoch &&
        !chatStore.isBusy()
      ) {
        const [id, change] = pending.entries().next().value!;
        if (!(await chatStore.syncConversation(change, controller?.signal))) {
          fullSnapshot = true;
          break;
        }
        if (generation !== epoch) break;
        if (pending.get(id) === change) pending.delete(id);
      }
    } finally {
      draining = false;
      if (generation === epoch && active()) {
        if (fullSnapshot) controller?.abort();
        else failures = 0;
      }
    }
  };
  const receive = (type: string, raw: unknown) => {
    if (!active() || !raw || typeof raw !== "object") return;
    const event = raw as Partial<Change>;
    if (typeof event.version !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(event.version)) return;
    const version = BigInt(event.version);
    if (type === "ready" || type === "revision") {
      if (type === "revision" && lastVersion !== null && version <= lastVersion) return;
      if (lastVersion !== version) fullSnapshot = true;
      // Don't move backwards if a notification beat the snapshot.
      lastVersion = lastVersion === null || version > lastVersion ? version : lastVersion;
      void drain();
      return;
    }
    if (
      type !== "changed" ||
      !TYPES.has(event.type ?? "") ||
      typeof event.conversationId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(event.conversationId)
    )
      return;
    if (lastVersion !== null && version <= lastVersion) return;
    if (lastVersion === null || version !== lastVersion + BigInt(1)) fullSnapshot = true;
    lastVersion = version;
    const previous = pending.get(event.conversationId);
    const contentChanged = previous?.type === "turn" || previous?.type === "created";
    // Coalescing a later title/pin change must not discard an earlier message
    // invalidation while a local reply or snapshot is still in progress.
    pending.set(event.conversationId, {
      conversationId: event.conversationId,
      version: event.version,
      type: contentChanged && event.type !== "deleted" ? "turn" : event.type!,
    });
    if (pending.size > 100) {
      pending.clear();
      fullSnapshot = true;
    }
    void drain();
  };
  const connect = async () => {
    if (!active() || controller || legacy || retry) return;
    const current = new AbortController();
    controller = current;
    const openingDeadline = setTimeout(() => current.abort(), 10000);
    const generation = epoch;
    try {
      const response = await apiStream({
        path: "/ai-chat/events",
        auth: true,
        cache: "no-store",
        signal: current.signal,
      });
      clearTimeout(openingDeadline);
      if (!active() || generation !== epoch) {
        await response.body?.cancel();
        return;
      }
      if (response.status === 409 || response.status === 503) {
        const payload = await response.json();
        if (
          !(
            (response.status === 409 && payload?.error?.code === "COACH_SYNC_DISABLED") ||
            (response.status === 503 && payload?.error?.code === "COACH_SYNC_UNAVAILABLE")
          )
        )
          throw new Error("Stream refused");
        // Explicit disabled/transport-unavailable responses only; auth/network errors never select P1.
        void chatStore.refresh();
        legacy = setInterval(() => {
          if (active()) void chatStore.refresh();
        }, 5000);
        return;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Stream unavailable");
      }
      await readCoachEvents(response, current.signal, receive);
    } catch {
      /* Offline/live failure never prevents normal saved-history API access. */
    } finally {
      clearTimeout(openingDeadline);
      if (controller === current) controller = null;
      if (active() && generation === epoch && !legacy) {
        const delay =
          Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)) + Math.floor(Math.random() * 250);
        retry = setTimeout(() => {
          retry = undefined;
          void connect();
        }, delay);
      }
    }
  };
  const reconcile = () => {
    const session = authStore.getSnapshot();
    const nextOwner = session.status === "authenticated" ? (session.user?.id ?? null) : null;
    if (nextOwner !== owner) {
      stop();
      pending.clear();
      lastVersion = null;
      fullSnapshot = false;
      owner = nextOwner;
      failures = 0;
      if (dataOwner !== nextOwner) {
        dataOwner = nextOwner;
        chatStore.resetSession();
      }
      // Entry must load current history even when the live endpoint is unavailable.
      if (active()) void chatStore.initialize(true);
    }
    if (active()) void connect();
    else stop();
  };
  const visibility = () => {
    const wasSuspended = suspended;
    suspended = document.visibilityState !== "visible";
    if (wasSuspended && !suspended) fullSnapshot = true;
    reconcile();
    void drain();
  };
  const nativeState = (event: Event) => {
    nativeSuspended = !(event as CustomEvent<{ active: boolean }>).detail?.active;
    if (!nativeSuspended) fullSnapshot = true;
    reconcile();
    void drain();
  };
  const pageHide = () => {
    suspended = true;
    stop();
  };
  const pageShow = () => {
    suspended = document.visibilityState !== "visible";
    fullSnapshot = true;
    reconcile();
    void drain();
  };
  const offline = () => {
    online = false;
    stop();
  };
  const onOnline = () => {
    online = true;
    fullSnapshot = true;
    failures = 0;
    reconcile();
    void drain();
  };
  const authUnsubscribe = authStore.subscribe(reconcile);
  const chatUnsubscribe = chatStore.subscribe(() => {
    if (pending.size || fullSnapshot) queueMicrotask(() => void drain());
  });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("diewish:app-visibility", nativeState);
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  window.addEventListener("offline", offline);
  window.addEventListener("online", onOnline);
  reconcile();
  return () => {
    disposed = true;
    stop();
    pending.clear();
    authUnsubscribe();
    chatUnsubscribe();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("diewish:app-visibility", nativeState);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
    window.removeEventListener("offline", offline);
    window.removeEventListener("online", onOnline);
  };
}
