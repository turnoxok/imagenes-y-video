// server.js (actualizado)
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

// Job store y clientes SSE
const jobStore = {};         // jobId -> { status, progress, outputFile, createdAt, error }
const progressClients = {};  // jobId -> res (SSE)

// SSE endpoint: el frontend se conecta a /progress/:jobId
app.get("/progress/:id", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const id = req.params.id;
  progressClients[id] = res;

  // Si ya hay progreso guardado, enviarlo inmediatamente
  if (jobStore[id] && typeof jobStore[id].progress !== "undefined") {
    res.write(`data: ${JSON.stringify({ percent: jobStore[id].progress })}\n\n`);
  }

  req.on("close", () => {
    if (progressClients[id]) {
      try { progressClients[id].end(); } catch (e) {}
      delete progressClients[id];
    }
  });
});

// Endpoint para descargar cuando el job esté listo
app.get("/download/:id", (req, res) => {
  const id = req.params.id;
  const job = jobStore[id];
  if (!job) return res.status(404).send("Job no encontrado");
  if (job.status !== "done") return res.status(202).send("Conversion no terminada");
  if (!job.outputFile || !fs.existsSync(job.outputFile)) return res.status(500).send("Archivo no disponible");

  // Enviamos el archivo
  res.download(job.outputFile, "video_final.mp4", (err) => {
    if (err) console.error("Error al enviar archivo:", err);
    else console.log(`Archivo ${job.outputFile} enviado for job ${id}`);
    // opcional: no borrar aquí inmediatamente; si querés limpiar, implementamos cleanup separado
  });
});

// Conversión: iniciamos ffmpeg y devolvemos jobId
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
  jobStore[jobId] = { status: "processing", progress: 0, outputFile: outputFile, createdAt: Date.now() };

  // Construir comando
  let command = ffmpeg(videoFile).outputOptions([
    "-c:v libx264",
    "-preset veryfast",
    "-profile:v baseline",
    "-level 3.0",
    "-pix_fmt yuv420p",
    "-b:v 2500k",
    "-c:a aac",
    "-b:a 128k",
    "-movflags +faststart"
  ]);

  if (logoFile) {
    command = command.input(logoFile)
      .complexFilter(`[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`);
  }

  command
    .on("progress", (progress) => {
      const pct = progress && progress.percent ? Math.round(progress.percent) : 0;
      jobStore[jobId].progress = pct;
      // enviar a cliente SSE si está conectado
      if (progressClients[jobId]) {
        try {
          progressClients[jobId].write(`data: ${JSON.stringify({ percent: pct })}\n\n`);
        } catch (e) { console.error("SSE write error:", e); }
      }
    })
    .on("end", () => {
      jobStore[jobId].status = "done";
      jobStore[jobId].progress = 100;
      console.log(`Conversion job ${jobId} finalizada`);
      if (progressClients[jobId]) {
        try {
          progressClients[jobId].write(`data: ${JSON.stringify({ end: true, percent: 100 })}\n\n`);
          progressClients[jobId].end();
        } catch (e) { console.error("SSE end error:", e); }
        delete progressClients[jobId];
      }
      // NOTA: no usamos res.download aquí. El frontend pedirá /download/:jobId cuando reciba end.
    })
    .on("error", (err) => {
      console.error("Error en la conversión:", err);
      jobStore[jobId].status = "error";
      jobStore[jobId].error = err.message || String(err);
      if (progressClients[jobId]) {
        try {
          progressClients[jobId].write(`data: ${JSON.stringify({ error: jobStore[jobId].error })}\n\n`);
          progressClients[jobId].end();
        } catch (e) {}
        delete progressClients[jobId];
      }
    })
    .save(outputFile);

  // Respondemos YA con jobId
  res.json({ jobId });
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
