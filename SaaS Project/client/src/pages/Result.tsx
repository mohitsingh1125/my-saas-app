import { useCallback, useEffect, useState } from "react";
import type { Project } from "../types";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ImageIcon, Loader2Icon, RefreshCwIcon, VideoIcon } from "lucide-react";
import { GhostButton } from "../components/Buttons";
import { useAuth, useUser } from "@clerk/react";
import api from "../configs/axios";
import toast from "react-hot-toast";

const Result = () => {
  const { projectId } = useParams();
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();

  const [project, setProjectData] = useState<Project>({} as Project);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchProjectData = useCallback(async () => {
    try {
      const token = await getToken();
      const { data } = await api.get(`/api/user/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProjectData(data.project);
      setIsGenerating(data.project.isGenerating);
      setLoading(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message || err?.message || "Failed to load project");
      console.log(error);
    }
  }, [getToken, projectId]);

  useEffect(() => {
    if (user && !project.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchProjectData();
    } else if (isLoaded && !user) {
      navigate("/");
    }
  }, [user, isLoaded, navigate, project.id, fetchProjectData]);

  // fetch project every 10 seconds while Magic Hour processes the video
  useEffect(() => {
    if (user && isGenerating) {
      const interval = setInterval(() => {
        void fetchProjectData();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [user, isGenerating, fetchProjectData]);

  return loading ? (
    <div className="h-screen w-full flex items-center justify-center">
      <Loader2Icon className="animate-spin text-indigo-400 size-9" />
    </div>
  ) : (
    <div className="min-h-screen text-white p-6 md:p-12 mt-20">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl md:text-3xl font-medium">
            Generation Result
          </h1>
          <Link
            to="/generate"
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <RefreshCwIcon className="w-4 h-4" />
            <p className="max-sm:hidden">New Generation</p>
          </Link>
        </header>

        {/* Grid layout */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Result Display */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel inline-block p-2 rounded-2xl w-full">
              <div
                className={`${project?.aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video"} w-full bg-gray-900 rounded-xl overflow-hidden relative flex items-center justify-center`}
              >
                {project?.generatedVideo ? (
                  <video
                    src={project.generatedVideo}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-cover"
                  />
                ) : isGenerating ? (
                  <div className="flex flex-col items-center gap-4 text-indigo-400">
                    <Loader2Icon className="animate-spin size-10" />
                    <p>rendering your video...</p>
                  </div>
                ) : project?.generatedImage ? (
                  <img
                    src={project.generatedImage}
                    alt="Generated Result"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center px-6">
                    <p className="text-gray-200 font-medium mb-2">
                      Generation failed
                    </p>
                    <p className="text-gray-500 text-sm">
                      {project?.error?.trim()
                        ? project.error
                        : "No video/image was produced for this project."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            {/* download buttons */}
            <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-xl font-semibold mb-4">Actions</h3>
              <div className="flex flex-col gap-3">
                {/* Kept image download just in case Magic Hour returns a thumbnail/first frame */}
                <a
                  href={project.generatedImage}
                  download={project.generatedImage ? true : undefined}
                >
                  <GhostButton
                    disabled={!project.generatedImage}
                    className="w-full justify-center rounded-md py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImageIcon className="size-4.5" />
                    Download Cover
                  </GhostButton>
                </a>
                <a
                  href={project.generatedVideo}
                  download={project.generatedVideo ? true : undefined}
                >
                  <GhostButton
                    disabled={!project.generatedVideo}
                    className="w-full justify-center rounded-md py-3 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-400 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20"
                  >
                    <VideoIcon className="size-4.5" />
                    Download Video
                  </GhostButton>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Result;
