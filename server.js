const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // para recibir video base64 y parámetros

// Crear carpeta uploads si no existe
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

ffmpeg.setFfmpegPath(ffmpegPath);

// Endpoint para recibir canvas + logo y generar MP4
app.post("/convert", async (req, res) => {
  try {
    const { videoData, logoData, logoX = 20, logoY = 20, logoW = 250, logoH = 250 } = req.body;
    if (!videoData) return res.status(400).send("No se envió video");

    // Guardar video temporal
    const videoBuffer = Buffer.from(videoData.split(",")[1], "base64");
    const videoFile = path.join(uploadDir, `video_${Date.now()}.webm`);
    fs.writeFileSync(videoFile, videoBuffer);

    let command = ffmpeg(videoFile).outputOptions(["-c:v libx264", "-c:a aac"]);

    // Si hay logo
    if (logoData) {
      const logoBuffer = Buffer.from(logoData.split(",")[1], "base64");
      const logoFile = path.join(uploadDir, `logo_${Date.now()}.png`);
      fs.writeFileSync(logoFile, logoBuffer);

      command = command.input(logoFile)
        .complexFilter([`[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`]);
    }

    const output = path.join(uploadDir, `video_final_${Date.now()}.mp4`);

    command.on("end", () => {
      res.download(output, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        if (logoData) fs.unlinkSync(path.join(uploadDir, `logo_${Date.now()}.png`));
        fs.unlinkSync(output);
      });
    }).on("error", (err) => {
      console.error(err);
      res.status(500).send("Error en la conversión");
    }).save(output);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error del servidor");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
