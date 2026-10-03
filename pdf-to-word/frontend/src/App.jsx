import { useState, useRef } from "react";
import axios from "axios";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const Lines = () => (
  <div className="lines">
    {[0, 1, 2, 3, 4, 5].map((n) => (
      <i key={n} style={{ "--i": n }} />
    ))}
  </div>
);

export default function App() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | uploading | converting | done
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    setError("");
    setStatus("idle");
    setProgress(0);
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("That isn't a PDF. Choose a file ending in .pdf.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError("That file is over 20 MB. Choose a smaller PDF.");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setError("");
  };

  const handleConvert = async () => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      setError("");
      setStatus("uploading");
      const res = await axios.post(`${API_URL}/api/convert`, formData, {
        responseType: "blob",
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded * 100) / e.total);
            setProgress(pct);
            if (pct === 100) setStatus("converting");
          }
        },
      });

      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "") + ".docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatus("done");
    } catch (err) {
      setStatus("idle");
      let message = "Could not reach the server. Check your connection and try again.";
      if (err.response?.data instanceof Blob) {
        try {
          message = JSON.parse(await err.response.data.text()).error || message;
        } catch {
          /* keep default message */
        }
      }
      setError(message);
    }
  };

  const busy = status === "uploading" || status === "converting";
  const flipped = status === "converting" || status === "done";

  return (
    <main className="page">
      <nav className="nav">
        <div className="logo"><span className="logo-mark" /> PDF2Word</div>
        <span className="pill">Free, no sign-up</span>
      </nav>

      <header className="hero">
        <h1>Turn any PDF into a Word file</h1>
        <p>Drop it in, wait a few seconds, edit it in Word. Your file is deleted right after.</p>
      </header>

      <section
        className={`stage ${status} ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => (busy ? e.preventDefault() : handleDrop(e))}
        onClick={() => !busy && status !== "done" && inputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current.click();
        }}
        aria-label="Choose a PDF"
      >
        <div className="scene">
          <div className={`sheet ${flipped ? "flipped" : ""}`}>
            <div className="face front">
              <span className="tag pdf">PDF</span>
              <Lines />
            </div>
            <div className="face back">
              <span className="tag docx">DOCX</span>
              <Lines />
            </div>
          </div>
          <svg className="check" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l8 8 14-16" />
          </svg>
        </div>

        <div className="caption">
          {status === "idle" && !file && (
            <>
              <strong>Drop a PDF here</strong>
              <span>or click to choose one. Up to 20 MB.</span>
            </>
          )}
          {status === "idle" && file && (
            <>
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB, ready to convert</span>
            </>
          )}
          {status === "uploading" && (
            <>
              <strong>Uploading {progress}%</strong>
              <span>{file.name}</span>
            </>
          )}
          {status === "converting" && (
            <>
              <strong>Rebuilding it as Word</strong>
              <span>Larger files can take a minute.</span>
            </>
          )}
          {status === "done" && (
            <>
              <strong>Your Word file has downloaded</strong>
              <span>Check your Downloads folder.</span>
            </>
          )}
        </div>

        <div className="bar" aria-hidden={status !== "uploading"}>
          <div className="bar-fill" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => pickFile(e.target.files[0])}
        />
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {status === "done" ? (
        <button className="btn" onClick={reset}>
          Convert another PDF
        </button>
      ) : (
        <button className="btn" disabled={!file || busy} onClick={handleConvert}>
          {busy ? (
            <>
              <span className="spinner" /> {status === "uploading" ? "Uploading" : "Converting"}
            </>
          ) : (
            "Convert to Word"
          )}
        </button>
      )}

      <ul className="chips">
        <li>Deleted after conversion</li>
        <li>Up to 20 MB</li>
        <li>Works on any device</li>
      </ul>

      <ol className="steps">
        <li><b>1</b><h3>Add your PDF</h3><p>Drag it in or pick it from your device.</p></li>
        <li><b>2</b><h3>We convert it</h3><p>Text, images and tables become editable Word content.</p></li>
        <li><b>3</b><h3>Download the .docx</h3><p>It saves automatically when the conversion finishes.</p></li>
      </ol>
    </main>
  );
}