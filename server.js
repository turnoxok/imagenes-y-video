const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);

// 🔹 Almacenamos estados por jobId
const jobs = {};
const progressClients = {};

// --- SSE progreso ---
app.get("/progress/:id", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const id = req.params.id;
  progressClients[id] = res;

  req.on("close", () => {
    delete progressClients[id];
  });
});

// --- convertir ---
app.post("/convert", upload.fields([{ name: "video", maxCount: 1 }, { name: "logo", maxCount: 1 }]), (req, res) => {
  if (!req.files || !req.files.video) return res.status(400).send("No se subió video");

  const videoFile = req.files.video[0].path;
  const logoFile = req.files.logo ? req.files.logo[0].path : null;
  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  const logoX = parseInt(req.body.logoX) || 0;
  const logoY = parseInt(req.body.logoY) || 0;
  const logoW = parseInt(req.body.logoWidth) || 100;
  const logoH = parseInt(req.body.logoHeight) || 100;

  const jobId = Date.now().toString();
  jobs[jobId] = { output: outputFile };

  let command = ffmpeg(videoFile).outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"]);

  if (logoFile) {
    command = command.input(logoFile)
      .complexFilter(`[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`);
  }

  command
    .on("progress", (progress) => {
      if (progressClients[jobId]) {
        progressClients[jobId].write(`data: ${JSON.stringify(progress)}\n\n`);
      }
    })
    .on("end", () => {
      if (progressClients[jobId]) {
        progressClients[jobId].write(`data: ${JSON.stringify({ end: true })}\n\n`);
        progressClients[jobId].end();
        delete progressClients[jobId];
      }
    })
    .on("error", (err) => {
      console.error("Error en la conversión:", err);
      if (progressClients[jobId]) {
        progressClients[jobId].write(`data: ${JSON.stringify({ error: true })}\n\n`);
        progressClients[jobId].end();
        delete progressClients[jobId];
      }
    })
    .save(outputFile);

  res.json({ jobId });
});

// --- descarga ---
app.get("/download/:id", (req, res) => {
  const id = req.params.id;
  const job = jobs[id];
  if (!job) return res.status(404).send("Job no encontrado");

  const outputFile = job.output;
  res.download(outputFile, "video_final.mp4", () => {
    // limpiar
    try { fs.unlinkSync(outputFile); } catch {}
    delete jobs[id];
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
