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

// Multer
const upload = multer({ dest: uploadDir });

// FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Endpoint para convertir video + logo
app.post("/convert", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "logo", maxCount: 1 }
]), (req, res) => {
  if (!req.files || !req.files.video) return res.status(400).send("No se subió video");

  const videoFile = req.files.video[0].path;
  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  const logoFile = req.files.logo ? req.files.logo[0].path : null;
  const logoX = req.body.logoX || 20;
  const logoY = req.body.logoY || 20;
  const logoW = req.body.logoWidth || 250;
  const logoH = req.body.logoHeight || 250;

  const command = ffmpeg(videoFile).outputOptions([
    "-c:v libx264",
    "-c:a aac",
    "-movflags +faststart"
  ]);

  if (logoFile) {
    // Escalamos video + padding + overlay logo
    command.input(logoFile)
      .complexFilter([
        "scale=w=1080:h=1350:force_original_aspect_ratio=decrease",
        "pad=1080:1350:(1080-iw)/2:(1350-ih)/2:black",
        `[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`
      ]);
  } else {
    // Solo video con padding
    command.videoFilters([
      "scale=w=1080:h=1350:force_original_aspect_ratio=decrease",
      "pad=1080:1350:(1080-iw)/2:(1350-ih)/2:black"
    ]);
  }

  command
    .on("end", () => {
      res.download(outputFile, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        if (logoFile) fs.unlinkSync(logoFile);
        fs.unlinkSync(outputFile);
      });
    })
    .on("error", err => {
      console.error("FFmpeg error:", err);
      res.status(500).send("Error en la conversión");
    })
    .save(outputFile);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
