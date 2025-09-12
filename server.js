const filters = [
  "scale=w=1080:h=1350:force_original_aspect_ratio=decrease",
  "pad=1080:1350:(1080-iw)/2:(1350-ih)/2:black"
];

const command = ffmpeg(videoFile).outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"]);

if (logoFile) {
  command.input(logoFile)
    .complexFilter([
      ...filters,
      `[1:v]scale=${logoW}:${logoH}[logo];[0:v][logo]overlay=${logoX}:${logoY}`
    ]);
} else {
  command.videoFilters(filters);
}

command.on("end", () => {
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
