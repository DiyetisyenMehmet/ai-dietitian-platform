import { redirect } from "next/navigation";

/** Legacy client-only goal detail now resolves to the persisted Progress view. */
export default function GoalDetailPage() {
  redirect("/progress");
}
