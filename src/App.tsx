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

// Lazy-loaded routes (reduce initial bundle for public portal + admin extras)
const Settings = lazy(() => import("./pages/Settings"));
const Install = lazy(() => import("./pages/Install"));
const InstagramCallback = lazy(() => import("./pages/InstagramCallback"));
const TikTokCallback = lazy(() => import("./pages/TikTokCallback"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const PortalHome = lazy(() => import("./pages/portal/Home"));
const ArticlePage = lazy(() => import("./pages/portal/ArticlePage"));
const CategoryPage = lazy(() => import("./pages/portal/CategoryPage"));
const SearchPage = lazy(() => import("./pages/portal/SearchPage"));
const About = lazy(() => import("./pages/portal/About"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <PageFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

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

                {/* Public Portal — Neural Update */}
                <Route path="/" element={<PortalHome />} />
                <Route path="/noticia/:slug" element={<ArticlePage />} />
                <Route path="/categoria/:nome" element={<CategoryPage />} />
                <Route path="/busca" element={<SearchPage />} />
                <Route path="/sobre" element={<About />} />

                {/* Admin (protected) */}
                <Route path="/admin" element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={<Navigate to="/admin" replace />} />
                <Route path="/instagram/callback" element={<InstagramCallback />} />
                <Route path="/tiktok-callback" element={<TikTokCallback />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/data-deletion" element={<DataDeletion />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
