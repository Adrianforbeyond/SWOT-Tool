import React, { useMemo, useState } from "react";

/** ---------- Types ---------- */
type Area = "S" | "W" | "O" | "T";
type Criterion = { id: string; text: string; score?: number };
type Scenario = {
  id: string;
  name: string;
  description: string;
  files: string[];
  criteria: Record<Area, Criterion[]>;
};

type Weights = Record<Area, number>;

const FIB = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597,
] as const;
const ALL_FIB_WITH_ZERO = [0, ...FIB];

const AREAS: Area[] = ["S", "W", "O", "T"];
const AREA_LABEL: Record<Area, string> = {
  S: "Stärken",
  W: "Schwächen",
  O: "Chancen",
  T: "Risiken",
};

/** ---------- Utils ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);

function nearestFib(n: number): number {
  if (n <= 0) return 0;

  let best: number = FIB[0];            // <-- explizit number
  let minDiff = Math.abs(n - best);

  for (const f of FIB) {
    const d = Math.abs(n - f);
    if (d < minDiff) {
      best = f;                         // ok
      minDiff = d;
    }
  }
  return best;
}


function mean(values: number[]): number {
  if (!values.length) return 0;
  const s = values.reduce((a, b) => a + b, 0);
  return s / values.length;
}

/** ---------- App ---------- */
export default function App() {
  const [tab, setTab] = useState<
    "szenarien" | "kriterien" | "bewertung" | "vergleich"
  >("szenarien");

  const [scenarios, setScenarios] = useState<Scenario[]>([
    {
      id: uid(),
      name: "Szenario A",
      description: "",
      files: [],
      criteria: { S: [], W: [], O: [], T: [] },
    },
  ]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    scenarios[0].id
  );

  // -> Weights sind normale number (kein strikter 1-Typ), dadurch keine TS-Fehler
  const [weights, setWeights] = useState<Weights>({ S: 1, W: -1, O: 1, T: -1 });

  const selected = scenarios.find((s) => s.id === selectedScenarioId)!;

  /** --- derived metrics --- */
  const perScenarioStats = useMemo(() => {
    return scenarios.map((s) => {
      const means: Record<Area, number> = { S: 0, W: 0, O: 0, T: 0 };
      for (const a of AREAS) {
        const vals = s.criteria[a]
          .map((c) => c.score)
          .filter((v): v is number => typeof v === "number");
        means[a] = mean(vals);
      }
      const total =
        means.S * weights.S +
        means.W * weights.W +
        means.O * weights.O +
        means.T * weights.T;

      return { id: s.id, name: s.name, means, total };
    });
  }, [scenarios, weights]);

  const sortedForRanking = [...perScenarioStats].sort(
    (a, b) => b.total - a.total
  );

  /** ---------- Handlers ---------- */
  function updateScenario(partial: Partial<Scenario>) {
    setScenarios((prev) =>
      prev.map((s) => (s.id === selectedScenarioId ? { ...s, ...partial } : s))
    );
  }

  function addScenario() {
    const s: Scenario = {
      id: uid(),
      name: `Szenario ${String.fromCharCode(65 + scenarios.length)}`,
      description: "",
      files: [],
      criteria: { S: [], W: [], O: [], T: [] },
    };
    setScenarios((prev) => [...prev, s]);
    setSelectedScenarioId(s.id);
  }

  function removeScenario(id: string) {
    const next = scenarios.filter((s) => s.id !== id);
    if (!next.length) return;
    setScenarios(next);
    if (selectedScenarioId === id) setSelectedScenarioId(next[0].id);
  }

  function addCriteriaFromText(area: Area, text: string) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    updateScenario({
      criteria: {
        ...selected.criteria,
        [area]: [
          ...selected.criteria[area],
          ...lines.map<Criterion>((t) => ({ id: uid(), text: t })),
        ],
      },
    });
  }

  function setCriterionText(area: Area, id: string, text: string) {
    updateScenario({
      criteria: {
        ...selected.criteria,
        [area]: selected.criteria[area].map((c) =>
          c.id === id ? { ...c, text } : c
        ),
      },
    });
  }

  function deleteCriterion(area: Area, id: string) {
    updateScenario({
      criteria: {
        ...selected.criteria,
        [area]: selected.criteria[area].filter((c) => c.id !== id),
      },
    });
  }

  function setCriterionScore(
    area: Area,
    id: string,
    score: number | undefined
  ) {
    updateScenario({
      criteria: {
        ...selected.criteria,
        [area]: selected.criteria[area].map((c) =>
          c.id === id ? { ...c, score } : c
        ),
      },
    });
  }

  async function aiScoreAll() {
    const payload = {
      scenario: { name: selected.name, description: selected.description },
      criteria: {
        S: selected.criteria.S.map((c) => ({ id: c.id, text: c.text })),
        W: selected.criteria.W.map((c) => ({ id: c.id, text: c.text })),
        O: selected.criteria.O.map((c) => ({ id: c.id, text: c.text })),
        T: selected.criteria.T.map((c) => ({ id: c.id, text: c.text })),
      },
      scale: FIB,
      mode: "deep_research",
    };

    try {
      const res = await fetch("/api/ai-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        alert(
          "KI-Bewertung nicht erreichbar.\n" +
            "Bitte Backend-Endpoint POST /api/ai-score bereitstellen.\n\n" +
            "HTTP " +
            res.status +
            " " +
            res.statusText +
            (txt ? `\n\n${txt}` : "")
        );
        return;
      }

      const data = (await res.json()) as Partial<
        Record<Area, Record<string, number>>
      >;

      for (const a of AREAS) {
        const mapForArea = data[a] || {};
        for (const c of selected.criteria[a]) {
          const raw = mapForArea[c.id];
          if (typeof raw === "number" && !Number.isNaN(raw)) {
            const snapped = nearestFib(raw);
            setCriterionScore(a, c.id, snapped);
          }
        }
      }
    } catch (err: any) {
      alert(
        "Fehler beim KI-Scoring:\n" +
          (err?.message || String(err)) +
          "\n\nStelle sicher, dass /api/ai-score erreichbar ist."
      );
    }
  }

  /** ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="mx-auto max-w-6xl p-6">
        <Header
          scenarios={scenarios}
          selectedId={selectedScenarioId}
          onSelect={setSelectedScenarioId}
          onAdd={addScenario}
          onRemove={removeScenario}
        />

        {/* Tabs */}
        <Tabs value={tab} onChange={setTab} />

        {tab === "szenarien" && (
          <Step1_Scenarios
            scenario={selected}
            onChangeName={(v) => updateScenario({ name: v })}
            onChangeDesc={(v) => updateScenario({ description: v })}
            onFiles={(names) =>
              updateScenario({ files: [...selected.files, ...names] })
            }
          />
        )}

        {tab === "kriterien" && (
          <Step2_Criteria
            scenario={selected}
            onAdd={(area, text) => addCriteriaFromText(area, text)}
            onEdit={(a, id, t) => setCriterionText(a, id, t)}
            onDelete={(a, id) => deleteCriterion(a, id)}
          />
        )}

        {tab === "bewertung" && (
          <Step3_Scoring
            scenario={selected}
            weights={weights}
            onWeightsChange={setWeights}
            onAI={aiScoreAll}
            onScore={(a, id, score) => setCriterionScore(a, id, score)}
          />
        )}

        {tab === "vergleich" && (
          <Step4_Compare stats={sortedForRanking} weights={weights} />
        )}
      </div>
    </div>
  );
}

/** ---------- Header ---------- */
function Header(props: {
  scenarios: Scenario[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const { scenarios, selectedId, onSelect, onAdd, onRemove } = props;
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">SWOT-Analyse</h1>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="rounded-xl bg-black px-3 py-2 text-sm text-white"
          onClick={onAdd}
        >
          + Szenario
        </button>
        {scenarios.length > 1 && (
          <button
            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm text-red-600"
            onClick={() => onRemove(selectedId)}
          >
            Szenario löschen
          </button>
        )}
      </div>
    </header>
  );
}

/** ---------- Tabs ---------- */
function Tabs(props: {
  value: "szenarien" | "kriterien" | "bewertung" | "vergleich";
  onChange: (v: "szenarien" | "kriterien" | "bewertung" | "vergleich") => void;
}) {
  const { value, onChange } = props;
  const btn = (v: typeof value, label: string) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      className={`rounded-xl px-4 py-2 text-sm ${
        value === v ? "bg-white shadow-soft" : "bg-gray-100 hover:opacity-90"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {btn("szenarien", "1. Szenarien")}
      {btn("kriterien", "2. Kriterien")}
      {btn("bewertung", "3. Bewertung")}
      {btn("vergleich", "4. Vergleich")}
    </div>
  );
}

/** ---------- Step 1 ---------- */
function Step1_Scenarios(props: {
  scenario: Scenario;
  onChangeName: (v: string) => void;
  onChangeDesc: (v: string) => void;
  onFiles: (names: string[]) => void;
}) {
  const { scenario, onChangeName, onChangeDesc, onFiles } = props;

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    onFiles(files.map((f) => f.name));
    e.currentTarget.value = "";
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <input
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          placeholder="Szenario-Name"
          value={scenario.name}
          onChange={(e) => onChangeName(e.target.value)}
        />
        <textarea
          className="min-h-[140px] w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          placeholder="Beschreibung …"
          value={scenario.description}
          onChange={(e) => onChangeDesc(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-sm text-gray-600">Dateien/Bilder</span>
          <input type="file" multiple onChange={onUpload} />
        </label>
        {!!scenario.files.length && (
          <ul className="list-inside list-disc text-sm text-gray-600">
            {scenario.files.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border border-dashed p-4 text-sm">
        <p className="mb-2 font-medium">Hinweis</p>
        <p>Hier beschreibst du das Szenario und hängst Dateien an.</p>
      </div>
    </div>
  );
}

/** ---------- Step 2 ---------- */
function Step2_Criteria(props: {
  scenario: Scenario;
  onAdd: (area: Area, text: string) => void;
  onEdit: (area: Area, id: string, text: string) => void;
  onDelete: (area: Area, id: string) => void;
}) {
  const { scenario, onAdd, onEdit, onDelete } = props;

  const AreaBlock = (a: Area) => {
    let inputRef = React.useRef<HTMLTextAreaElement>(null);
    return (
      <div key={a} className="rounded-2xl border bg-white p-4">
        <div className="mb-2 text-sm font-medium">{AREA_LABEL[a]}</div>
        <div className="mb-2">
          <textarea
            ref={inputRef}
            className="min-h-[80px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="Kriterien – je eine Zeile"
          />
          <div className="mt-2">
            <button
              className="rounded-xl bg-black px-3 py-2 text-sm text-white"
              onClick={() => {
                const v = inputRef.current?.value || "";
                if (v.trim()) {
                  onAdd(a, v);
                  if (inputRef.current) inputRef.current.value = "";
                }
              }}
            >
              + hinzufügen
            </button>
          </div>
        </div>

        <ul className="space-y-2">
          {scenario.criteria[a].map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <input
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                value={c.text}
                onChange={(e) => onEdit(a, c.id, e.target.value)}
              />
              <button
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm text-red-600"
                onClick={() => onDelete(a, c.id)}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {AREAS.map((a) => AreaBlock(a))}
    </div>
  );
}

/** ---------- Step 3 ---------- */
function Step3_Scoring(props: {
  scenario: Scenario;
  weights: Weights;
  onWeightsChange: (w: Weights) => void;
  onScore: (a: Area, id: string, score: number | undefined) => void;
  onAI: () => void;
}) {
  const { scenario, weights, onWeightsChange, onScore, onAI } = props;

  const means: Record<Area, number> = { S: 0, W: 0, O: 0, T: 0 };
  for (const a of AREAS) {
    const vals = scenario.criteria[a]
      .map((c) => c.score)
      .filter((v): v is number => typeof v === "number");
    means[a] = mean(vals);
  }
  const total =
    means.S * weights.S +
    means.W * weights.W +
    means.O * weights.O +
    means.T * weights.T;

  return (
    <div className="space-y-6">
      {/* Weights */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-3 text-sm font-medium">Gewichte</div>
        <div className="flex flex-wrap items-end gap-3">
          {AREAS.map((a) => (
            <label key={a} className="text-sm">
              <span className="mr-2">{AREA_LABEL[a]}</span>
              <input
                type="number"
                step="0.1"
                value={weights[a]}
                onChange={(e) =>
                  onWeightsChange({
                    ...weights,
                    [a]: parseFloat(e.target.value),
                  })
                }
                className="w-24 rounded-xl border border-gray-300 px-3 py-1.5"
              />
            </label>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              onClick={() => onWeightsChange({ S: 1, W: 1, O: 1, T: 1 })}
            >
              Reset 1/1/1/1
            </button>
            <button
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              onClick={() => onWeightsChange({ S: 1, W: -1, O: 1, T: -1 })}
            >
              S/O +, W/T −
            </button>
          </div>
        </div>
      </div>

      {/* AI */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">KI-Bewertung</div>
            <div className="text-xs text-gray-500">
              Ruft <code>POST /api/ai-score</code> auf. Kein Heuristik-Fallback.
            </div>
          </div>
          <button
            className="rounded-xl bg-black px-3 py-2 text-sm text-white"
            onClick={onAI}
          >
            KI-Bewertung starten
          </button>
        </div>
      </div>

      {/* Criteria with scores */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {AREAS.map((a) => (
          <div key={a} className="rounded-2xl border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">{AREA_LABEL[a]}</div>
              <div className="text-xs text-gray-600">
                Ø {AREA_LABEL[a]}:{" "}
                <span className="font-medium">{means[a].toFixed(2)}</span>
              </div>
            </div>

            <ul className="space-y-2">
              {scenario.criteria[a].map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <div className="flex-1 text-sm">{c.text}</div>
                  <select
                    className="rounded-xl border border-gray-300 bg-white px-2 py-1 text-sm"
                    value={typeof c.score === "number" ? String(c.score) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onScore(a, c.id, v ? parseInt(v, 10) : undefined);
                    }}
                  >
                    <option value="">—</option>
                    {ALL_FIB_WITH_ZERO.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="text-sm">
          Gesamtscore (gewichtete Summe der Ø-Werte):{" "}
          <span className="font-semibold">{total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

/** ---------- Step 4 ---------- */
function Step4_Compare(props: {
  stats: {
    id: string;
    name: string;
    means: Record<Area, number>;
    total: number;
  }[];
  weights: Weights;
}) {
  const { stats, weights } = props;
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-3 text-sm text-gray-600">
        Ranking nach Gesamtscore = Σ(Ø × Gewicht). Aktuelle Gewichte: S{" "}
        <b>{weights.S}</b>, W <b>{weights.W}</b>, O <b>{weights.O}</b>, T{" "}
        <b>{weights.T}</b>.
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[700px] w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-2">#</th>
              <th className="p-2">Szenario</th>
              <th className="p-2">Ø Stärken</th>
              <th className="p-2">Ø Schwächen</th>
              <th className="p-2">Ø Chancen</th>
              <th className="p-2">Ø Risiken</th>
              <th className="p-2">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, i) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">{i + 1}</td>
                <td className="p-2">{row.name}</td>
                <td className="p-2">{row.means.S.toFixed(2)}</td>
                <td className="p-2">{row.means.W.toFixed(2)}</td>
                <td className="p-2">{row.means.O.toFixed(2)}</td>
                <td className="p-2">{row.means.T.toFixed(2)}</td>
                <td className="p-2 font-semibold">{row.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
