const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

// 🔥 CORS explícito para tu frontend en Netlify
app.use(cors({
  origin: "https://cmanagerpro.netlify.app", // el dominio de tu frontend
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);

app.post("/convert", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "logo", maxCount: 1 }
]), (req, res) => {
  if (!req.files || !req.files.video || !req.files.logo) {
    return res.status(400).send("Debe subir un video y un logo");
  }

  const videoFile = req.files.video[0].path;
  const logoFile = req.files.logo[0].path;
  const outputFile = path.join(uploadDir, req.files.video[0].filename + "_final.mp4");

  const logoX = req.body.logoX || 20;
  const logoY = req.body.logoY || 20;
  const logoW = req.body.logoWidth || 250;
  const logoH = req.body.logoHeight || 250;

  // 🎥 Filtros: video siempre 1080x1350, manteniendo proporciones
  const filters = [
    {
      filter: "scale",
      options: { w: 1080, h: 1350, force_original_aspect_ratio: "decrease" }
    },
    {
      filter: "pad",
      options: { w: 1080, h: 1350, x: "(1080-iw)/2", y: "(1350-ih)/2", color: "black" }
    },
    {
      filter: "overlay",
      options: { x: logoX, y: logoY },
      inputs: ["0:v", "1:v"],
      outputs: "final"
    }
  ];

  ffmpeg(videoFile)
    .input(logoFile)
    .complexFilter(filters, "final")
    .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
    .on("end", () => {
      res.download(outputFile, "video_final.mp4", () => {
        fs.unlinkSync(videoFile);
        fs.unlinkSync(logoFile);
        fs.unlinkSync(outputFile);
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err.message);
      res.status(500).send("Error en la conversión");
    })
    .save(outputFile);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
