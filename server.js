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

// Carpeta uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);

app.post("/convert", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "logo", maxCount: 1 }
]), (req, res) => {
  if (!req.files || !req.files.video) return res.status(400).send("No se subió video");

  const videoFile = req.files.video[0].path;
  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  // Logo opcional
  const logoFile = req.files.logo ? req.files.logo[0].path : null;
  const logoX = req.body.logoX || 20;
  const logoY = req.body.logoY || 20;
  const logoW = req.body.logoWidth || 250;
  const logoH = req.body.logoHeight || 250;

  // Base de filtros: escalar video a 1080x1350 manteniendo proporción y padding negro
  let filters = [
    "scale=w=1080:h=1350:force_original_aspect_ratio=decrease",
    "pad=1080:1350:(1080-iw)/2:(1350-ih)/2:black"
  ];

  const command = ffmpeg(videoFile);

  if (logoFile) {
    command.input(logoFile);
    // Overlay con posición y tamaño
    filters.push(`[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`);
  }

  command
    .complexFilter(filters)
    .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
    .on("end", () => {
      res.download(outputFile, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        if (logoFile) fs.unlinkSync(logoFile);
        fs.unlinkSync(outputFile);
      });
    })
    .on("error", (err) => {
      console.error(err);
      res.status(500).send("Error en la conversión");
    })
    .save(outputFile);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
