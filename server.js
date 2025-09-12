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

ffmpeg.setFfmpegPath(ffmpegPath);
const upload = multer({ dest: uploadDir });

// Endpoint para convertir video a MP4
app.post("/convert", upload.fields([{ name: "video", maxCount: 1 }, { name: "logo", maxCount: 1 }]), (req, res) => {
  if (!req.files || !req.files.video) return res.status(400).send("No se subió video");

  const videoFile = req.files.video[0].path;
  const logoFile = req.files.logo ? req.files.logo[0].path : null;
  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  // Si hay logo, lo sobreponemos; si no, solo convertimos a MP4
  let command = ffmpeg(videoFile)
    .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
    .size("1080x1350");

  if (logoFile) {
    command = command.input(logoFile)
      .complexFilter([`[0:v][1:v]overlay=${req.body.logoX || 20}:${req.body.logoY || 20}`]);
  }

  command
    .on("end", () => {
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
