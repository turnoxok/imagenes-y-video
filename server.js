const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors()); // permite llamadas desde frontend

// Crear carpeta uploads si no existe
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configurar multer
const upload = multer({ dest: uploadDir });

// Configurar ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Endpoint para subir y convertir video
app.post("/convert", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).send("No se subió video");

  const input = req.file.path;
  const output = path.join(uploadDir, req.file.filename + ".mp4");

  ffmpeg(input)
  .outputOptions([
    "-c:v libx264",
    "-c:a aac"
  ])
  .on("end", () => {
    res.download(output, "video_final.mp4", () => {
      fs.unlinkSync(input);
      fs.unlinkSync(output);
    });
  })
  .on("error", (err) => {
    console.error(err);
    res.status(500).send("Error en la conversión");
  })
  .save(output);


// Puerto obligatorio para Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
