import { redirect } from "next/navigation";

/** Weight and daily targets are edited from the persisted health profile. */
export default function NewGoalPage() {
  redirect("/profile/edit");
}
