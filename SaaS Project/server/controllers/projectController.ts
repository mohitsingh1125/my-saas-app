import { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { prisma } from "../configs/prisma.js";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import { Readable } from "stream";

type AuthenticatedRequest = Request & {
  auth: () => { userId?: string };
  files?: any;
};

type PromptCategory =
  | "eyewear"
  | "fashion"
  | "beauty"
  | "tech"
  | "food"
  | "jewelry"
  | "general";

type PromptStylePreset =
  | "auto"
  | "ugc"
  | "luxury"
  | "cinematic"
  | "streetwear"
  | "minimal";

type PromptAdAngle =
  | "auto"
  | "premium"
  | "trend"
  | "problem-solution"
  | "lifestyle"
  | "comfort"
  | "giftable";

function normalizePromptText(value?: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanGeneratedPrompt(value: string): string {
  return normalizePromptText(value).replace(/^"(.*)"$/, "$1");
}

function normalizeStylePreset(value?: unknown): PromptStylePreset {
  const normalized = normalizePromptText(value).toLowerCase();

  if (
    normalized === "ugc" ||
    normalized === "luxury" ||
    normalized === "cinematic" ||
    normalized === "streetwear" ||
    normalized === "minimal"
  ) {
    return normalized;
  }

  return "auto";
}

function getStylePresetInstruction(stylePreset: PromptStylePreset): string {
  switch (stylePreset) {
    case "ugc":
      return "Keep the ad casual, relatable, creator-led, and native to TikTok or Reels.";
    case "luxury":
      return "Make the ad feel premium, elevated, refined, and aspirational.";
    case "cinematic":
      return "Use cinematic pacing, atmospheric camera direction, and dramatic visual storytelling.";
    case "streetwear":
      return "Make the ad feel bold, fashion-forward, youthful, and trend-aware.";
    case "minimal":
      return "Keep the ad clean, restrained, modern, and visually uncluttered.";
    default:
      return "Choose the most fitting ad style based on the product and description.";
  }
}

function normalizeAdAngle(value?: unknown): PromptAdAngle {
  const normalized = normalizePromptText(value).toLowerCase();

  if (
    normalized === "premium" ||
    normalized === "trend" ||
    normalized === "problem-solution" ||
    normalized === "lifestyle" ||
    normalized === "comfort" ||
    normalized === "giftable"
  ) {
    return normalized;
  }

  return "auto";
}

function getAdAngleInstruction(adAngle: PromptAdAngle): string {
  switch (adAngle) {
    case "premium":
      return "Sell the product through premium quality, refined details, and elevated desirability.";
    case "trend":
      return "Sell the product through trend appeal, social relevance, and fashion-forward energy.";
    case "problem-solution":
      return "Frame the product as a practical answer to a real everyday need or frustration.";
    case "lifestyle":
      return "Sell the product by showing the lifestyle, identity, and feeling the buyer wants.";
    case "comfort":
      return "Emphasize ease, comfort, wearability, and effortless daily use.";
    case "giftable":
      return "Position the product as thoughtful, memorable, and perfect for gifting.";
    default:
      return "Choose the strongest marketing angle based on the product and description.";
  }
}

function createSeed(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function pickVariant<T>(items: T[], seed: number, offset: number) {
  return items[(seed + offset) % items.length];
}

function detectPromptCategory(text: string): PromptCategory {
  const keywordMap: Record<PromptCategory, string[]> = {
    eyewear: ["sunglasses", "glasses", "frames", "lenses", "eyewear", "shades"],
    fashion: ["hoodie", "shirt", "dress", "jacket", "pants", "denim", "fashion", "wear"],
    beauty: ["serum", "skincare", "cream", "makeup", "beauty", "lotion", "glow"],
    tech: ["smart", "wireless", "speaker", "device", "charger", "headphones", "tech", "gadget"],
    food: ["drink", "snack", "coffee", "tea", "flavor", "food", "beverage", "bottle"],
    jewelry: ["watch", "ring", "necklace", "bracelet", "earrings", "jewelry", "gold", "silver"],
    general: [],
  };

  let bestCategory: PromptCategory = "general";
  let bestScore = 0;

  (Object.keys(keywordMap) as PromptCategory[]).forEach((category) => {
    const score = keywordMap[category].reduce(
      (total, keyword) => total + (text.includes(keyword) ? 1 : 0),
      0,
    );

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  });

  return bestCategory;
}

function extractFeatureLine(productDescription: string) {
  const parts = productDescription
    .split(/[,.!?]/)
    .map((part) => normalizePromptText(part))
    .filter(Boolean);

  return parts.slice(0, 2).join(", ");
}

function buildPromptFromDescription({
  productName,
  productDescription,
  aspectRatio,
  variation = 0,
  stylePreset = "auto",
  adAngle = "auto",
}: {
  productName?: unknown;
  productDescription?: unknown;
  aspectRatio?: unknown;
  variation?: number;
  stylePreset?: PromptStylePreset;
  adAngle?: PromptAdAngle;
}): string {
  const cleanProductName = normalizePromptText(productName);
  const cleanDescription = normalizePromptText(productDescription);
  const resolvedStylePreset = normalizeStylePreset(stylePreset);
  const resolvedAdAngle = normalizeAdAngle(adAngle);
  const combinedText = `${cleanProductName} ${cleanDescription}`.toLowerCase();
  const category = detectPromptCategory(combinedText);
  const seed = createSeed(
    `${combinedText}|${String(aspectRatio || "")}|${resolvedStylePreset}|${resolvedAdAngle}|${variation}`,
  );
  const orientation = String(aspectRatio || "").trim() === "16:9" ? "horizontal" : "vertical";
  const framing =
    String(aspectRatio || "").trim() === "16:9"
      ? "cinematic widescreen framing"
      : "mobile-first vertical framing";
  const featureLine = extractFeatureLine(cleanDescription);
  const styleInstruction = getStylePresetInstruction(resolvedStylePreset);
  const adAngleInstruction = getAdAngleInstruction(resolvedAdAngle);

  const categoryProfiles: Record<
    PromptCategory,
    {
      hooks: string[];
      scenes: string[];
      motions: string[];
      moods: string[];
      focus: string[];
    }
  > = {
    eyewear: {
      hooks: [
        "Create a stylish lifestyle ad that makes the eyewear feel premium and effortless.",
        "Build a fashion-forward sunglasses promo with a confident everyday vibe.",
        "Create a clean accessory campaign that feels modern, cool, and wearable.",
      ],
      scenes: [
        "Use warm outdoor light with a breezy lifestyle setting.",
        "Place the model in a polished street-style environment with natural sunlight.",
        "Keep the setting minimal and bright so the frames stand out immediately.",
      ],
      motions: [
        "Use subtle head turns, walking movement, and close-up lens detail shots.",
        "Mix slow walking shots with confident pose changes and hero close-ups.",
        "Use natural movement and gentle camera drift to show the frame shape clearly.",
      ],
      moods: ["confident", "elevated", "relaxed luxury"],
      focus: [
        "Highlight the frame shape, glossy finish, and dark lenses.",
        "Emphasize the sleek silhouette and premium everyday style.",
        "Show the sunglasses as a versatile fashion accessory for sunny days.",
      ],
    },
    fashion: {
      hooks: [
        "Create a fashion-focused promo that feels wearable, modern, and aspirational.",
        "Build a lifestyle apparel ad with a clean premium brand feel.",
        "Create a social-ready style video that makes the outfit look effortless.",
      ],
      scenes: [
        "Use natural outdoor movement and soft cinematic light.",
        "Keep the background simple and lifestyle-driven with premium editorial energy.",
        "Use an everyday environment that feels authentic but polished.",
      ],
      motions: [
        "Show walking shots, fabric movement, and natural body motion.",
        "Use slow turns, relaxed gestures, and flattering full-body framing.",
        "Mix hero shots with detailed texture moments and smooth camera motion.",
      ],
      moods: ["editorial", "confident", "clean streetwear"],
      focus: [
        "Highlight fit, material, and comfort.",
        "Emphasize texture, silhouette, and styling versatility.",
        "Show the product as modern, wearable, and easy to style.",
      ],
    },
    beauty: {
      hooks: [
        "Create a polished beauty ad that feels fresh, clean, and premium.",
        "Build a skincare-inspired promo with soft glow and elevated detail shots.",
        "Create a beauty campaign that feels smooth, modern, and trustworthy.",
      ],
      scenes: [
        "Use clean lighting and a minimal premium environment.",
        "Keep the visuals bright, soft, and elegant with a fresh beauty aesthetic.",
        "Use a clean studio-inspired look with luminous highlights.",
      ],
      motions: [
        "Focus on gentle hand movement, close-up product moments, and soft camera motion.",
        "Use slow, graceful motion with clean product hero angles.",
        "Mix portrait beauty shots with controlled close-ups of the product.",
      ],
      moods: ["fresh", "clean luxury", "radiant"],
      focus: [
        "Highlight texture, finish, and premium quality.",
        "Emphasize glow, self-care, and visible product elegance.",
        "Show the product as refined, effective, and premium.",
      ],
    },
    tech: {
      hooks: [
        "Create a sleek tech promo that feels smart, premium, and contemporary.",
        "Build a product ad with crisp modern energy and high-end presentation.",
        "Create a clean gadget commercial with confident minimal styling.",
      ],
      scenes: [
        "Use a sharp modern environment with controlled lighting.",
        "Keep the scene clean and premium with subtle futuristic energy.",
        "Place the product in a polished lifestyle-tech setting.",
      ],
      motions: [
        "Use smooth hero reveals, hand interaction, and precise camera movement.",
        "Mix clean close-ups with subtle rotation and product-first framing.",
        "Show the product with controlled movement and high-end commercial pacing.",
      ],
      moods: ["innovative", "premium", "minimal"],
      focus: [
        "Highlight sleek design, usability, and modern appeal.",
        "Emphasize smart details and premium build quality.",
        "Show the product as practical, stylish, and advanced.",
      ],
    },
    food: {
      hooks: [
        "Create an appetizing lifestyle promo that feels fresh and irresistible.",
        "Build a vibrant product ad with craveable, energetic styling.",
        "Create a social-first food campaign with feel-good visual appeal.",
      ],
      scenes: [
        "Use bright natural light and inviting lifestyle energy.",
        "Keep the scene fresh, clean, and upbeat with warm visual tone.",
        "Use a vibrant setting that makes the product feel immediately appealing.",
      ],
      motions: [
        "Show satisfying close-ups, natural hand interaction, and smooth camera motion.",
        "Mix lifestyle shots with clean hero product moments and appetizing details.",
        "Use dynamic movement that keeps the product feeling fresh and desirable.",
      ],
      moods: ["fresh", "playful premium", "energetic"],
      focus: [
        "Highlight flavor, freshness, and instant appeal.",
        "Emphasize texture, color, and everyday enjoyment.",
        "Show the product as delicious, convenient, and lifestyle-friendly.",
      ],
    },
    jewelry: {
      hooks: [
        "Create a refined accessory ad that feels elegant and premium.",
        "Build a luxury-inspired jewelry promo with graceful motion.",
        "Create a polished campaign that makes the accessory feel timeless and elevated.",
      ],
      scenes: [
        "Use soft luxury lighting and a clean upscale setting.",
        "Keep the visuals minimal, polished, and elegant.",
        "Use a refined lifestyle environment with premium styling.",
      ],
      motions: [
        "Focus on graceful hand movement, subtle turns, and sparkling close-ups.",
        "Mix detail shots with elegant portrait framing and smooth camera motion.",
        "Use controlled movement that highlights craftsmanship and shine.",
      ],
      moods: ["luxurious", "timeless", "elegant"],
      focus: [
        "Highlight shine, craftsmanship, and fine details.",
        "Emphasize the premium finish and timeless design.",
        "Show the accessory as refined, stylish, and gift-worthy.",
      ],
    },
    general: {
      hooks: [
        "Create a premium product promo that feels modern and social-media ready.",
        "Build a polished lifestyle ad with a clean, aspirational tone.",
        "Create a visually engaging commercial that makes the product feel desirable.",
      ],
      scenes: [
        "Use polished lighting and a clean lifestyle environment.",
        "Keep the setting simple, premium, and visually focused on the product.",
        "Use a lifestyle-driven backdrop with natural, commercial-quality light.",
      ],
      motions: [
        "Use natural movement, product-first framing, and smooth camera motion.",
        "Mix hero shots with subtle motion and detail-focused close-ups.",
        "Show the product clearly through clean movement and polished composition.",
      ],
      moods: ["modern", "premium", "aspirational"],
      focus: [
        "Highlight the product's best features and lifestyle appeal.",
        "Emphasize premium quality, ease of use, and visual appeal.",
        "Show the product as stylish, useful, and worth noticing.",
      ],
    },
  };

  const profile = categoryProfiles[category];
  const mood = pickVariant(profile.moods, seed, 1);
  const hook = pickVariant(profile.hooks, seed, 2);
  const scene = pickVariant(profile.scenes, seed, 3);
  const motion = pickVariant(profile.motions, seed, 4);
  const focus = featureLine
    ? `Feature details to emphasize: ${featureLine}.`
    : pickVariant(profile.focus, seed, 5);

  return [
    hook,
    cleanProductName
      ? `The product is ${cleanProductName}.`
      : "Keep the product as the clear hero of the video.",
    cleanDescription
      ? `Use this product context for accuracy: ${cleanDescription}.`
      : "Use the product image and styling cues to guide the final visuals.",
    focus,
    styleInstruction,
    adAngleInstruction,
    `${scene} Keep the overall tone ${mood}.`,
    `${motion} Use ${framing} in a ${orientation} format.`,
    "Make the final result feel natural, premium, and ready for a short-form ad.",
  ].join(" ");
}

async function generatePromptWithGroq({
  productName,
  productDescription,
  aspectRatio,
  targetLength,
  variation = 0,
  stylePreset = "auto",
  adAngle = "auto",
}: {
  productName?: unknown;
  productDescription?: unknown;
  aspectRatio?: unknown;
  targetLength?: unknown;
  variation?: number;
  stylePreset?: PromptStylePreset;
  adAngle?: PromptAdAngle;
}): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is missing from .env");
  }

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const cleanProductName = normalizePromptText(productName);
  const cleanDescription = normalizePromptText(productDescription);
  const cleanAspectRatio = normalizePromptText(aspectRatio) || "9:16";
  const resolvedStylePreset = normalizeStylePreset(stylePreset);
  const resolvedAdAngle = normalizeAdAngle(adAngle);
  const styleInstruction = getStylePresetInstruction(resolvedStylePreset);
  const adAngleInstruction = getAdAngleInstruction(resolvedAdAngle);
  const durationSeconds = Math.max(1, parseInt(String(targetLength), 10) || 5);

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      temperature: 0.9,
      max_completion_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You write high-converting prompts for AI image-to-video ads. Return only one polished prompt as a single paragraph. Do not use bullet points, labels, quotation marks, or extra explanation.",
        },
        {
          role: "user",
          content: [
            "Write a prompt for a short product promo video.",
            cleanProductName ? `Product name: ${cleanProductName}` : "",
            cleanDescription ? `Product description: ${cleanDescription}` : "",
            `Aspect ratio: ${cleanAspectRatio}`,
            `Target duration: ${durationSeconds} seconds`,
            `Style preset: ${resolvedStylePreset}`,
            `Ad angle: ${resolvedAdAngle}`,
            `Variation request number: ${variation + 1}`,
            "Keep the product clearly visible.",
            "Use natural model interaction and realistic commercial motion.",
            styleInstruction,
            adAngleInstruction,
            "Make this variation meaningfully different in tone, hook, and camera direction from previous versions.",
            "Keep it concise, vivid, and ready to send directly to an image-to-video model.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  const content = response.data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Groq returned an empty prompt");
  }

  return cleanGeneratedPrompt(content);
}

function formatAxiosError(err: any): string {
  const status = err?.response?.status;
  const statusText = err?.response?.statusText;
  const data = err?.response?.data;

  const parts: string[] = [];
  if (status) parts.push(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);

  if (typeof data === "string") {
    parts.push(data);
  } else if (data && typeof data === "object") {
    const dataMessage =
      (data as any).message ||
      (data as any).error ||
      (data as any).msg ||
      (data as any).detail;
    if (dataMessage && typeof dataMessage === "string") parts.push(dataMessage);
    else parts.push(JSON.stringify(data));
  }

  const baseMessage = err?.message;
  if (baseMessage && !parts.includes(baseMessage)) parts.push(baseMessage);

  return parts.filter(Boolean).join(" | ") || "Unknown error";
}

async function uploadImageBufferToCloudinary(
  buffer: Buffer,
): Promise<{ secureUrl: string; publicId: string }> {
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url)
          return reject(new Error("Cloudinary upload returned no secure_url"));
        if (!result.public_id)
          return reject(new Error("Cloudinary upload returned no public_id"));
        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      },
    );

    Readable.from(buffer).pipe(stream);
  });
}

function getLightXOutputDimensions(aspectRatio?: string): {
  width: number;
  height: number;
} {
  if (String(aspectRatio || "").trim() === "16:9") {
    return { width: 832, height: 448 };
  }

  return { width: 448, height: 832 };
}

function getFixedLightXImageUrl(publicId: string, aspectRatio?: string): string {
  const { width, height } = getLightXOutputDimensions(aspectRatio);

  return cloudinary.url(`${publicId}.png`, {
    secure: true,
    transformation: [
      {
        width,
        height,
        crop: "fill",
        gravity: "auto",
      },
    ],
  });
}

function looksLikeImage(buffer: Buffer): boolean {
  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return true;

  // JPEG
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return true;

  // GIF
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  )
    return true;

  // WebP (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return true;

  return false;
}

// =========================================================================
// LIGHTX + MAGIC HOUR DIRECT PIPELINE
// =========================================================================

export const createDirectVideo = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<any> => {
  let tempProjectId: string | undefined;
  const { userId } = req.auth();

  try {
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      name = "New Project",
      aspectRatio,
      userPrompt,
      productName,
      productDescription,
      stylePreset,
      adAngle,
      targetLength = 5,
      resolution = "480p",
      skipMagicHour,
    } = req.body;

    const files = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;
    const productFile = files?.productImage?.[0];
    const modelFile = files?.modelImage?.[0];

    if (!productFile || !modelFile || !productName) {
      return res
        .status(400)
        .json({
          message: "Please upload both Product Image and Model Image",
        });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const duration = parseInt(String(targetLength), 10) || 5;
    const plan = user.plan || "free";

    // Validate Tiers
    if (duration >= 20 && plan === "free") {
      return res.status(403).json({ message: "20s+ duration requires Pro or Premium plan" });
    }
    if (duration >= 30 && plan === "pro") {
      return res.status(403).json({ message: "30s duration requires Premium plan" });
    }
    if (resolution === "720p" && plan === "free") {
      return res.status(403).json({ message: "720p resolution requires Pro or Premium plan" });
    }
    if (resolution === "1080p" && (plan === "free" || plan === "pro")) {
      return res.status(403).json({ message: "1080p resolution requires Premium plan" });
    }

    // Determine Cost
    let creditCost = 10;
    if (duration === 10) creditCost = 20;
    if (duration >= 20) creditCost = 40;
    if (duration >= 30) creditCost = 50;

    if (user.credits < creditCost) {
      return res.status(401).json({ message: `Insufficient credits. This requires ${creditCost} credits.` });
    }

    const resolvedUserPrompt =
      normalizePromptText(userPrompt) ||
      buildPromptFromDescription({
        productName,
        productDescription,
        aspectRatio,
        stylePreset,
        adAngle,
      });

    // 1. Upload both images to Cloudinary so LightX can access them via URL
    const [productImageUrl, modelImageUrl] = await Promise.all([
      cloudinary.uploader
        .upload(productFile.path, { resource_type: "image" })
        .then((r) => r.secure_url),
      cloudinary.uploader
        .upload(modelFile.path, { resource_type: "image" })
        .then((r) => r.secure_url),
    ]);

    const uploadedImages = [productImageUrl, modelImageUrl];

    // 2. Create the project in the database
    const project = await prisma.project.create({
      data: {
        name,
        userId,
        productName,
        productDescription,
        userPrompt: resolvedUserPrompt,
        aspectRatio,
        targetLength: parseInt(targetLength as string) || 5,
        uploadedImages,
        isGenerating: true,
      },
    });

    tempProjectId = project.id;

    // 3. Immediately send response to frontend so it can start polling
    res.json({
      projectId: project.id,
      message: "Applying virtual try-on and generating video...",
    });

    // 4. Background Process for LightX -> Magic Hour
    (async () => {
      try {
        const lightxApiKey = process.env.LIGHTX_API_KEY;
        const mhApiKey = process.env.MAGIC_HOUR_API_KEY;

        if (!lightxApiKey)
          throw new Error("LightX API key is missing from .env");
        if (!mhApiKey)
          throw new Error("Magic Hour API key is missing from .env");

        const magicHourPrompt = resolvedUserPrompt;

        console.log(
          `[Project ${project.id}] Step 1: Running LightX virtual try-on...`,
        );

        // ==========================================
        // STEP A: LightX Virtual Try-On (With Polling)
        // ==========================================

        // STEP A: LightX AI Virtual Outfit Try-On (v2)
        // This module changes the model's clothing to match the uploaded outfit image.
        const lightxPayload = {
          imageUrl: modelImageUrl,
          styleImageUrl: productImageUrl,
        };

        const lightxResponse = await axios.post(
          "https://api.lightxeditor.com/external/api/v2/aivirtualtryon",
          lightxPayload,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": lightxApiKey,
            },
          },
        );

        console.log(
          "LightX Initial Response:",
          JSON.stringify(lightxResponse.data, null, 2),
        );

        // LightX can return { status: "FAIL", body: null, ... } (e.g. credits exhausted)
        const lightxData = lightxResponse.data;
        if (
          lightxData?.status &&
          typeof lightxData.status === "string" &&
          lightxData.status.toUpperCase() === "FAIL"
        ) {
          const statusCode =
            lightxData.statusCode != null ? String(lightxData.statusCode) : "";
          const message =
            typeof lightxData.message === "string" ? lightxData.message : "";
          const description =
            typeof lightxData.description === "string"
              ? lightxData.description
              : "";
          throw new Error(
            [
              "LightX request failed",
              statusCode ? `(${statusCode})` : "",
              message,
              description,
            ]
              .filter(Boolean)
              .join(" "),
          );
        }

        // 1. Extract orderId if present; some v2 endpoints may also return output directly.
        const directOutputUrl =
          lightxData?.body?.output ||
          lightxData?.body?.imageUrl ||
          lightxData?.output ||
          lightxData?.imageUrl;

        const orderId = lightxData?.body?.orderId || lightxData?.orderId;

        let isLightXDone = false;
        let tryOnImageUrl = null;

        if (directOutputUrl) {
          isLightXDone = true;
          tryOnImageUrl = directOutputUrl;
        } else if (orderId) {
          // 2. Poll LightX until the image is ready
          while (!isLightXDone) {
            console.log("Waiting for LightX image to render...");
            await new Promise((resolve) => setTimeout(resolve, 5000)); // wait 5 seconds

            const statusResponse = await axios.post(
              "https://api.lightxeditor.com/external/api/v1/order-status",
              { orderId: orderId },
              {
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": lightxApiKey,
                },
              },
            );

            const statusData = statusResponse.data.body;
            console.log("LightX Status:", statusData?.status);

            // LightX uses "active" to mean DONE
            if (
              statusData?.status === "active" ||
              statusData?.status === "completed"
            ) {
              isLightXDone = true;
              tryOnImageUrl = statusData?.output || statusData?.imageUrl;
            } else if (
              statusData?.status === "failed" ||
              statusData?.status === "error"
            ) {
              throw new Error(
                "LightX image generation failed during processing.",
              );
            }
          }
        } else {
          throw new Error(
            "LightX did not return an output URL or orderId. Check LightX response.",
          );
        }

        if (!tryOnImageUrl)
          throw new Error("LightX finished but returned no image URL.");

        // Fetch LightX output bytes and re-host on Cloudinary.
        // This avoids broken/ephemeral URLs and ensures we store a real image.
        const lightxImageResp = await axios.get(tryOnImageUrl, {
          responseType: "arraybuffer",
          validateStatus: () => true,
        });
        const contentType =
          String(lightxImageResp.headers?.["content-type"] || "").toLowerCase();
        const buffer = Buffer.from(lightxImageResp.data);
        if (lightxImageResp.status < 200 || lightxImageResp.status >= 300) {
          throw new Error(
            `LightX output download failed (HTTP ${lightxImageResp.status}).`,
          );
        }
        // Some providers return images as application/octet-stream.
        // Accept if the bytes look like a real image.
        if (!contentType.startsWith("image/") && !looksLikeImage(buffer)) {
          throw new Error(
            `LightX output is not an image (content-type: ${contentType || "unknown"}).`,
          );
        }

        const uploadedLightXImage = await uploadImageBufferToCloudinary(buffer);
        const hostedTryOnImageUrl = getFixedLightXImageUrl(
          uploadedLightXImage.publicId,
          project.aspectRatio || aspectRatio,
        );

        // Save the LightX output so the frontend can download/show it.
        await prisma.project.update({
          where: { id: project.id },
          data: {
            generatedImage: hostedTryOnImageUrl,
          },
        });

        // Optionally stop here to avoid spending MagicHour credits.
        const shouldSkipMagicHour =
          String(skipMagicHour ?? process.env.SKIP_MAGIC_HOUR ?? "")
            .toLowerCase()
            .trim() === "true";
        if (shouldSkipMagicHour) {
          await prisma.project.update({
            where: { id: project.id },
            data: { isGenerating: false },
          });
          console.log(
            `[Project ${project.id}] ⏸️ Skipped MagicHour (LightX image saved).`,
          );
          return;
        }

        // ==========================================
        // STEP B: Magic Hour Video Generation
        // ==========================================
        const mhPayload: any = {
          assets: {
            // Docs allow direct URL or uploaded file_path
            image_file_path: hostedTryOnImageUrl,
          },
          name: `Project ${project.id}`,
          end_seconds: Math.max(
            1,
            parseInt(String(targetLength), 10) || 5,
          ),
          model: "ltx-2",
          resolution: resolution || "480p",
        };

        // MagicHour prompt - only send if user provided one (no defaults).
        if (magicHourPrompt) {
          mhPayload.style = { prompt: magicHourPrompt };
        }

        const mhInitialResponse = await axios.post(
          "https://api.magichour.ai/v1/image-to-video",
          mhPayload,
          {
            headers: {
              Authorization: `Bearer ${mhApiKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        const mhVideoId = mhInitialResponse.data.id;
        let isDone = false;
        let finalVideoUrl = null;

        // Poll Magic Hour every 10 seconds
        while (!isDone) {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          const mhStatusResponse = await axios.get(
            `https://api.magichour.ai/v1/video-projects/${mhVideoId}`,
            { headers: { Authorization: `Bearer ${mhApiKey}` } },
          );

          const status = mhStatusResponse.data.status;

          if (status === "complete") {
            isDone = true;
            // downloads is an array of { url, expires_at }
            finalVideoUrl =
              mhStatusResponse.data.downloads?.[0]?.url ||
              mhStatusResponse.data.download?.url;
          } else if (
            status === "error" ||
            status === "canceled"
          ) {
            throw new Error(
              `Magic Hour generation failed with status: ${status}`,
            );
          }
        }

        // ==========================================
        // STEP C: Final Database Update
        // ==========================================
        if (finalVideoUrl) {
          await prisma.project.update({
            where: { id: project.id },
            data: {
              generatedVideo: finalVideoUrl,
              isGenerating: false,
            },
          });

          // Deduct credits only after success
          await prisma.user.update({
            where: { id: userId },
            data: { credits: { decrement: creditCost } },
          });
          console.log(`[Project ${project.id}] ✅ Pipeline complete!`);
        } else {
          throw new Error("Magic Hour completed but returned no video URL.");
        }
      } catch (bgError: any) {
        const errorMessage = formatAxiosError(bgError);
        console.error(
          "Background Pipeline Error:",
          bgError.response?.data || bgError.message,
        );
        if (bgError?.response?.status) {
          console.error("Background Pipeline Status:", bgError.response.status);
        }

        if (tempProjectId) {
          await prisma.project.update({
            where: { id: tempProjectId },
            data: { isGenerating: false, error: errorMessage },
          });
        }
      }
    })();
  } catch (error: any) {
    if (tempProjectId) {
      await prisma.project.update({
        where: { id: tempProjectId },
        data: { isGenerating: false, error: error.message },
      });
    }

    Sentry.captureException(error);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};

export const generatePromptSuggestion = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<any> => {
  try {
    const { userId } = req.auth();

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      productName,
      productDescription,
      aspectRatio,
      stylePreset,
      adAngle,
      targetLength = 5,
      variation = 0,
      count = 1,
    } = req.body;

    if (!normalizePromptText(productName) && !normalizePromptText(productDescription)) {
      return res.status(400).json({
        message: "Please add a product name or product description first",
      });
    }

    const numericVariation = Number.isFinite(Number(variation))
      ? Number(variation)
      : 0;
    const promptCount = Math.min(3, Math.max(1, Number(count) || 1));
    const resolvedStylePreset = normalizeStylePreset(stylePreset);

    const fallbackPrompts = Array.from({ length: promptCount }, (_, index) =>
      buildPromptFromDescription({
        productName,
        productDescription,
        aspectRatio,
        stylePreset: resolvedStylePreset,
        adAngle,
        variation: numericVariation + index,
      }),
    );

    try {
      const prompts = await Promise.all(
        Array.from({ length: promptCount }, (_, index) =>
          generatePromptWithGroq({
            productName,
            productDescription,
            aspectRatio,
            stylePreset: resolvedStylePreset,
            adAngle,
            targetLength,
            variation: numericVariation + index,
          }),
        ),
      );

      return res.json({
        prompt: prompts[0],
        prompts,
        source: "groq",
      });
    } catch (groqError: any) {
      console.error(
        "Groq prompt generation failed, using local fallback:",
        groqError?.response?.data || groqError?.message || groqError,
      );

      return res.json({
        prompt: fallbackPrompts[0],
        prompts: fallbackPrompts,
        source: "local",
      });
    }
  } catch (error: any) {
    Sentry.captureException(error);
    return res.status(500).json({ message: error.message });
  }
};

// =========================================================================
// UTILITY ROUTES (Kept intact)
// =========================================================================

export const getAllPublishedProjects = async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { isPublished: true },
    });
    res.json({ projects });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteProject = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<any> => {
  try {
    const { userId } = req.auth();
    const projectId = req.params.projectId as string;

    const project = await prisma.project.findUnique({
      where: { id: projectId, userId },
    });

    if (!project) {
      return res.status(404).json({ message: "project not found" });
    }

    await prisma.project.delete({
      where: { id: projectId },
    });

    res.json({ message: "Project deleted" });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(500).json({ message: error.message });
  }
};
