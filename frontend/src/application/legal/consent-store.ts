"use client";

import * as React from "react";

import { legalClient } from "@/infrastructure/legal/legal-client";
import type {
  ConsentStatusView,
  LegalDocumentSummary,
  LegalDocumentType,
  LegalDocumentView,
} from "@/domain/legal/types";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface ConsentState {
  ownerId: string | null;
  status: LoadStatus;
  consent: ConsentStatusView | null;
  documents: LegalDocumentSummary[];
  error: string | null;
}

const EMPTY: ConsentState = {
  ownerId: null,
  status: "idle",
  consent: null,
  documents: [],
  error: null,
};

let state: ConsentState = { ...EMPTY };
let inFlight: Promise<void> | null = null;
let inFlightOwner: string | null = null;
const listeners = new Set<() => void>();

function emit(next: ConsentState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export const consentStore = {
  getSnapshot,

  /** Loads the current account's consent status and document metadata once. */
  hydrate(userId: string, force = false): Promise<void> {
    if (!force && state.ownerId === userId && state.status === "ready") {
      return Promise.resolve();
    }
    if (!force && inFlight && inFlightOwner === userId) return inFlight;

    if (state.ownerId !== userId) {
      emit({ ...EMPTY, ownerId: userId, status: "loading" });
    } else {
      emit({ ...state, status: "loading", error: null });
    }

    inFlightOwner = userId;
    inFlight = Promise.all([legalClient.getConsents(), legalClient.listDocuments()])
      .then(([consent, docs]) => {
        if (state.ownerId !== userId) return;
        emit({
          ownerId: userId,
          status: "ready",
          consent,
          documents: docs.documents,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (state.ownerId !== userId) return;
        emit({
          ...state,
          status: "error",
          error: error instanceof Error ? error.message : "Yasal onay durumu alınamadı.",
        });
      })
      .finally(() => {
        if (inFlightOwner === userId) {
          inFlight = null;
          inFlightOwner = null;
        }
      });

    return inFlight;
  },

  /**
   * Grants the individually selected documents and refreshes server truth once.
   * Each consent remains its own auditable backend record; the calls may succeed
   * independently, so a partial network failure never fabricates an all-granted
   * client state.
   */
  async grantMany(userId: string, types: LegalDocumentType[]): Promise<void> {
    const unique = [...new Set(types)];
    await Promise.all(unique.map((type) => legalClient.grantConsent(type)));
    await this.hydrate(userId, true);
  },

  /**
   * Withdraws one consent as a versioned backend record, then refreshes the
   * authoritative consent snapshot. No health data is deleted implicitly; the
   * withdrawal controls future processing and the user retains separate access
   * to existing-data/account deletion controls.
   */
  async withdraw(userId: string, type: LegalDocumentType): Promise<void> {
    await legalClient.withdrawConsent(type);
    await this.hydrate(userId, true);
  },

  loadDocument(type: LegalDocumentType): Promise<LegalDocumentView> {
    return legalClient.getDocument(type);
  },

  clear() {
    inFlight = null;
    inFlightOwner = null;
    emit({ ...EMPTY });
  },
};

export function useConsentState(): ConsentState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
