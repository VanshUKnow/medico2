
import React, { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity, ArrowDownToLine, ArrowRight, BrainCircuit, CheckCircle2,
  ChevronRight, FileText, HeartPulse, History, LayoutDashboard,
  LoaderCircle, LogOut, Menu, Plus, RefreshCw, Search, Settings,
  ShieldCheck, Sparkles, Upload, UserRound, Users, X, AlertCircle,
} from "lucide-react";
import "./styles.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

const REPORT_TYPES = [
  "ECG report",
  "Echocardiogram",
  "Cardiology consultation",
  "Holter monitor report",
  "Lipid profile",
  "Cardiac biomarkers",
  "Other cardiac document",
];


function formatApiError(detail) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;

        if (item && typeof item === "object") {
          const location = Array.isArray(item.loc)
            ? item.loc
                .filter((part) => part !== "body")
                .join(" → ")
            : "";

          const message =
            item.msg || item.message || JSON.stringify(item);

          return location ? `${location}: ${message}` : message;
        }

        return String(item);
      })
      .join("; ");
  }

  if (detail && typeof detail === "object") {
    return (
      detail.message ||
      detail.msg ||
      JSON.stringify(detail)
    );
  }

  return "";
}

async function api(path, token, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && options.body != null) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot connect to the Medico backend at ${API}. ` +
        "Start the backend and check the API URL and CORS settings."
      );
    }

    throw error;
  }

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {
      // The server may return an empty or non-JSON error response.
    }

    const detail = data?.detail ?? data?.message;
    const message = formatApiError(detail);

    throw new Error(
      message || `Request failed with HTTP ${response.status} (${response.statusText}).`
    );
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "The server returned a non-JSON response. Check the backend endpoint."
    );
  }

  return response.json();
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function idLabel(id) {
  return `MD-${String(id).padStart(5, "0")}`;
}

export default function App() {
  return (
    <BrowserRouter>
      <MedicoApp />
    </BrowserRouter>
  );
}

function MedicoApp() {
  const [token, setToken] = useState(
    () => localStorage.getItem("medico_token") || ""
  );
  const [user, setUser] = useState(null);
  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const logout = useCallback(() => {
    localStorage.removeItem("medico_token");
    setToken("");
    setUser(null);
    setPatients([]);
    setReports([]);
    setError("");
    setNotice("");
    navigate("/");
  }, [navigate]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    setError("");

    try {
      const [me, patientData, reportData] = await Promise.all([
        api("/api/auth/me", token),
        api("/api/patients", token),
        api("/api/analyses", token),
      ]);

      setUser(me);
      setPatients(Array.isArray(patientData) ? patientData : patientData.items || []);
      setReports(Array.isArray(reportData) ? reportData : reportData.items || []);
    } catch (err) {
      setError(err.message);
      if (/invalid.*token|expired.*token|token.*expired|not authenticated|unauthorized/i.test(err.message)) {logout();}
    } finally {
      setRefreshing(false);
    }
  }, [token, logout]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  useEffect(() => {
    setMobileMenu(false);
    setError("");
    setNotice("");
  }, [location.pathname]);

  async function signIn(credentials, mode) {
    setLoading(true);
    setError("");

    try {
      const result = await api(`/api/auth/${mode}`, null, {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      if (!result?.access_token) {
        throw new Error("The server did not return an access token.");
      }

      localStorage.setItem("medico_token", result.access_token);
      setToken(result.access_token);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createPatient(payload) {
    const result = await api("/api/patients", token, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await refresh();
    setNotice("Patient record saved.");
    return result;
  }

  async function submitAnalysis(payload, options = {}) {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await api("/api/analyses", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let aiWarning = "";
      if (options.generateAI) {
        try {
          const form = new FormData();
          form.append("clinical_notes", options.clinicalNotes || "");
          await api(`/api/analyses/${result.id}/explain`, token, {
            method: "POST",
            body: form,
          });
        } catch (err) {
          aiWarning = ` Model analysis was saved, but Gemini explanation failed: ${err.message}`;
        }
      }

      if (options.files?.length) {
        try {
          const form = new FormData();
          form.append("clinical_notes", options.clinicalNotes || "");
          options.files.forEach((file) => form.append("files", file));
          await api(`/api/analyses/${result.id}/documents/analyze`, token, {
            method: "POST",
            body: form,
          });
        } catch (err) {
          aiWarning += ` Document analysis failed: ${err.message}`;
        }
      }

      await refresh();
      setNotice(aiWarning
        ? `Analysis saved successfully.${aiWarning}`
        : options.files?.length
          ? "Analysis saved; Gemini explanation and document review completed."
          : options.generateAI
            ? "Analysis saved and Gemini explanation generated."
            : "Analysis saved successfully.");
      navigate(`/reports/${result.id}`);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function generateExplanationForReport(id, clinicalNotes = "") {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("clinical_notes", clinicalNotes);
      await api(`/api/analyses/${id}/explain`, token, { method: "POST", body: form });
      await refresh();
      setNotice("Gemini explanation saved to the report.");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function analyzeDocumentsForReport(id, files, clinicalNotes = "") {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("clinical_notes", clinicalNotes);
      files.forEach((file) => form.append("files", file));
      await api(`/api/analyses/${id}/documents/analyze`, token, {
        method: "POST",
        body: form,
      });
      await refresh();
      setNotice("Document review generated and saved to the report.");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport(id) {
    setError("");

    try {
      const response = await fetch(`${API}/api/analyses/${id}/report.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        let message = "Unable to download this report.";
        try {
          const data = await response.json();
          message = data.detail || message;
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `medico-report-${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token) {
    return (
      <AuthPage
        onSubmit={signIn}
        loading={loading}
        error={error}
      />
    );
  }

  if (!user) {
    return (
      <div className="medico-loading">
        <LoaderCircle className="spin" size={25} />
        <span>Connecting to Medico...</span>
        {error && <p className="error-text">{error}</p>}
        <button className="button button-secondary" onClick={refresh}>
          Retry connection
        </button>
        <button className="text-button" onClick={logout}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="medico-app">
      <aside className={`medico-sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <Brand />

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav">
          <NavItem to="/" icon={LayoutDashboard} label="Overview" end />
          <NavItem to="/analysis" icon={Activity} label="New analysis" />
          <NavItem to="/patients" icon={Users} label="Patients" />
          <NavItem to="/history" icon={History} label="Report history" />
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={17} />
            <div>
              <b>Private workspace</b>
              <span>Access-controlled records</span>
            </div>
          </div>

          <NavItem to="/settings" icon={Settings} label="Settings" />

          <div className="sidebar-user">
            <div className="user-avatar">
              {(user.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="user-meta">
              <b>{user.email}</b>
              <span>{user.role || "Account"}</span>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="medico-main">
        <header className="medico-topbar">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle navigation"
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
          <div className="topbar-context">
            <span>MEDICO <ChevronRight size={13} /> CARDIOLOGY WORKSPACE</span>
            <p>Clinical analysis and reporting</p>
          </div>
          <div className="topbar-actions">
            <span className="connection-indicator">
              <i /> Connected
            </span>
            <button
              className="icon-button"
              onClick={refresh}
              disabled={refreshing}
              title="Refresh data"
            >
              <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </header>

        <div className="medico-content">
          {error && (
            <div className="inline-alert alert-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div className="inline-alert alert-success" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}

          <Routes>
            <Route
              path="/"
              element={
                <Overview
                  patients={patients}
                  reports={reports}
                  onNew={() => navigate("/analysis")}
                  onDownload={downloadReport}
                />
              }
            />
            <Route
              path="/analysis"
              element={
                <AnalysisPage
                  patients={patients}
                  loading={loading}
                  onSubmit={submitAnalysis}
                />
              }
            />
            <Route
              path="/patients"
              element={
                <PatientsPage
                  patients={patients}
                  onCreate={createPatient}
                  onAnalyze={(id) => navigate(`/analysis?patient=${id}`)}
                />
              }
            />
            <Route
              path="/history"
              element={
                <HistoryPage
                  reports={reports}
                  patients={patients}
                  onDownload={downloadReport}
                />
              }
            />
            <Route
              path="/reports/:id"
              element={
                <ReportDetail
                  reports={reports}
                  patients={patients}
                  onDownload={downloadReport}
                  onGenerateExplanation={generateExplanationForReport}
                  onAnalyzeDocuments={analyzeDocumentsForReport}
                  loading={loading}
                />
              }
            />
            <Route
              path="/settings"
              element={<SettingsPage user={user} onLogout={logout} />}
            />
            <Route path="*" element={<EmptyState title="Page not found" text="Choose a page from the navigation." />} />
          </Routes>

          <footer className="medico-footer">
            <span>Medico · Cardiology analysis workspace</span>
            <span>Investigational decision support only</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <NavLink to="/" className="medico-brand">
      <span className="brand-mark"><HeartPulse size={22} /></span>
      <span>medico<span className="brand-dot">.</span></span>
    </NavLink>
  );
}

function NavItem({ to, icon: Icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `sidebar-link ${isActive ? "selected" : ""}`}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </NavLink>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span>{label}</span>
        <span className="stat-icon"><Icon size={19} /></span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Overview({ patients, reports, onNew, onDownload }) {
  const latest = [...reports].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  ).slice(0, 5);

  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Overview"
        description="A clear view of your patient records and cardiac analyses."
        action={<button className="button button-primary" onClick={onNew}><Plus size={17} /> New analysis</button>}
      />

      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="welcome-kicker"><Sparkles size={15} /> CARDIOLOGY WORKFLOW</span>
          <h2>Make every analysis easier to review.</h2>
          <p>
            Organize patient records, run the configured model and review
            explainable outputs with transparent limitations.
          </p>
          <button className="button button-primary" onClick={onNew}>
            Start an analysis <ArrowRight size={17} />
          </button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-ring ring-one" />
          <div className="art-ring ring-two" />
          <HeartPulse size={82} strokeWidth={1.15} />
          <span className="art-dot dot-one" />
          <span className="art-dot dot-two" />
        </div>
      </section>

      <div className="stats-grid">
        <StatCard icon={Users} label="Patient records" value={patients.length} note="Saved in your account" />
        <StatCard icon={FileText} label="Saved analyses" value={reports.length} note="Persisted analysis records" />
        <StatCard icon={BrainCircuit} label="AI explanations" value={reports.filter((r) => r.ai_explanation).length} note="Returned by the configured AI service" />
      </div>

      <section className="content-panel">
        <div className="panel-heading">
          <div><h2>Recent reports</h2><p>Your latest saved analyses.</p></div>
        </div>
        <ReportTable reports={latest} patients={patients} onDownload={onDownload} />
      </section>

      <div className="clinical-disclaimer">
        <ShieldCheck size={18} />
        <p><b>Clinical safety notice</b><br />Model predictions and AI-generated explanations are investigational decision support, not confirmed diagnoses. Clinical validation is required before clinical use.</p>
      </div>
    </>
  );
}

function ReportTable({ reports, patients, onDownload }) {
  const patientMap = new Map(patients.map((p) => [String(p.id), p]));

  if (!reports.length) {
    return <EmptyState title="No reports yet" text="Saved analyses will appear here once a real analysis has completed successfully." />;
  }

  return (
    <div className="table-scroll">
      <table className="clinical-table">
        <thead><tr><th>Report</th><th>Patient</th><th>Created</th><th>Prediction</th><th>AI explanation</th><th /></tr></thead>
        <tbody>
          {reports.map((report) => {
            const patient = patientMap.get(String(report.patient_id));
            return (
              <tr key={report.id}>
                <td><b>{idLabel(report.id)}</b></td>
                <td>{patient?.patient_code || patient?.display_name || "Patient record"}</td>
                <td>{dateLabel(report.created_at)}</td>
                <td>{report.predicted_class == null ? "Unavailable" : `Class ${report.predicted_class}`}</td>
                <td><span className={`status-pill ${report.ai_explanation ? "status-ready" : "status-pending"}`}>{report.ai_explanation ? "Available" : "Not generated"}</span></td>
                <td><button className="table-action" onClick={() => onDownload(report.id)}><ArrowDownToLine size={15} /> PDF</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisPage({ patients, loading, onSubmit }) {
  const query = new URLSearchParams(window.location.search);
  const [patientId, setPatientId] = useState(query.get("patient") || "");
  const [type, setType] = useState("Cardiology consultation");
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState("");
  const [features, setFeatures] = useState({
    age: "", sex: "", cp: "", trestbps: "", chol: "", fbs: "",
    restecg: "", thalach: "", exang: "", oldpeak: "", slope: "", ca: "", thal: "",
  });
  const [useModel, setUseModel] = useState(true);
  const [generateAI, setGenerateAI] = useState(true);
  const [message, setMessage] = useState("");

  const fields = [
    ["age", "Age", 1, 120, 1],
    ["sex", "Sex code (training dataset)", 0, 1, 1],
    ["cp", "Chest pain type", 0, 3, 1],
    ["trestbps", "Resting blood pressure (mmHg)", 50, 300, 1],
    ["chol", "Cholesterol (mg/dL)", 50, 1000, 1],
    ["fbs", "Fasting blood sugar > 120 (0/1)", 0, 1, 1],
    ["restecg", "Resting ECG category", 0, 2, 1],
    ["thalach", "Maximum heart rate", 30, 250, 1],
    ["exang", "Exercise-induced angina (0/1)", 0, 1, 1],
    ["oldpeak", "ST depression", -5, 15, 0.1],
    ["slope", "ST slope category", 0, 2, 1],
    ["ca", "Major vessels category", 0, 4, 1],
    ["thal", "Thal category", 0, 3, 1],
  ];

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!patientId) {
      setMessage("Select a patient record first.");
      return;
    }

    // The current persistence schema requires a model result for every saved analysis.
    // Documents are attached to that saved report, so model analysis must remain enabled.
    if (!useModel) {
      setMessage(files.length
        ? "Enable the XGBoost model to create a saved report before attaching documents."
        : "Enable the model analysis to create a report.");
      return;
    }

    const emptyFields = Object.entries(features)
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);
    if (emptyFields.length) {
      setMessage(`Please fill in all model fields: ${emptyFields.join(", ")}`);
      return;
    }

    const invalidFields = Object.entries(features)
      .filter(([, value]) => !Number.isFinite(Number(value)))
      .map(([key]) => key);
    if (invalidFields.length) {
      setMessage(`Invalid values for: ${invalidFields.join(", ")}`);
      return;
    }

    const numericFeatures = Object.fromEntries(
      Object.entries(features).map(([key, value]) => [key, Number(value)])
    );
    const payload = { patient_id: Number(patientId), ...numericFeatures };

    try {
      const result = await onSubmit(payload, {
        files,
        clinicalNotes: notes.trim(),
        reportType: type,
        generateAI,
      });
      if (result) setMessage("Analysis saved. Opening the report…");
    } catch (error) {
      setMessage(error.message || "Analysis could not be completed.");
    }
  }

  function handleFileSelection(event) {
    const selected = Array.from(event.target.files || []);
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    const accepted = selected.filter((f) => allowed.has(f.type) && f.size <= 10 * 1024 * 1024);
    setFiles(accepted);
    setMessage(accepted.length === selected.length
      ? `${accepted.length} file(s) selected.`
      : "Only PDF, JPEG, PNG or WebP files up to 10 MB each are accepted.");
    event.target.value = "";
  }

  return (
    <>
      <PageHeading eyebrow="ANALYSIS WORKSPACE" title="New analysis" description="Submit structured measurements or medical documents for server-side processing." />

      <form className="analysis-layout" onSubmit={handleSubmit}>
        <section className="content-panel">
          <div className="panel-heading"><div><h2>Analysis details</h2><p>Associate this analysis with a patient record.</p></div></div>

          <div className="form-grid">
            <label className="form-field full-width">Patient record
              <select required value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">Choose patient</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.patient_code || patient.display_name}</option>)}
              </select>
            </label>

            <label className="form-field full-width">Document type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {REPORT_TYPES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label className="form-field full-width">Clinical context / notes
              <textarea rows={4} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter relevant context for review. Avoid unnecessary identifying information." />
            </label>
          </div>

          <div className="upload-area">
            <Upload size={24} />
            <b>Attach clinical documents</b>
            <p>PDF, PNG, JPG or WebP · Maximum 10 MB per file</p>
            <label className="button button-secondary file-picker">Choose files
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleFileSelection} />
            </label>
            {files.map((file) => <div className="selected-file" key={`${file.name}-${file.size}`}><FileText size={15} /><span>{file.name}</span><button type="button" onClick={() => setFiles(files.filter((item) => item !== file))}><X size={15} /></button></div>)}
          </div>

          <div className="panel-subsection">
            <h3>Processing options</h3>
            <label className="toggle-row"><span><b>Run XGBoost model</b><small>Uses the inherited structured-feature model.</small></span><input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} /></label>
            {useModel && (
              <>
                <p className="muted">Complete all inputs using the exact feature definitions and category coding used during training.</p>
                <div className="form-grid feature-grid">
                  {fields.map(([key, label, min, max, step]) => <label className="form-field" key={key}>{label}<input type="number" required min={min} max={max} step={step} value={features[key]} onChange={(e) => setFeatures({ ...features, [key]: e.target.value })} /></label>)}
                </div>
              </>
            )}
            <label className="toggle-row"><span><b>Generate AI-assisted narrative</b><small>Requires a configured server-side AI provider and source evidence.</small></span><input type="checkbox" checked={generateAI} onChange={(e) => setGenerateAI(e.target.checked)} /></label>
          </div>

          {message && <div className="inline-alert">{message}</div>}
          <button className="button button-primary" type="submit" disabled={loading || patients.length === 0}>
            {loading ? <LoaderCircle className="spin" size={17} /> : <Activity size={17} />}
            {loading ? "Processing..." : "Run analysis"}
          </button>
          {patients.length === 0 && <p className="muted">Create a patient record before starting an analysis.</p>}
        </section>

        <aside className="content-panel analysis-aside">
          <span className="aside-icon"><ShieldCheck size={22} /></span>
          <h3>Clinical safeguards</h3>
          <p>Model output is not a confirmed diagnosis. A clinician must review the source data, model output and explanation.</p>
          <div className="aside-divider" />
          <h3>Before submitting</h3>
          <ul><li>Verify the selected patient.</li><li>Confirm units and feature coding.</li><li>Check uploaded documents contain the intended material.</li><li>Do not use this tool alone for treatment decisions.</li></ul>
        </aside>
      </form>
    </>
  );
}

function PatientsPage({ patients, onCreate, onAnalyze }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = patients.filter((p) =>
    `${p.patient_code || ""} ${p.display_name || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onCreate({ patient_code: code.trim(), display_name: name.trim() });
      setCode("");
      setName("");
      setShowForm(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="PATIENT MANAGEMENT" title="Patients" description="Create and manage patient records associated with your account." action={<button className="button button-primary" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Add patient</button>} />

      {showForm && <section className="content-panel form-panel"><div className="panel-heading"><div><h2>New patient record</h2><p>Prefer a pseudonymous code over direct identifiers.</p></div></div><form className="form-grid" onSubmit={submit}><label className="form-field">Patient code<input required maxLength={100} value={code} onChange={(e) => setCode(e.target.value)} /></label><label className="form-field">Display name<input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label><div className="form-actions"><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Save patient"}</button><button className="button button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>{message && <p className="error-text">{message}</p>}</form></section>}

      <section className="content-panel">
        <div className="table-toolbar"><div><h2>Patient records</h2><p>{patients.length} saved records</p></div><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients..." /></label></div>
        {filtered.length ? <div className="patient-list">{filtered.map((p) => <article className="patient-row" key={p.id}><span className="patient-avatar"><UserRound size={20} /></span><div className="patient-info"><b>{p.display_name}</b><span>{p.patient_code}</span></div><span className="patient-date">{dateLabel(p.created_at)}</span><button className="button button-secondary button-small" onClick={() => onAnalyze(p.id)}>New analysis <ArrowRight size={14} /></button></article>)}</div> : <EmptyState title="No matching patient records" text={patients.length ? "Try another search term." : "Add a patient record to begin. No demo patients are loaded."} />}
      </section>
    </>
  );
}

function HistoryPage({ reports, patients, onDownload }) {
  const [search, setSearch] = useState("");
  const filtered = reports.filter((r) => `${r.id} ${r.report_type || ""} ${r.patient_id || ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeading eyebrow="REPORT MANAGEMENT" title="Report history" description="Review persisted analyses and download their generated reports." />
      <section className="content-panel">
        <div className="table-toolbar"><div><h2>Saved reports</h2><p>{reports.length} saved analyses</p></div><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports..." /></label></div>
        <ReportTable reports={filtered} patients={patients} onDownload={onDownload} />
      </section>
    </>
  );
}

function ReportDetail({
  reports, patients, onDownload, onGenerateExplanation, onAnalyzeDocuments, loading,
}) {
  const reportId = Number(window.location.pathname.split("/").pop());
  const report = reports.find((r) => String(r.id) === String(reportId));
  const patient = patients.find((p) => String(p.id) === String(report?.patient_id));
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [documentFiles, setDocumentFiles] = useState([]);
  const [actionMessage, setActionMessage] = useState("");

  if (!report) return <EmptyState title="Report not found" text="The report may not exist or may not be available to this account." />;

  const narrative = report.ai_explanation || report.narrative || "";
  const contributions = Object.entries(report.feature_contributions || {})
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1]))).slice(0, 10);

  async function handleGenerateExplanation() {
    setActionMessage("");
    const ok = await onGenerateExplanation(report.id, clinicalNotes.trim());
    setActionMessage(ok ? "Gemini explanation saved." : "Explanation could not be generated. See the error message above.");
  }

  async function handleDocumentAnalysis(event) {
    event.preventDefault();
    setActionMessage("");
    if (!documentFiles.length) {
      setActionMessage("Choose at least one PDF or image document.");
      return;
    }
    const ok = await onAnalyzeDocuments(report.id, documentFiles, clinicalNotes.trim());
    if (ok) {
      setDocumentFiles([]);
      event.currentTarget.reset();
      setActionMessage("Document review saved to this report.");
    } else {
      setActionMessage("Document review failed. See the error message above.");
    }
  }

  function selectDocuments(event) {
    const selected = Array.from(event.target.files || []);
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    const accepted = selected.filter((file) => allowed.has(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024);
    setDocumentFiles(accepted.slice(0, 5));
    setActionMessage(accepted.length === selected.length && selected.length <= 5
      ? `${accepted.length} document(s) selected.`
      : "Choose up to 5 PDF, JPEG, PNG or WebP files, each no larger than 10 MB.");
  }

  return (
    <>
      <PageHeading eyebrow="REPORT DETAILS" title={idLabel(report.id)} description={`Created ${dateLabel(report.created_at)}`} action={<button className="button button-primary" onClick={() => onDownload(report.id)}><ArrowDownToLine size={17} /> Download PDF</button>} />
      <section className="content-panel">
        <div className="panel-heading"><div><h2>Analysis summary</h2><p>Patient: {patient?.patient_code || patient?.display_name || "Unavailable"}</p></div></div>
        <div className="report-summary-grid"><div><span>Model output</span><b>{report.predicted_class == null ? "Unavailable" : `Class ${report.predicted_class}`}</b></div><div><span>Model score</span><b>{Number.isFinite(Number(report.model_score)) ? `${(Number(report.model_score) * 100).toFixed(1)}%` : "Unavailable"}</b></div><div><span>AI narrative</span><b>{narrative ? "Available" : "Not generated"}</b></div></div>
        <div className="clinical-disclaimer"><ShieldCheck size={18} /><p><b>Interpretation limitation</b><br />A model output is not a confirmed diagnosis. Probability values are not necessarily calibrated clinical confidence.</p></div>
      </section>
      <section className="content-panel"><div className="panel-heading"><div><h2>Explainable AI contributions</h2><p>SHAP values show model behavior, not causation.</p></div></div>
        {contributions.length ? contributions.map(([key, value]) => <div className="shap-row" key={key}><span>{key.replaceAll("_", " ")}</span><div className="shap-track"><i className={Number(value) >= 0 ? "shap-positive" : "shap-negative"} style={{ width: `${Math.min(100, Math.abs(Number(value)) * 100)}%` }} /></div><b>{Number(value).toFixed(4)}</b></div>) : <EmptyState title="No feature contributions" text="The backend did not return SHAP contributions for this analysis." />}
      </section>

      <section className="content-panel report-ai-tools">
        <div className="panel-heading"><div><h2><BrainCircuit size={18} /> Gemini AI tools</h2><p>Generate a model explanation or review uploaded clinical documents for this saved report.</p></div></div>
        <label className="form-field">Optional clinical context
          <textarea rows={3} maxLength={10000} value={clinicalNotes} onChange={(event) => setClinicalNotes(event.target.value)} placeholder="Add context for the AI to consider. Avoid unnecessary identifying information." />
        </label>
        <div className="report-ai-actions">
          <button className="button button-primary" type="button" disabled={loading} onClick={handleGenerateExplanation}>
            <Sparkles size={16} /> {narrative ? "Regenerate model explanation" : "Generate model explanation"}
          </button>
        </div>
        <form onSubmit={handleDocumentAnalysis} className="document-review-form">
          <label className="form-field">Upload documents for AI review
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={selectDocuments} />
          </label>
          <p className="muted">PDF, JPEG, PNG or WebP · up to 5 files · 10 MB per file. Files are processed for this request and are not stored.</p>
          {documentFiles.length > 0 && <ul className="document-selection-list">{documentFiles.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
          <button className="button button-secondary" type="submit" disabled={loading || !documentFiles.length}>
            <FileText size={16} /> Analyze documents
          </button>
        </form>
        {actionMessage && <p className="ai-action-message" role="status">{actionMessage}</p>}
      </section>

      {narrative && <section className="content-panel"><div className="panel-heading"><div><h2><BrainCircuit size={18} /> AI-assisted narrative</h2><p>Generated content requires clinician review and is not a diagnosis.</p></div></div><div className="ai-narrative">{narrative}</div></section>}
    </>
  );
}

function SettingsPage({ user, onLogout }) {
  return (
    <>
      <PageHeading eyebrow="ACCOUNT" title="Settings" description="Account information and security." />
      <section className="content-panel settings-card">
        <div className="panel-heading"><div><h2>Signed-in account</h2><p>Details returned by the authenticated backend.</p></div></div>
        <div className="settings-row"><span>Email: </span><b>{user.email}</b></div>
        <div className="settings-row"><span>Role: </span><b>{user.role || "Not specified"}</b></div>
        <div className="settings-row"><span>Session: </span><b>Authenticated</b></div>
        <div className="form-actions"><button className="button button-secondary" onClick={onLogout}><LogOut size={16} /> Sign out</button></div>
      </section>
      <section className="content-panel"><div className="panel-heading"><div><h2>Clinical safety</h2><p>Important limitations for this application.</p></div></div><p className="muted">The inherited prediction model has not been clinically validated by this interface. AI-generated narratives must be grounded in verified source data and reviewed by a qualified clinician. Do not upload real patient data until security, privacy and compliance controls have been reviewed.</p></section>
    </>
  );
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><span className="empty-icon"><FileText size={23} /></span><h3>{title}</h3><p>{text}</p></div>;
}

function AuthPage({ onSubmit, loading, error }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");

  function submit(event) {
    event.preventDefault();
    const payload = { email, password };
    if (mode === "register") payload.invite_code = invite;
    onSubmit(payload, mode);
  }

  return (
    <div className="auth-page">
      <div className="auth-decoration"><span /><span /><span /></div>
      <div className="auth-card">
        <Brand />
        <div className="auth-heading"><span className="page-eyebrow">CARDIOLOGY WORKSPACE</span><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1><p>Secure access to your patient records and cardiac analyses.</p></div>
        <form className="auth-form" onSubmit={submit}>
          <label className="form-field">Email address<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="form-field">Password<input type="password" required minLength={mode === "register" ? 12 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />{mode === "register" && <small>Use at least 12 characters.</small>}</label>
          {mode === "register" && <label className="form-field">Registration invite code<input required value={invite} onChange={(e) => setInvite(e.target.value)} /></label>}
          {error && <p className="error-text">{error}</p>}
          <button className="button button-primary auth-submit" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin" /> : null}{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
        </form>
        <button className="text-button auth-switch" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Have an invite code? Create an account" : "Back to sign in"}</button>
        <p className="auth-footnote"><ShieldCheck size={14} /> Investigational decision support. Not a diagnosis.</p>
      </div>
    </div>
  );
}
