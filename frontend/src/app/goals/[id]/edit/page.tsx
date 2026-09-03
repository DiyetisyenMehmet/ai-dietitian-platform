import { redirect } from "next/navigation";

/** Persisted weight/water targets are edited in the health profile. */
export default function EditGoalPage() {
  redirect("/profile/edit");
}
