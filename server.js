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

// --- 🔹 Almacenamos clientes de progreso
const progressClients = {};
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

app.post("/convert", upload.fields([{ name:"video", maxCount:1 }, { name:"logo", maxCount:1 }]), (req, res) => {
  if (!req.files || !req.files.video) return res.status(400).send("No se subió video");

  const videoFile = req.files.video[0].path;
  const logoFile = req.files.logo ? req.files.logo[0].path : null;
  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  const logoX = parseInt(req.body.logoX) || 0;
  const logoY = parseInt(req.body.logoY) || 0;
  const logoW = parseInt(req.body.logoWidth) || 100;
  const logoH = parseInt(req.body.logoHeight) || 100;

  const jobId = Date.now().toString();

  let command = ffmpeg(videoFile)
    .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"]);

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
        progressClients[jobId].write(`data: ${JSON.stringify({end:true})}\n\n`);
        progressClients[jobId].end();
        delete progressClients[jobId];
      }
      res.download(outputFile, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        if (logoFile) fs.unlinkSync(logoFile);
        fs.unlinkSync(outputFile);
      });
    })
    .on("error", (err) => {
      console.error("Error en la conversión:", err);
      res.status(500).send("Error en la conversión");
    })
    .save(outputFile);

  // 🔹 devolvemos el jobId al cliente
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ jobId }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
