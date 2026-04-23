import { useCallback, useEffect, useMemo, useState } from "react";

type Schema = {
  features: string[];
  categorical_options: Record<string, string[]>;
};

const NUMERIC_KEYS = [
  "Trip_Distance_km",
  "Passenger_Count",
  "Base_Fare",
  "Per_Km_Rate",
  "Per_Minute_Rate",
  "Trip_Duration_Minutes",
] as const;

const CAT_KEYS = [
  "Time_of_Day",
  "Day_of_Week",
  "Traffic_Conditions",
  "Weather",
] as const;

type FormState = Record<
  (typeof NUMERIC_KEYS)[number] | (typeof CAT_KEYS)[number],
  string
>;

const emptyForm = (): FormState => ({
  Trip_Distance_km: "",
  Passenger_Count: "",
  Base_Fare: "",
  Per_Km_Rate: "",
  Per_Minute_Rate: "",
  Trip_Duration_Minutes: "",
  Time_of_Day: "",
  Day_of_Week: "",
  Traffic_Conditions: "",
  Weather: "",
});

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      (data as { detail: unknown }).detail;
    const msg =
      typeof detail === "string"
        ? detail
        : JSON.stringify(detail ?? (text || res.statusText));
    throw new Error(msg);
  }
  return data as T;
}

export default function App() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [predicted, setPredicted] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setSchemaError(null);
    try {
      const s = await fetchJson<Schema>("/api/schema");
      setSchema(s);
      setForm((prev) => {
        const next = { ...prev };
        for (const k of CAT_KEYS) {
          const opts = s.categorical_options[k] ?? [];
          if (!next[k] && opts.length) next[k] = opts[0] ?? "";
        }
        return next;
      });
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : "Failed to load API");
      setSchema(null);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const numericLabels = useMemo(
    () =>
      ({
        Trip_Distance_km: "Trip distance (km)",
        Passenger_Count: "Passengers",
        Base_Fare: "Base fare",
        Per_Km_Rate: "Per km rate",
        Per_Minute_Rate: "Per minute rate",
        Trip_Duration_Minutes: "Duration (minutes)",
      }) satisfies Record<(typeof NUMERIC_KEYS)[number], string>,
    [],
  );

  const catLabels = useMemo(
    () =>
      ({
        Time_of_Day: "Time of day",
        Day_of_Week: "Day",
        Traffic_Conditions: "Traffic",
        Weather: "Weather",
      }) satisfies Record<(typeof CAT_KEYS)[number], string>,
    [],
  );

  const buildPayload = (): Record<string, string | number | null> => {
    const out: Record<string, string | number | null> = {};
    for (const k of NUMERIC_KEYS) {
      const raw = form[k].trim();
      if (raw === "") {
        out[k] = null;
      } else {
        const n = Number(raw);
        if (Number.isNaN(n)) throw new Error(`Invalid number: ${numericLabels[k]}`);
        out[k] = n;
      }
    }
    for (const k of CAT_KEYS) {
      const v = form[k].trim();
      out[k] = v === "" ? null : v;
    }
    return out;
  };

  const onPredict = async () => {
    setPredictError(null);
    setPredicted(null);
    let payload: Record<string, string | number | null>;
    try {
      payload = buildPayload();
    } catch (e) {
      setPredictError(e instanceof Error ? e.message : "Invalid input");
      return;
    }
    setLoading(true);
    try {
      const r = await fetchJson<{ predicted_trip_price: number }>("/api/predict", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setPredicted(r.predicted_trip_price);
    } catch (e) {
      setPredictError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>Taxi trip price</h1>
      </header>

      {schemaError && (
        <div className="error" role="alert">
          <strong>API:</strong> {schemaError}. Start backend:{" "}
          <code style={{ wordBreak: "break-all" }}>
            .\.venv\Scripts\uvicorn main:app --app-dir backend --reload
          </code>
        </div>
      )}

      {schema && (
        <div className="form-card">
          <div className="form-grid">
            {(Object.keys(numericLabels) as (typeof NUMERIC_KEYS)[number][]).map(
              (key) => (
                <div key={key} className="field">
                  <label htmlFor={key}>{numericLabels[key]}</label>
                  <input
                    id={key}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="Leave empty to impute"
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </div>
              ),
            )}
            {(Object.keys(catLabels) as (typeof CAT_KEYS)[number][]).map((key) => (
              <div key={key} className="field">
                <label htmlFor={key}>{catLabels[key]}</label>
                <select
                  id={key}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {(schema.categorical_options[key] ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={loading}
              onClick={() => void onPredict()}
            >
              {loading ? "Predicting…" : "Predict price"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={loading}
              onClick={() => {
                setForm(emptyForm());
                setPredicted(null);
                setPredictError(null);
                void loadMeta();
              }}
            >
              Reset
            </button>
          </div>

          {predictError && (
            <div className="error" role="alert">
              {predictError}
            </div>
          )}

          {predicted !== null && (
            <div className="result">
              <h2>Estimated trip price</h2>
              <div className="price">
                {predicted.toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          )}

          <p className="hint">
            Empty numeric fields are sent as null; the model uses the same
            imputation as training. Retrain after editing the CSV via{" "}
            <code>POST /api/retrain</code> or delete{" "}
            <code>backend/model.joblib</code> and restart the server.
          </p>
        </div>
      )}
    </div>
  );
}
