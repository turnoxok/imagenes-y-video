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

// Crear carpeta uploads si no existe
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configurar multer
const upload = multer({ dest: uploadDir });

// Configurar ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

app.post("/convert", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "logo", maxCount: 1 }
]), (req, res) => {

  if (!req.files || !req.files.video || !req.files.logo) {
    return res.status(400).send("Video y logo son obligatorios");
  }

  const videoFile = req.files.video[0].path;
  const logoFile = req.files.logo[0].path;

  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  // Coordenadas y tamaño del logo desde frontend
  const logoX = req.body.logoX || 20;
  const logoY = req.body.logoY || 20;
  const logoW = req.body.logoWidth || 250;
  const logoH = req.body.logoHeight || 250;

  // Escalar video a 1080x1350 manteniendo proporción y añadir logo
  const filters = [
    "scale=w=1080:h=1350:force_original_aspect_ratio=decrease",
    "pad=1080:1350:(1080-iw)/2:(1350-ih)/2:black",
    `[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`
  ];

  ffmpeg(videoFile)
    .input(logoFile)
    .complexFilter(filters)
    .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
    .on("start", cmd => console.log("FFmpeg command:", cmd))
    .on("stderr", stderr => console.log("FFmpeg stderr:", stderr))
    .on("end", () => {
      res.download(outputFile, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        fs.unlinkSync(logoFile);
        fs.unlinkSync(outputFile);
      });
    })
    .on("error", err => {
      console.error("Error en la conversión:", err);
      res.status(500).send("Error en la conversión");
    })
    .save(outputFile);
});

// Puerto Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
