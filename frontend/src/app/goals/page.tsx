import { redirect } from "next/navigation";

/**
 * The standalone Goals feature was client-only demo state and duplicated the
 * real profile target + Progress experience. Route old bookmarks to the single
 * source of truth instead of showing fabricated/session-only goals.
 */
export default function GoalsPage() {
  redirect("/progress");
}
