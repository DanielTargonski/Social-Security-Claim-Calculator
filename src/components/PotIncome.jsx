import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { fmtMoney, fmtBig, fmtAge, fmtAxisTick } from "../lib/benefitMath.js";
import { computePotIncome } from "../lib/potIncome.js";
import { C } from "../constants/colors.js";
import SliderInput from "./SliderInput.jsx";
import Var from "./Var.jsx";

// One scenario's monthly income as a stacked bar: the Social Security check
// plus the pot draw, scaled against the larger of the two scenarios.
function IncomeBar({ label, check, draw, total, scale, checkColor, drawColor }) {
  const pct = (v) => `${scale > 0 ? (v / scale) * 100 : 0}%`;
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1 gap-3">
        <span style={{ color: C.ink, fontWeight: 600 }}>{label}</span>
        <span className="num" style={{ color: C.ink, fontWeight: 600 }}>
          {fmtMoney(total)}/mo
        </span>
      </div>
      <div
        className="flex"
        style={{
          height: "14px",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
          backgroundColor: C.track,
        }}
      >
        <div style={{ width: pct(check), backgroundColor: checkColor }} />
        <div style={{ width: pct(draw), backgroundColor: drawColor }} />
      </div>
      <div className="text-xs num mt-1" style={{ color: C.inkSoft }}>
        {fmtMoney(check)} check
        {draw > 0 ? ` + ${fmtMoney(draw)} drawn` : ""}
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub }) {
  return (
    <div className="card-flat p-4">
      <div
        className="text-xs uppercase mb-1"
        style={{ color: C.inkFaint, letterSpacing: "0.1em", fontWeight: 600 }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{ color, fontSize: "1.5rem", fontWeight: 500 }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// "The pot as a paycheck": the income view of the invested pot. The main chart
// lets the pot compound untouched after investStopAge and scores total dollars
// in hand; this panel instead draws a fixed, inflation-adjusted income from the
// pot (the classic 4% rule) and compares monthly income — early check + pot
// draw vs the wait check — while showing how much of the pot is still left.
// Display-only: nothing here feeds back into the main projection.
export default function PotIncome({
  claimAge,
  investStopAge,
  lifeExpectancy,
  returnRate,
  withdrawalRate,
  onWithdrawalRateChange,
  chartData,
  earlyPostFRAMonthlyNet,
  earlyPostFRAMonthlyNetRetired,
  fraMonthlyNet,
  fraMonthlyNetRetired,
  postFRAWorkEndAge,
}) {
  const res = useMemo(
    () =>
      computePotIncome({
        chartData,
        investStopAge,
        lifeExpectancy,
        returnRate,
        withdrawalRate,
        earlyPostFRAMonthlyNet,
        earlyPostFRAMonthlyNetRetired,
        fraMonthlyNet,
        fraMonthlyNetRetired,
        postFRAWorkEndAge,
      }),
    [
      chartData,
      investStopAge,
      lifeExpectancy,
      returnRate,
      withdrawalRate,
      earlyPostFRAMonthlyNet,
      earlyPostFRAMonthlyNetRetired,
      fraMonthlyNet,
      fraMonthlyNetRetired,
      postFRAWorkEndAge,
    ]
  );

  // At a 0% real return nothing is invested, so the copy says "set-aside
  // checks" (plural) instead of "pot" — same convention as the main chart.
  const invested = returnRate > 0;
  const potWord = invested ? "pot" : "set-aside checks";
  const verb = (singular, plural) => (invested ? singular : plural);
  const earlyLabel = `Claim at ${fmtAge(claimAge)}`;
  const hasWaitPot = res.wait.startPot > 0;
  const { early, wait } = res;
  const scale = Math.max(res.earlyIncome, res.waitIncome);
  const ahead = res.incomeAdvantage >= 0;

  return (
    <div className="card mt-5 p-6 md:p-7">
      <h3 className="display text-xl mb-2" style={{ color: C.ink }}>
        <em>The pot as a paycheck</em>
      </h3>
      <p className="text-xs mb-5 max-w-2xl" style={{ color: C.inkSoft }}>
        The chart above lets the {potWord} sit untouched. Here it pays you
        instead: from age <Var>{fmtAge(res.startAge)}</Var>, withdraw{" "}
        <Var>{withdrawalRate.toFixed(1)}%</Var> of the balance in the first
        year, then the same inflation-adjusted amount every year after (the
        classic 4% rule). Like Social Security, that income keeps pace with
        inflation
        {invested
          ? ", and the pot can keep growing underneath it."
          : ". At a 0% real return nothing grows, so the draw simply spends the set-aside checks down."}
      </p>

      <div className="max-w-sm mb-6">
        <SliderInput
          label="Withdrawal rate"
          value={withdrawalRate}
          onChange={onWithdrawalRateChange}
          min={2}
          max={8}
          step={0.1}
          format={(v) => `${v.toFixed(1)}%/yr`}
          hint={`${fmtMoney(early.monthlyDraw)}/mo from ${
            invested
              ? `a ${fmtBig(early.startPot)} pot`
              : `${fmtBig(early.startPot)} set aside`
          }`}
        />
      </div>

      {early.startPot <= 0 ? (
        <p className="text-sm" style={{ color: C.inkSoft }}>
          Nothing is {invested ? "invested" : "set aside"} in this setup, so
          there is nothing to draw from. Raise the invest % or move the
          invest-stop age later than the claim age.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="flex flex-col gap-4">
              <div
                className="text-xs uppercase"
                style={{
                  color: C.inkFaint,
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                }}
              >
                Monthly income from age {fmtAge(res.incomeAge)}
              </div>
              <IncomeBar
                label={earlyLabel}
                check={res.earlyCheck}
                draw={res.earlyDraw}
                total={res.earlyIncome}
                scale={scale}
                checkColor={C.early}
                drawColor={C.earlySoft}
              />
              <IncomeBar
                label={hasWaitPot ? "Wait + invest" : "Wait until 67"}
                check={res.waitCheck}
                draw={res.waitDraw}
                total={res.waitIncome}
                scale={scale}
                checkColor={C.wait}
                drawColor={C.waitInvested}
              />
              <p className="text-sm" style={{ color: C.ink }}>
                {ahead ? (
                  <>
                    Claiming at {fmtAge(claimAge)} and drawing from the{" "}
                    {potWord} pays{" "}
                    <strong style={{ color: C.early }}>
                      {fmtMoney(res.incomeAdvantage)}/mo more
                    </strong>{" "}
                    than waiting.
                  </>
                ) : (
                  <>
                    Waiting still pays{" "}
                    <strong style={{ color: C.wait }}>
                      {fmtMoney(-res.incomeAdvantage)}/mo more
                    </strong>
                    , even with the draw.
                  </>
                )}{" "}
                {early.depletionAge == null ? (
                  <>
                    At {returnRate.toFixed(1)}% real, the {potWord} never{" "}
                    {verb("runs", "run")} out.
                  </>
                ) : early.depletionAge <= lifeExpectancy ? (
                  <>
                    The {potWord} {verb("runs", "run")} dry at{" "}
                    {fmtAge(early.depletionAge)}, after which only the check is
                    left.
                  </>
                ) : (
                  <>
                    The {potWord} {verb("lasts", "last")} until{" "}
                    {fmtAge(early.depletionAge)}, past {fmtAge(lifeExpectancy)}.
                  </>
                )}
              </p>
            </div>

            <div style={{ height: "260px", marginLeft: "-10px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={res.rows}
                  margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                >
                  <CartesianGrid
                    stroke={C.border}
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="age"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    stroke={C.inkSoft}
                    tick={{
                      fontSize: 11,
                      fontFamily: "JetBrains Mono",
                      fill: C.inkSoft,
                    }}
                    tickFormatter={(v) => Math.round(v)}
                    allowDecimals={false}
                    tickCount={6}
                  />
                  <YAxis
                    stroke={C.inkSoft}
                    tick={{
                      fontSize: 11,
                      fontFamily: "JetBrains Mono",
                      fill: C.inkSoft,
                    }}
                    tickFormatter={fmtAxisTick}
                  />
                  <Tooltip
                    cursor={{ stroke: C.borderDark, strokeDasharray: "3 3" }}
                    contentStyle={{
                      backgroundColor: C.paper,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      boxShadow: "var(--shadow-md)",
                      fontFamily: "JetBrains Mono",
                      fontSize: 12,
                      padding: "10px 12px",
                    }}
                    labelStyle={{ color: C.ink, fontWeight: 600, marginBottom: 4 }}
                    labelFormatter={(v) => `Age ${fmtAge(Number(v))}`}
                    formatter={(value, name) => [
                      fmtMoney(value),
                      name === "pot"
                        ? `${earlyLabel} · ${potWord}`
                        : `Wait + invest · ${potWord}`,
                    ]}
                  />
                  <ReferenceLine
                    x={res.startAge}
                    stroke={C.inkFaint}
                    strokeDasharray="3 3"
                    label={{
                      value: "Draws begin",
                      fill: C.inkFaint,
                      fontSize: 10,
                      fontFamily: "JetBrains Mono",
                      position: "top",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pot"
                    stroke={C.early}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {hasWaitPot && (
                    <Line
                      type="monotone"
                      dataKey="waitPot"
                      stroke={C.waitInvested}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label={`Pot at ${fmtAge(res.startAge)}`}
              value={fmtBig(early.startPot)}
              color={C.earlySoft}
            />
            <Stat
              label={`${withdrawalRate.toFixed(1)}% draw`}
              value={`${fmtMoney(early.monthlyDraw)}/mo`}
              color={C.early}
              sub="inflation-adjusted"
            />
            <Stat
              label={`Drawn by ${fmtAge(lifeExpectancy)}`}
              value={fmtBig(early.totalDrawn)}
              color={C.early}
            />
            <Stat
              label={`Pot left at ${fmtAge(lifeExpectancy)}`}
              value={fmtBig(early.finalPot)}
              color={C.earlySoft}
              sub={
                hasWaitPot
                  ? `wait + invest: ${fmtBig(wait.finalPot)}`
                  : "still yours, on top of the income"
              }
            />
          </div>

          <p className="text-xs mt-4 max-w-2xl" style={{ color: C.inkFaint }}>
            Steady {returnRate.toFixed(1)}% real return every year, so no
            sequence-of-returns risk: the 4% rule was built to survive bad
            markets over 30 years, and this projection shows the smooth case.
            Taxes on withdrawals depend on the account type and aren't modeled.
            The lifetime totals in the chart above still assume nothing is
            drawn.
          </p>
        </>
      )}
    </div>
  );
}
