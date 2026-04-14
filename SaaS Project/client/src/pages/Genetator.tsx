import React, { useState, useEffect } from "react";
import Title from "../components/Title";
import UploadZone from "../components/UploadZone";
import {
  Loader2Icon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";
import { GhostButton, PrimaryButton } from "../components/Buttons";
import { motion } from "framer-motion";
import { useAuth, useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../configs/axios";

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

const promptStyleOptions: Array<{
  value: PromptStylePreset;
  label: string;
  hint: string;
}> = [
  { value: "auto", label: "Auto", hint: "Let the app choose the best style" },
  { value: "ugc", label: "UGC", hint: "Casual creator-style ad" },
  { value: "luxury", label: "Luxury", hint: "Premium polished campaign" },
  { value: "cinematic", label: "Cinematic", hint: "More dramatic storytelling" },
  { value: "streetwear", label: "Streetwear", hint: "Bold trend-forward vibe" },
  { value: "minimal", label: "Minimal", hint: "Clean modern simplicity" },
];

const durationOptions = [5, 10, 20, 30];
const resolutionOptions = ["480p", "720p", "1080p"];

const adAngleOptions: Array<{
  value: PromptAdAngle;
  label: string;
  hint: string;
}> = [
  { value: "auto", label: "Auto", hint: "Pick the strongest sales angle" },
  { value: "premium", label: "Premium", hint: "Sell quality and polish" },
  { value: "trend", label: "Trend", hint: "Sell hype and social appeal" },
  { value: "problem-solution", label: "Problem Solver", hint: "Sell utility and need" },
  { value: "lifestyle", label: "Lifestyle", hint: "Sell the vibe and identity" },
  { value: "comfort", label: "Comfort", hint: "Sell ease and wearability" },
  { value: "giftable", label: "Giftable", hint: "Sell present-worthy appeal" },
];

function normalizePromptText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeStylePreset(value?: string): PromptStylePreset {
  if (
    value === "ugc" ||
    value === "luxury" ||
    value === "cinematic" ||
    value === "streetwear" ||
    value === "minimal"
  ) {
    return value;
  }

  return "auto";
}

function getStylePresetInstruction(stylePreset: PromptStylePreset) {
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

function normalizeAdAngle(value?: string): PromptAdAngle {
  if (
    value === "premium" ||
    value === "trend" ||
    value === "problem-solution" ||
    value === "lifestyle" ||
    value === "comfort" ||
    value === "giftable"
  ) {
    return value;
  }

  return "auto";
}

function getAdAngleInstruction(adAngle: PromptAdAngle) {
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
  variation,
  stylePreset,
  adAngle,
}: {
  productName: string;
  productDescription: string;
  aspectRatio: string;
  variation: number;
  stylePreset: PromptStylePreset;
  adAngle: PromptAdAngle;
}) {
  const cleanProductName = normalizePromptText(productName);
  const cleanDescription = normalizePromptText(productDescription);
  const resolvedStylePreset = normalizeStylePreset(stylePreset);
  const resolvedAdAngle = normalizeAdAngle(adAngle);
  const combinedText = `${cleanProductName} ${cleanDescription}`.toLowerCase();
  const category = detectPromptCategory(combinedText);
  const seed = createSeed(
    `${combinedText}|${aspectRatio}|${resolvedStylePreset}|${resolvedAdAngle}|${variation}`,
  );
  const orientation = aspectRatio === "16:9" ? "horizontal" : "vertical";
  const framing =
    aspectRatio === "16:9"
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

const Genetator = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [modelImage, setModelImage] = useState<File | null>(null);
  const [stylePreset, setStylePreset] = useState<PromptStylePreset>("auto");
  const [adAngle, setAdAngle] = useState<PromptAdAngle>("auto");
  const [targetLength, setTargetLength] = useState(5);
  const [resolution, setResolution] = useState("480p");
  const [userPlan, setUserPlan] = useState("free");
  const [userPrompt, setUserPrompt] = useState("");
  const [promptOptions, setPromptOptions] = useState<string[]>([]);
  const [promptVariation, setPromptVariation] = useState(0);
  const [isPromptGenerating, setIsPromptGenerating] = useState(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const token = await getToken();
        if (token) {
          const { data } = await api.get("/api/user/credits", {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUserPlan(data.plan || "free");
        }
      } catch (e) {
        console.error(e);
      }
    };
    if (user) fetchPlan();
  }, [user, getToken]);

  const getCreditCost = () => {
    if (targetLength === 5) return 10;
    if (targetLength === 10) return 20;
    if (targetLength === 20) return 40;
    if (targetLength === 30) return 50;
    return 10;
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "product" | "model",
  ) => {
    if (e.target.files && e.target.files[0]) {
      if (type === "product") setProductImage(e.target.files[0]);
      else setModelImage(e.target.files[0]);
    }
  };

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return toast("Please login to generate");
    if (!productImage || !modelImage || !name || !productName || !aspectRatio)
      return toast("Please fill all the required fields");

    const cost = getCreditCost();
    const confirmed = window.confirm(`Generate this ${targetLength}s video in ${resolution}? It will cost ${cost} credits.`);
    if (!confirmed) return;

    try {
      setIsGenerating(true);
      const formData = new FormData();

      formData.append("name", name);
      formData.append("productName", productName);
      formData.append("productDescription", productDescription);
      formData.append("userPrompt", userPrompt);
      formData.append("aspectRatio", aspectRatio);
      formData.append("stylePreset", stylePreset);
      formData.append("adAngle", adAngle);
      formData.append("targetLength", String(targetLength));
      formData.append("resolution", resolution);
      formData.append("productImage", productImage);
      formData.append("modelImage", modelImage);

      const token = await getToken();

      // UPDATED: Pointing to a new endpoint designed for direct Magic Hour video generation
      const { data } = await api.post(
        "/api/project/create-direct-video",
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      toast.success("Video generation started!");
      navigate("/result/" + data.projectId);
    } catch (error: unknown) {
      setIsGenerating(false);
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast.error(err?.response?.data?.message || err?.message || "Generation failed");
    }
  };

  const handleGeneratePrompt = async () => {
    if (!productDescription.trim()) {
      toast.error("Add a product description first");
      return;
    }

    const fallbackPrompts = Array.from({ length: 3 }, (_, index) =>
      buildPromptFromDescription({
        productName,
        productDescription,
        aspectRatio,
        stylePreset,
        adAngle,
        variation: promptVariation + index,
      }),
    );

    if (!user) {
      setPromptOptions(fallbackPrompts);
      setPromptVariation((current) => current + 3);
      toast("Login to use AI prompt generation. I prepared 3 local prompt buttons instead.");
      return;
    }

    try {
      setIsPromptGenerating(true);
      const token = await getToken();

      const { data } = await api.post(
        "/api/project/generate-prompt",
        {
          productName,
          productDescription,
          aspectRatio,
          stylePreset,
          adAngle,
          targetLength,
          variation: promptVariation,
          count: 3,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const prompts =
        Array.isArray(data.prompts) && data.prompts.length > 0
          ? data.prompts
          : fallbackPrompts;

      setPromptOptions(prompts);
      setPromptVariation((current) => current + prompts.length);

      if (data.source === "groq") {
        toast.success(
          promptVariation === 0
            ? "3 AI prompt buttons are ready"
            : "3 new AI prompt buttons are ready",
        );
      } else {
        toast("Groq is unavailable right now, so I prepared 3 local prompt buttons instead.");
      }
    } catch (error) {
      setPromptOptions(fallbackPrompts);
      setPromptVariation((current) => current + 3);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Prompt API failed, so 3 local prompt buttons were prepared instead.",
      );
    } finally {
      setIsPromptGenerating(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen text-white p-6 md:p-12 mt-28"
      initial={{ opacity: 0, y: -60, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <form onSubmit={handleGenerate} className="max-w-6xl mx-auto mb-40">
        <Title
          heading="Create In-Context Video"
          description="Upload your model and product images to generate stunning UGC, short-form videos and social media posts directly."
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-10">
          {/* Main Column */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Card 1: Project Details */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">Project Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="text-gray-300">
                  <label htmlFor="name" className="block text-sm mb-3">
                    Project Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name your project"
                    required
                    className="w-full bg-white/3 rounded-lg border-2 p-4 text-sm border-violet-200/10 focus:border-violet-500/50 outline-none transition-all"
                  />
                </div>
                <div className="text-gray-300">
                  <label htmlFor="productName" className="block text-sm mb-3">
                    Product Name
                  </label>
                  <input
                    type="text"
                    id="productName"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Enter the name of the product"
                    required
                    className="w-full bg-white/3 rounded-lg border-2 p-4 text-sm border-violet-200/10 focus:border-violet-500/50 outline-none transition-all"
                  />
                </div>
                <div className="text-gray-300 sm:col-span-2">
                  <label
                    htmlFor="productDescription"
                    className="block text-sm mb-3"
                  >
                    Product Description{" "}
                    <span className="text-xs text-violet-400">(optional)</span>
                  </label>
                  <textarea
                    id="productDescription"
                    rows={4}
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="Enter the description of the product"
                    className="w-full bg-white/3 rounded-lg border-2 p-4 text-sm border-violet-200/10 focus:border-violet-500/50 outline-none resize-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Creative Strategy */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">Creative Strategy</h2>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row flex-wrap gap-6">
                  <div className="text-gray-300 flex-1 min-w-[200px]">
                    <label className="block text-sm mb-3">Aspect Ratio</label>
                    <div className="flex gap-3">
                      <RectangleVerticalIcon
                        onClick={() => setAspectRatio("9:16")}
                        className={`p-3 size-14 rounded-lg transition-all ring-2 ring-transparent cursor-pointer ${aspectRatio === "9:16" ? "ring-violet-500/60 bg-violet-500/10 text-white" : "bg-white/5 hover:bg-white/10"}`}
                      />
                      <RectangleHorizontalIcon
                        onClick={() => setAspectRatio("16:9")}
                        className={`p-3 size-14 rounded-lg transition-all ring-2 ring-transparent cursor-pointer ${aspectRatio === "16:9" ? "ring-violet-500/60 bg-violet-500/10 text-white" : "bg-white/5 hover:bg-white/10"}`}
                      />
                    </div>
                  </div>

                  <div className="text-gray-300 flex-1 min-w-[280px]">
                    <label className="block text-sm mb-3">Video Duration</label>
                    <div className="flex gap-3 flex-wrap">
                      {durationOptions.map((duration) => {
                        const isLocked = (duration >= 20 && userPlan === "free") || (duration >= 30 && userPlan === "pro");
                        return (
                        <button
                          key={duration}
                          type="button"
                          disabled={isLocked}
                          onClick={() => setTargetLength(duration)}
                          className={`rounded-lg border px-4 py-3 text-sm font-medium transition-all flex items-center gap-1 ${
                            isLocked ? "opacity-40 cursor-not-allowed border-white/5 bg-white/5" :
                            targetLength === duration
                              ? "border-violet-500/60 bg-violet-500/10 text-white"
                              : "border-white/10 bg-white/3 text-gray-300 hover:bg-white/6"
                          }`}
                        >
                          {duration}s {isLocked && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-black/40 text-gray-400">{duration >= 30 ? "Premium" : "Pro"}</span>}
                        </button>
                      )})}
                    </div>
                  </div>

                  <div className="text-gray-300 flex-1 min-w-[280px]">
                    <label className="block text-sm mb-3">Resolution</label>
                    <div className="flex gap-3 flex-wrap">
                      {resolutionOptions.map((res) => {
                        const isLocked = (res === "720p" && userPlan === "free") || (res === "1080p" && (userPlan === "free" || userPlan === "pro"));
                        return (
                        <button
                          key={res}
                          type="button"
                          disabled={isLocked}
                          onClick={() => setResolution(res)}
                          className={`rounded-lg border px-4 py-3 text-sm font-medium transition-all flex items-center gap-1 ${
                            isLocked ? "opacity-40 cursor-not-allowed border-white/5 bg-white/5" :
                            resolution === res
                              ? "border-violet-500/60 bg-violet-500/10 text-white"
                              : "border-white/10 bg-white/3 text-gray-300 hover:bg-white/6"
                          }`}
                        >
                          {res} {isLocked && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-black/40 text-gray-400">{res === "1080p" ? "Premium" : "Pro"}</span>}
                        </button>
                      )})}
                    </div>
                  </div>
                </div>

                <div className="text-gray-300 mt-2">
                  <label className="block text-sm mb-3">
                    Ad Angle <span className="text-xs text-violet-400">(marketing focus)</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {adAngleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAdAngle(option.value)}
                        className={`rounded-lg border p-3 text-left transition-all ${
                          adAngle === option.value
                            ? "border-violet-500/60 bg-violet-500/10 text-white"
                            : "border-white/10 bg-white/3 text-gray-300 hover:bg-white/6"
                        }`}
                      >
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="mt-1 text-xs text-gray-400">{option.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-gray-300 mt-2">
                  <label className="block text-sm mb-3">
                    Style Preset <span className="text-xs text-violet-400">(optional)</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {promptStyleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStylePreset(option.value)}
                        className={`rounded-lg border p-3 text-left transition-all ${
                          stylePreset === option.value
                            ? "border-violet-500/60 bg-violet-500/10 text-white"
                            : "border-white/10 bg-white/3 text-gray-300 hover:bg-white/6"
                        }`}
                      >
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="mt-1 text-xs text-gray-400">{option.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: AI Prompts */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">AI Directing</h2>
              <div className="text-gray-300">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="userPrompt" className="block text-sm">
                    User Prompt{" "}
                    <span className="text-xs text-violet-400">(optional)</span>
                  </label>
                  <GhostButton
                    type="button"
                    onClick={handleGeneratePrompt}
                    disabled={isPromptGenerating}
                    className="rounded-lg px-4 py-2 text-sm bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20"
                  >
                    {isPromptGenerating ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Generating Ideas...
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="size-4" />
                        Generate 3 Ideas
                      </>
                    )}
                  </GhostButton>
                </div>
                {promptOptions.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {promptOptions.map((promptOption, index) => (
                      <button
                        key={`${index}-${promptOption.slice(0, 16)}`}
                        type="button"
                        onClick={() => setUserPrompt(promptOption)}
                        className={`rounded-full border px-4 py-2 text-sm transition-all ${
                          userPrompt === promptOption
                            ? "border-violet-500/60 bg-violet-500/10 text-white"
                            : "border-white/10 bg-white/3 text-gray-300 hover:bg-white/6"
                        }`}
                      >
                        Prompt {index + 1}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  id="userPrompt"
                  rows={5}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Describe how you want the video/narration to be. You can use AI to generate ideas."
                  className="w-full bg-white/3 rounded-lg border-2 p-4 text-sm border-violet-200/10 focus:border-violet-500/50 outline-none resize-none transition-all"
                />
                <p className="mt-3 text-xs text-gray-400">
                  Tap 'Generate 3 Ideas' and let AI draft the directing instructions based on your product details.
                </p>
              </div>
            </div>

          </div>

          {/* Sticky Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-28 self-start">
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">Visual Assets</h2>
              <div className="flex flex-col gap-6">
                <UploadZone
                  label="Product Image"
                  file={productImage}
                  onClear={() => setProductImage(null)}
                  onChange={(e) => handleFileChange(e, "product")}
                />
                <UploadZone
                  label="Model Image"
                  file={modelImage}
                  onClear={() => setModelImage(null)}
                  onChange={(e) => handleFileChange(e, "model")}
                />
              </div>
            </div>

            <div className="bg-gradient-to-br from-white/5 to-white/10 border border-white/10 rounded-2xl p-6">
               <h3 className="text-lg font-medium mb-2">Ready to generate?</h3>
               <p className="text-sm text-gray-400 mb-6">Review your settings and click below to process your video.</p>
               <PrimaryButton
                  disabled={isGenerating}
                  className="w-full py-4 rounded-xl disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-md font-medium"
                >
                  {isGenerating ? (
                    <>
                      <Loader2Icon className="size-5 animate-spin" /> Processing...
                    </>
                  ) : (
                    <>
                      <VideoIcon className="size-5" /> Generate Video
                    </>
                  )}
                </PrimaryButton>
            </div>

          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default Genetator;
