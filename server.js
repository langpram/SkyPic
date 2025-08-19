import express from "express";
import multer from "multer";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ES modules setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cloudinary config - PENTING: Ganti dengan credentials lu!
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dnh5owdpa",
  api_key: process.env.CLOUDINARY_API_KEY || "733773516396716",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "fIKANfvSFrR3j1Ush1N_ud2xqMg",
});

const app = express();

// Middleware setup
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));

// Multer setup untuk serverless
const upload = multer({
  storage: multer.memoryStorage(), // Pake memory storage buat serverless
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Helper function buat crop gambar
async function cropToSquare(buffer) {
  return await sharp(buffer)
    .resize({ width: 500, height: 500, fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Routes
app.get("/", (req, res) => {
  res.render("index", { links: [], imageUrl: null, error: null });
});

app.post("/upload", upload.array("photos"), async (req, res) => {
  let links = [];
  let imageUrl = null;

  try {
    // 1. Handle file uploads
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Crop gambar dari memory buffer
          const croppedBuffer = await cropToSquare(file.buffer);

          // Upload ke Cloudinary dari buffer
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader
              .upload_stream(
                {
                  resource_type: "image",
                  transformation: [
                    { width: 500, height: 500, crop: "fill" },
                    { quality: "auto" },
                  ],
                },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              )
              .end(croppedBuffer);
          });

          links.push(result.secure_url);
          imageUrl = result.secure_url;
        } catch (err) {
          console.error("Error processing file:", err);
        }
      }
    }

    // 2. Handle URL uploads
    if (req.body.imageUrl && req.body.imageUrl.trim()) {
      try {
        const url = req.body.imageUrl.trim();

        // Download gambar dari URL
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 10000,
          maxContentLength: 10 * 1024 * 1024, // 10MB limit
        });

        // Crop gambar
        const croppedBuffer = await cropToSquare(Buffer.from(response.data));

        // Upload ke Cloudinary
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                resource_type: "image",
                transformation: [
                  { width: 500, height: 500, crop: "fill" },
                  { quality: "auto" },
                ],
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            )
            .end(croppedBuffer);
        });

        links.push(result.secure_url);
        imageUrl = result.secure_url;
      } catch (err) {
        console.error("Error processing URL:", err);
        return res.render("index", {
          links: [],
          imageUrl: null,
          error:
            "Error processing URL. Please check if the URL is valid and accessible.",
        });
      }
    }

    // Validation
    if (
      (!req.files || req.files.length === 0) &&
      (!req.body.imageUrl || !req.body.imageUrl.trim())
    ) {
      return res.render("index", {
        links: [],
        imageUrl: null,
        error: "Please select a file or enter an image URL.",
      });
    }

    res.render("index", { links, imageUrl, error: null });
  } catch (error) {
    console.error("Upload error:", error);
    res.render("index", {
      links: [],
      imageUrl: null,
      error: "An error occurred during upload. Please try again.",
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Export untuk Vercel
export default app;

// Local development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}
