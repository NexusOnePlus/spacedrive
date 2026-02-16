import { useState, useEffect } from "react";
import clsx from "clsx";
import {
  GeneralSettings,
  AppearanceSettings,
  LibrarySettings,
  IndexerSettings,
  ServicesSettings,
  PrivacySettings,
  AdvancedSettings,
  AboutSettings,
} from "../../Settings/pages";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { usePlatform } from "../../contexts/PlatformContext";

// macOS needs 52px top padding for traffic lights; Windows/Linux need minimal padding
const isMacOS = typeof navigator !== 'undefined' &&
  (navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.includes('Mac'));
const TOP_PADDING = isMacOS ? 'pt-[52px]' : 'pt-3';
const TOP_HEIGHT = isMacOS ? 'h-[52px]' : 'h-3';

interface SettingsSidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const sections = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "library", label: "Library" },
  { id: "indexer", label: "Indexer" },
  { id: "services", label: "Services" },
  { id: "privacy", label: "Privacy" },
  { id: "advanced", label: "Advanced" },
  { id: "about", label: "About" },
];

function SettingsSidebar({ currentPage, onPageChange }: SettingsSidebarProps) {
  const isAboutPage = currentPage === "about";

  return (
    <div className="space-y-1">
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => onPageChange(section.id)}
          className={clsx(
            "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-300",
            currentPage === section.id
              ? isAboutPage
                ? "bg-white/20 text-white"
                : "bg-sidebar-selected text-sidebar-ink"
              : isAboutPage
              ? "text-white/60 hover:text-white hover:bg-white/10"
              : "text-sidebar-inkDull hover:text-sidebar-ink hover:bg-sidebar-box"
          )}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}

interface SettingsContentProps {
  page: string;
}

function SettingsContent({ page }: SettingsContentProps) {
  switch (page) {
    case "general":
      return <GeneralSettings />;
    case "appearance":
      return <AppearanceSettings />;
    case "library":
      return <LibrarySettings />;
    case "indexer":
      return <IndexerSettings />;
    case "services":
      return <ServicesSettings />;
    case "privacy":
      return <PrivacySettings />;
    case "advanced":
      return <AdvancedSettings />;
    case "about":
      return <AboutSettings />;
    default:
      return <GeneralSettings />;
  }
}

function SettingsContentWrapper() {
  const pathname = window.location.pathname;
  const initialPage = pathname.split("/").filter(Boolean)[1] || "general";
  const [currentPage, setCurrentPage] = useState(initialPage);

  return (
    <div className={clsx(
      "h-screen flex transition-colors duration-500 relative",
      currentPage === "about" ? "bg-black" : "bg-app"
    )}>
      {/* Drag region for titlebar area */}
      <div
        data-tauri-drag-region
        className={clsx("absolute inset-x-0 top-0 z-50", TOP_HEIGHT)}
      />

      {/* Sidebar */}
      <nav className={clsx(
        "w-48 border-r p-4 transition-all duration-500",
        TOP_PADDING,
        currentPage === "about"
          ? "bg-black border-black"
          : "bg-sidebar border-sidebar-line"
      )}>
        <div className="mb-6">
          <h1 className={clsx(
            "text-xl font-semibold transition-colors duration-500",
            currentPage === "about" ? "text-white" : "text-sidebar-ink"
          )}>Settings</h1>
        </div>
        <SettingsSidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </nav>

      {/* Main content */}
      <main className={clsx("flex-1 overflow-auto p-8", TOP_PADDING)}>
        <SettingsContent page={currentPage} />
      </main>
    </div>
  );
}

/**
 * Settings component for separate settings window.
 * Renders immediately since daemon is already connected in main window.
 */
export function Settings() {
  const platform = usePlatform();

  useEffect(() => {
    // Apply macOS titlebar styling after window is ready
    if (platform.applyMacOSStyling) {
      platform.applyMacOSStyling().catch((err) => {
        console.warn("Failed to apply macOS styling:", err);
      });
    }
  }, [platform]);

  return (
    <>
      <SettingsContentWrapper />
      <ReactQueryDevtools
        initialIsOpen={false}
        buttonPosition="bottom-right"
      />
    </>
  );
}