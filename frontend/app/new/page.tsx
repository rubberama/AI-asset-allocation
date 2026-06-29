import { Workspace } from "../Workspace";

// New-user perspective: empty right panel until the user enters a view; Chris greets
// and guides toward the Macro / Intelligence / Research tabs first.
export default function NewPage() {
  return <Workspace mode="new" />;
}
