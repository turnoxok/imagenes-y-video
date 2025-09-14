const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const upload = multer({ dest: uploadDir });
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// 🔹 almacenamiento de clientes SSE
const progressClients = {};

// SSE para progreso
app.get("/progress/:id", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
    });

    const id = req.params.id;
    progressClients[id] = res;

    req.on("close", () => {
        delete progressClients[id];
    });
});

// 🔹 conversión híbrida
app.post(
    "/convert",
    upload.fields([{ name: "video" }, { name: "logo" }]),
    (req, res) => {
        if (!req.files || !req.files.video) {
            return res.status(400).send("No se subió video");
        }

        const videoFile = req.files.video[0].path;
        const logoFile = req.files.logo ? req.files.logo[0].path : null;
        const jobId = Date.now().toString();
        const outputFile = path.join(outputDir, `${jobId}.mp4`);

        const logoX = parseInt(req.body.logoX) || 0;
        const logoY = parseInt(req.body.logoY) || 0;
        const logoW = parseInt(req.body.logoWidth) || 100;
        const logoH = parseInt(req.body.logoHeight) || 100;

        // 🔹 leer metadata con ffprobe-static
        ffmpeg.ffprobe(videoFile, (err, metadata) => {
            if (err) {
                console.error("Error leyendo metadata:", err);
                return res.status(500).send("Error leyendo video");
            }

            const videoStream = metadata.streams.find(s => s.codec_type === "video");
            let width = videoStream.width;
            let height = videoStream.height;

            // 🔹 definir resolución según tamaño
            let targetWidth = width;
            let targetHeight = height;

            if (height > 1080) {
                // muy grande → reducir a 720p
                const ratio = 720 / height;
                targetHeight = 720;
                targetWidth = Math.round(width * ratio);
            } else if (height > 720) {
                // mediano → limitar a 1080p
                targetHeight = Math.min(height, 1080);
                targetWidth = Math.round(width * (targetHeight / height));
            }

            // 🔹 configurar ffmpeg
            let command = ffmpeg(videoFile).outputOptions([
                "-c:v libx264",
                "-preset slow",
                "-crf 20",
                "-c:a aac",
                "-b:a 192k",
                "-movflags +faststart"
            ]).size(`${targetWidth}x${targetHeight}`);

            if (logoFile) {
                command = command.input(logoFile).complexFilter(
                    `[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`
                );
            }

            command
                .on("progress", (progress) => {
                    if (progressClients[jobId]) {
                        progressClients[jobId].write(`data: ${JSON.stringify(progress)}\n\n`);
                    }
                })
                .on("end", () => {
                    if (progressClients[jobId]) {
                        progressClients[jobId].write(`data: ${JSON.stringify({ end: true })}\n\n`);
                        progressClients[jobId].end();
                        delete progressClients[jobId];
                    }
                    fs.unlinkSync(videoFile);
                    if (logoFile) fs.unlinkSync(logoFile);
                })
                .on("error", (err) => {
                    console.error("Error en la conversión:", err);
                    if (progressClients[jobId]) {
                        progressClients[jobId].write(`data: ${JSON.stringify({ error: true })}\n\n`);
                        progressClients[jobId].end();
                        delete progressClients[jobId];
                    }
                })
                .save(outputFile);

            res.json({ jobId });
        });
    }
);

// 🔹 descarga con streaming
app.get("/download/:id", (req, res) => {
    const jobId = req.params.id;
    const filePath = path.join(outputDir, `${jobId}.mp4`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Archivo no encontrado" });
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", "attachment; filename=video_final.mp4");

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on("close", () => {
        fs.unlink(filePath, () => {});
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
