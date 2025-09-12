const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json()); // para recibir coordenadas/tamaño del logo

// Crear carpeta uploads si no existe
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configurar multer
const upload = multer({ dest: uploadDir });

// Configurar ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Endpoint para subir y convertir video + logo
app.post("/convert", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "logo", maxCount: 1 }
]), (req, res) => {

  if (!req.files || !req.files.video) return res.status(400).send("No se subió video");

  const videoFile = req.files.video[0].path;
  const output = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  // Datos del logo enviados desde frontend
  const { logoX = 20, logoY = 20, logoWidth = 250, logoHeight = 250 } = req.body;

  let command = ffmpeg(videoFile).outputOptions(["-c:v libx264", "-c:a aac"]);

  if (req.files.logo && req.files.logo[0]) {
    const logoFile = req.files.logo[0].path;

    // Overlay con posición y tamaño
    command = command.input(logoFile)
      .complexFilter([
        `[1:v]scale=${logoWidth}:${logoHeight}[logo];[0:v][logo]overlay=${logoX}:${logoY}`
      ]);

    command.on("end", () => {
      res.download(output, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        fs.unlinkSync(logoFile);
        fs.unlinkSync(output);
      });
    })
    .on("error", (err) => {
      console.error(err);
      res.status(500).send("Error en la conversión");
    })
    .save(output);

  } else {
    // Si no hay logo, solo convertir
    command.on("end", () => {
      res.download(output, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        fs.unlinkSync(output);
      });
    })
    .on("error", (err) => {
      console.error(err);
      res.status(500).send("Error en la conversión");
    })
    .save(output);
  }

});

// Puerto obligatorio para Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
