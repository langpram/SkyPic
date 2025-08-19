import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";

// ES modules setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cloudinary config
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
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

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
          // Upload ke Cloudinary langsung dengan transformasi
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader
              .upload_stream(
                {
                  resource_type: "image",
                  // Pake Cloudinary transformation instead of Sharp
                  transformation: [
                    {
                      width: 500,
                      height: 500,
                      crop: "fill",
                      gravity: "center",
                    },
                    { quality: "auto:good" },
                    { format: "webp" }, // Convert to WebP for better compression
                  ],
                },
                (error, result) => {
                  if (error) {
                    console.error("Cloudinary upload error:", error);
                    reject(error);
                  } else {
                    resolve(result);
                  }
                }
              )
              .end(file.buffer);
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

        // Validate URL format
        try {
          new URL(url);
        } catch {
          throw new Error("Invalid URL format");
        }

        // Upload directly to Cloudinary from URL
        const result = await cloudinary.uploader.upload(url, {
          resource_type: "image",
          transformation: [
            { width: 500, height: 500, crop: "fill", gravity: "center" },
            { quality: "auto:good" },
            { format: "webp" },
          ],
        });

        links.push(result.secure_url);
        imageUrl = result.secure_url;
      } catch (err) {
        console.error("Error processing URL:", err);
        return res.render("index", {
          links: [],
          imageUrl: null,
          error:
            "Error processing URL. Please check if the URL is valid and points to an accessible image.",
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
      error:
        error.message || "An error occurred during upload. Please try again.",
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  });
});

// Handle multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.render("index", {
        links: [],
        imageUrl: null,
        error: "File too large. Please upload an image smaller than 10MB.",
      });
    }
  }
  next(error);
});

// Export untuk Vercel
export default app;

// Local development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 Views: ${path.join(__dirname, "views")}`);
    console.log(`📁 Public: ${path.join(__dirname, "public")}`);
  });
}
