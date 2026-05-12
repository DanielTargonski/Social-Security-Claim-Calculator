import { useEffect } from "react";
import { serializeStateToParams } from "../lib/shareableState.js";

// Mirror form state into the URL on every change via replaceState (no
// history entries — the back button shouldn't undo individual slider drags).
// Skips the write when the new query string matches what's already in the
// bar to avoid noisy navigation events.
//
// Pair with useFormState: callers pass the single state bag and never
// touch window.history themselves.
export function useUrlSync(state) {
  useEffect(() => {
    const params = serializeStateToParams(state);
    const newSearch = "?" + params.toString();
    if (window.location.search !== newSearch) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + newSearch + window.location.hash
      );
    }
  }, [state]);
}
