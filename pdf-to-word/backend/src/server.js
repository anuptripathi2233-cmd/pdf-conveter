import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execFile } from "child_process";
import rateLimit from "express-rate-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, "..");
const uploadDir = path.join(backendDir, "uploads");
const pythonPath =
  process.env.PYTHON_PATH || path.join(backendDir, "venv", "bin", "python");
const scriptPath = path.join(backendDir, "convert.py");
fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 5002;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    exposedHeaders: ["Content-Disposition"],
  })
);
app.use(express.json());
// Max 10 conversions per IP every 15 minutes
const convertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many conversions. Please try again in a few minutes." },
});

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});

const safeDelete = (p) => fs.unlink(p, () => {});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/convert", convertLimiter, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const pdfPath = req.file.path;
  const docxPath = `${pdfPath}.docx`;
  const baseName = path.parse(req.file.originalname).name;

  execFile(
    pythonPath,
    ["-W", "ignore", scriptPath, pdfPath, docxPath],
    { timeout: 120000 }, // stop after 2 minutes
    (error) => {
      if (error) {
        console.error("Conversion failed:", error.message);
        safeDelete(pdfPath);
        safeDelete(docxPath);
        return res.status(500).json({ error: "Conversion failed. The PDF may be damaged or unsupported." });
      }

      res.download(docxPath, `${baseName}.docx`, () => {
        safeDelete(pdfPath);
        safeDelete(docxPath);
      });
    }
  );
});

// Error handler (file too large, wrong type, etc.)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File is too large (max 20 MB)" });
  }
  res.status(400).json({ error: err.message });
});

// Every 10 minutes, delete files older than 15 minutes
setInterval(() => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    files.forEach((f) => {
      const p = path.join(uploadDir, f);
      fs.stat(p, (err, stat) => {
        if (!err && Date.now() - stat.mtimeMs > 15 * 60 * 1000) {
          fs.unlink(p, () => {});
        }
      });
    });
  });
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});