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
  const [form, setForm] = useState<FormState>(emptyForm());
  const [predicted, setPredicted] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setSchemaError(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
      const s = await fetchJson<Schema>(`${apiBase}/schema`);
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
        Trip_Distance_km: "Trip Distance (km)",
        Passenger_Count: "Passengers",
        Base_Fare: "Base Fare",
        Per_Km_Rate: "Per Km Rate",
        Per_Minute_Rate: "Per Minute Rate",
        Trip_Duration_Minutes: "Duration (min)",
      }) satisfies Record<(typeof NUMERIC_KEYS)[number], string>,
    [],
  );

  const numericIcons = useMemo(
    () => ({
      Trip_Distance_km: "📏",
      Passenger_Count: "👥",
      Base_Fare: "💰",
      Per_Km_Rate: "📊",
      Per_Minute_Rate: "⏱️",
      Trip_Duration_Minutes: "🕐",
    }),
    [],
  );

  const catLabels = useMemo(
    () =>
      ({
        Time_of_Day: "Time of Day",
        Day_of_Week: "Day of Week",
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
      const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
      const r = await fetchJson<{ predicted_trip_price: number }>(`${apiBase}/predict`, {
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

  const formatINR = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-icon">🚕</div>
        <span className="badge">
          <span className="badge-dot" />
          AI Powered
        </span>
        <h1>Taxi Fare Predictor</h1>
        <p>
          Get instant, AI-powered fare estimates for your taxi trips across India
        </p>
      </header>

      {/* ── API Error ── */}
      {schemaError && (
        <div className="error" role="alert" id="api-error">
          <span className="error-icon">⚠️</span>
          <div>
            <strong>Connection Error:</strong> {schemaError}
          </div>
        </div>
      )}

      {/* ── Main form ── */}
      {schema && (
        <div className="form-card">
          <div className="section-title">Trip Details</div>
          <div className="form-grid">
            {(Object.keys(numericLabels) as (typeof NUMERIC_KEYS)[number][]).map(
              (key) => (
                <div key={key} className="field">
                  <label htmlFor={key}>
                    {numericIcons[key]} {numericLabels[key]}
                  </label>
                  <input
                    id={key}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    placeholder="Auto-fill"
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </div>
              ),
            )}
          </div>

          <div className="divider" />

          <div className="section-title">Ride Conditions</div>
          <div className="form-grid">
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
                  <option value="">Select...</option>
                  {(schema.categorical_options[key] ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* ── Actions ── */}
          <div className="actions">
            <button
              type="button"
              id="predict-btn"
              className="primary"
              disabled={loading}
              onClick={() => void onPredict()}
            >
              {loading && <span className="spinner" />}
              {loading ? "Predicting…" : "🔮 Predict Fare"}
            </button>
            <button
              type="button"
              id="reset-btn"
              className="ghost"
              disabled={loading}
              onClick={() => {
                setForm(emptyForm());
                setPredicted(null);
                setPredictError(null);
                void loadMeta();
              }}
            >
              ↺ Reset
            </button>
          </div>

          {/* ── Error ── */}
          {predictError && (
            <div className="error" role="alert" id="predict-error">
              <span className="error-icon">❌</span>
              <div>{predictError}</div>
            </div>
          )}

          {/* ── Result ── */}
          {predicted !== null && (
            <div className="result" id="prediction-result">
              <div className="result-label">Estimated Trip Fare</div>
              <div className="price">{formatINR(predicted)}</div>
            </div>
          )}

          <p className="hint">
            Empty fields are auto-imputed by the model. Retrain via{" "}
            <code>POST /retrain</code> or delete{" "}
            <code>model.joblib</code> and restart.
          </p>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="footer">
        Built with ❤️ using FastAPI & React
      </footer>
    </div>
  );
}
