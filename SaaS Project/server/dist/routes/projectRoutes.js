import express from "express";
import { createDirectVideo, deleteProject, generatePromptSuggestion, getAllPublishedProjects, } from "../controllers/projectController.js";
import { protect } from "../middlewares/auth.js";
import upload from "../configs/multer.js";
const projectRouter = express.Router();
projectRouter.post("/generate-prompt", protect, generatePromptSuggestion);
// Single pipeline route: LightX virtual try-on -> Magic Hour video
projectRouter.post("/create-direct-video", upload.fields([
    { name: "productImage", maxCount: 1 },
    { name: "modelImage", maxCount: 1 },
]), protect, createDirectVideo);
// Get all published projects for the community feed
projectRouter.get("/published", getAllPublishedProjects);
// FIXED: Added the missing ':' before projectId so req.params.projectId works correctly
projectRouter.delete("/:projectId", protect, deleteProject);
export default projectRouter;
