import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { VideoRenderingProvider } from "@/contexts/VideoRenderingContext";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { RealtimeNotifications } from "@/components/RealtimeNotifications";

const Settings = lazy(() => import("./pages/Settings"));
const Install = lazy(() => import("./pages/Install"));
const InstagramCallback = lazy(() => import("./pages/InstagramCallback"));
const TikTokCallback = lazy(() => import("./pages/TikTokCallback"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WorkspaceProvider>
        <VideoRenderingProvider>
          <Toaster />
          <Sonner />
          <PWAInstallPrompt />
          <RealtimeNotifications />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/install" element={<Install />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } />
                <Route path="/admin" element={<Navigate to="/" replace />} />
                <Route path="/settings" element={<Navigate to="/" replace />} />
                <Route path="/instagram/callback" element={<InstagramCallback />} />
                <Route path="/tiktok-callback" element={<TikTokCallback />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/data-deletion" element={<DataDeletion />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </VideoRenderingProvider>
      </WorkspaceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
