const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());

// Crear carpeta uploads si no existe
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configurar multer
const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);

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

  let command = ffmpeg(videoFile)
    .size("1080x1350")        // fuerza formato 1080x1350
    .outputOptions(["-c:v libx264","-c:a aac"]);

  if (logoFile) {
    command = command.input(logoFile)
      .complexFilter([`[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`]);
  }

  command.on("end", () => {
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
