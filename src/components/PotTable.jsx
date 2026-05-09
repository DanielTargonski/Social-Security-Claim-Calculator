import { fmtMoney, fmtBig } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";
import Var from "./Var.jsx";

// Five-year snapshot of the invested pot from claimAge through lifeExpectancy.
// Rows show pot value, 5-year growth delta, and which phase the claimant is
// in at that age (Contributing while age < investStopAge, Compounding after).
// Note the phase split is at investStopAge — the model invests checks until
// the user's chosen stop age, not at FRA. Earlier copy hardcoded "until age
// 67" which was wrong whenever investStopAge ≠ 67.
export default function PotTable({
  claimAge,
  lifeExpectancy,
  returnRate,
  investStopAge,
  chartData,
}) {
  return (
    <div
      className="mt-5 p-6 md:p-7"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
      }}
    >
      <h3 className="display text-xl mb-4" style={{ color: C.ink }}>
        <em>The pot, year by year</em>
      </h3>
      <p className="text-xs mb-5 max-w-2xl" style={{ color: C.inkSoft }}>
        Snapshot of the invested pot at five-year markers. Contributions run
        until age <Var>{investStopAge}</Var> using the after-tax check. After
        that the balance compounds untouched at{" "}
        <Var>{returnRate.toFixed(1)}%</Var> real.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full num text-sm" style={{ minWidth: "480px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th
                className="text-left py-2 text-xs uppercase font-normal"
                style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
              >
                Age
              </th>
              <th
                className="text-right py-2 text-xs uppercase font-normal"
                style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
              >
                Pot Value
              </th>
              <th
                className="text-right py-2 text-xs uppercase font-normal"
                style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
              >
                5-yr Growth
              </th>
              <th
                className="text-right py-2 text-xs uppercase font-normal"
                style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
              >
                Phase
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const rows = [];
              const startAge = Math.ceil(claimAge);
              let prev = 0;
              for (let a = startAge; a <= lifeExpectancy; a += 5) {
                const row = chartData.find((d) => d.age >= a);
                if (!row) continue;
                const growth = prev > 0 ? row.pot - prev : null;
                rows.push(
                  <tr
                    key={a}
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td
                      className="py-3"
                      style={{ color: C.ink, fontWeight: 500 }}
                    >
                      {Math.round(row.age)}
                    </td>
                    <td
                      className="py-3 text-right"
                      style={{ color: C.early, fontWeight: 500 }}
                    >
                      {fmtMoney(row.pot)}
                    </td>
                    <td
                      className="py-3 text-right"
                      style={{ color: C.inkSoft }}
                    >
                      {growth !== null
                        ? (growth >= 0 ? "+" : "") + fmtBig(growth)
                        : "—"}
                    </td>
                    <td
                      className="py-3 text-right text-xs"
                      style={{ color: C.inkFaint }}
                    >
                      {row.age < investStopAge ? "Contributing" : "Compounding"}
                    </td>
                  </tr>
                );
                prev = row.pot;
              }
              return rows;
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
