const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors()); // permite llamadas desde Netlify
const upload = multer({ dest: "uploads/" });

ffmpeg.setFfmpegPath(ffmpegPath);

app.post("/convert", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).send("No se subió video");

  const input = req.file.path;
  const output = path.join("uploads", req.file.filename + ".mp4");

  ffmpeg(input)
    .outputOptions("-c:v libx264", "-c:a aac", "-movflags +faststart")
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
