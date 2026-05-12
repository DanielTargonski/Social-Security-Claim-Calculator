import { useMemo, useState } from "react";

// Single useState bag for form fields plus auto-generated per-field setters
// (`setFraBenefit`, `setMode`, etc.) derived from the initial state's keys.
// Lets the orchestrator hold one state object — adding a field becomes a
// one-line change in the schema rather than a new useState + dep-array entry
// in App.jsx, the URL-mirror effect, and the projection memo.
//
// Setters accept either a value or an updater function, matching useState's
// API so callers can write `setClaimAge((c) => c + 1)`. The setters object's
// identity is stable for the component's lifetime, so passing individual
// setters as props doesn't churn child memoization.
export function useFormState(initialOrInit) {
  const [state, setState] = useState(initialOrInit);

  const setters = useMemo(() => {
    const result = {};
    for (const key of Object.keys(state)) {
      const setterName = "set" + key[0].toUpperCase() + key.slice(1);
      result[setterName] = (value) => {
        setState((prev) => ({
          ...prev,
          [key]: typeof value === "function" ? value(prev[key]) : value,
        }));
      };
    }
    return result;
    // Setters depend only on the field shape, which is fixed at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [state, setters, setState];
}
