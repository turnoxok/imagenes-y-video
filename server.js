/* server.js */
const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);

app.post("/convert", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "logo", maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files || !req.files.video || !req.files.logo) {
      return res.status(400).send("Se requiere video y logo");
    }

    const videoFile = req.files.video[0].path;
    const logoFile = req.files.logo[0].path;
    const outputFile = path.join(uploadDir, `${req.files.video[0].filename}_final.mp4`);

    // parseo seguro
    const logoX = parseInt(req.body.logoX, 10) || 20;
    const logoY = parseInt(req.body.logoY, 10) || 20;
    const logoW = parseInt(req.body.logoWidth, 10) || 250;
    const logoH = parseInt(req.body.logoHeight, 10) || 250;

    console.log("Convert request:", { videoFile, logoFile, logoX, logoY, logoW, logoH, outputFile });

    // filter_complex:
    // 1) scale video to fit 1080x1350 keeping aspect ratio, then pad to exact 1080x1350
    // 2) scale logo to requested size
    // 3) overlay logo at given coords
    const filters = [
      // scale/pad video input (0:v)
      " [0:v]scale=w=1080:h=1350:force_original_aspect_ratio=decrease,pad=1080:1350:(1080-iw)/2:(1350-ih)/2:black[bg];",
      // scale logo input (1:v) and overlay onto bg
      `[1:v]scale=${logoW}:${logoH}[logo];`,
      `[bg][logo]overlay=${logoX}:${logoY}[outv]`
    ];

    // build ffmpeg command
    ffmpeg()
      .input(videoFile)
      .input(logoFile)
      .complexFilter(filters, "outv")
      .outputOptions([
        "-map [outv]",     // map composed video
        "-map 0:a?",       // map audio from first input if present
        "-c:v libx264",
        "-c:a aac",
        "-preset veryfast",
        "-crf 23"
      ])
      .on("start", cmd => console.log("FFmpeg start:", cmd))
      .on("progress", p => console.log("FFmpeg progress:", p))
      .on("error", err => {
        console.error("FFmpeg error:", err);
        // intentar limpiar archivos
        try { if (fs.existsSync(videoFile)) fs.unlinkSync(videoFile); } catch(e){}
        try { if (fs.existsSync(logoFile)) fs.unlinkSync(logoFile); } catch(e){}
        return res.status(500).send("Error en la conversión");
      })
      .on("end", () => {
        console.log("FFmpeg finished, sending:", outputFile);
        res.download(outputFile, "video_final.mp4", err => {
          // cleanup
          try { if (fs.existsSync(videoFile)) fs.unlinkSync(videoFile); } catch(e){}
          try { if (fs.existsSync(logoFile)) fs.unlinkSync(logoFile); } catch(e){}
          try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch(e){}
          if (err) console.error("res.download error:", err);
        });
      })
      .save(outputFile);

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).send("Error del servidor");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en ${PORT}`));
