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
const outputDir = path.join(__dirname, "outputs");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);

// SSE para progreso
const progressClients = {};

app.get("/progress/:id", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const id = req.params.id;
  progressClients[id] = res;

  req.on("close", () => {
    delete progressClients[id];
  });
});

// Conversión simplificada y confiable
app.post("/convert", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).send("No se subió video");

  const videoFile = req.file.path;
  const jobId = Date.now().toString();
  const outputFile = path.join(outputDir, `${jobId}.mp4`);

  // ⚡ Escalamos manteniendo proporción, ancho automático
  ffmpeg(videoFile)
    .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
    .videoFilters("scale=-2:480") // siempre 480p, mantiene proporción
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
      fs.unlinkSync(videoFile);
    })
    .on("error", (err) => {
      console.error("Error en la conversión:", err);
      if (progressClients[jobId]) {
        progressClients[jobId].write(`data: ${JSON.stringify({ error: true })}\n\n`);
        progressClients[jobId].end();
        delete progressClients[jobId];
      }
      fs.unlinkSync(videoFile);
    })
    .save(outputFile);

  res.json({ jobId });
});

// Descarga
app.get("/download/:id", (req, res) => {
  const jobId = req.params.id;
  const filePath = path.join(outputDir, `${jobId}.mp4`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Archivo no encontrado" });
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", "attachment; filename=video_final.mp4");

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);

  stream.on("close", () => {
    fs.unlink(filePath, () => {});
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
