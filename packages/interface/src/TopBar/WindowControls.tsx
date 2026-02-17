import { memo, useCallback, useState } from "react";
import { usePlatform } from "../contexts/PlatformContext";

// Detect Windows once
const isWindows =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("win");

/**
 * Custom window controls for Windows (minimize, maximize, close).
 * Only renders on Windows where we disable native decorations.
 * Positioned on the right side of the TopBar, matching Windows UX conventions.
 */
export const WindowControls = memo(function WindowControls() {
	if (!isWindows) return null;

	const platform = usePlatform();
	const [isMaximized, setIsMaximized] = useState(false);

	const handleMinimize = useCallback(async () => {
		try {
			await platform.minimizeWindow?.();
		} catch {}
	}, [platform]);

	const handleMaximize = useCallback(async () => {
		try {
			await platform.toggleMaximizeWindow?.();
			const maximized = await platform.isWindowMaximized?.();
			setIsMaximized(maximized ?? false);
		} catch {}
	}, [platform]);

	const handleClose = useCallback(async () => {
		try {
			await platform.closeCurrentWindow?.();
		} catch {}
	}, [platform]);

	return (
		<div className="flex items-center h-full ml-auto -mr-3 shrink-0">
			{/* Minimize */}
			<button
				onClick={handleMinimize}
				className="flex items-center justify-center w-12 h-full"
				aria-label="Minimize"
			>
				<svg width="10" height="1" viewBox="0 0 10 1">
					<rect
						fill="currentColor"
						width="10"
						height="1"
						className="text-ink"
					/>
				</svg>
			</button>

			{/* Maximize / Restore */}
			<button
				onClick={handleMaximize}
				className="flex items-center justify-center w-12 h-full"
				aria-label={isMaximized ? "Restore" : "Maximize"}
			>
				{isMaximized ? (
					// Restore icon (two overlapping squares)
					<svg
						width="10"
						height="10"
						viewBox="0 0 10 10"
						className="text-ink"
					>
						<path
							fill="none"
							stroke="currentColor"
							strokeWidth="1"
							d="M2.5,3.5 h5 v5 h-5 z M3.5,3.5 v-1 h5 v5 h-1"
						/>
					</svg>
				) : (
					// Maximize icon (single square)
					<svg
						width="10"
						height="10"
						viewBox="0 0 10 10"
						className="text-ink"
					>
						<rect
							fill="none"
							stroke="currentColor"
							strokeWidth="1"
							x="0.5"
							y="0.5"
							width="9"
							height="9"
						/>
					</svg>
				)}
			</button>

			{/* Close */}
			<button
				onClick={handleClose}
				className="flex items-center justify-center w-12 h-full transition-colors hover:bg-red-500 active:bg-red-600"
				aria-label="Close"
			>
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					className="text-ink"
				>
					<path
						fill="none"
						stroke="currentColor"
						strokeWidth="1.2"
						d="M1,1 L9,9 M9,1 L1,9"
					/>
				</svg>
			</button>
		</div>
	);
});
