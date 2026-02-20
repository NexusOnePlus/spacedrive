import type {File} from '@sd/ts-client';
import {memo, useMemo} from 'react';
import {useExplorer} from '../../routes/explorer';
import {useSelection} from '../../routes/explorer/SelectionContext';
import {QuickPreviewFullscreen} from './QuickPreviewFullscreen';

/**
 * QuickPreviewController - Handles QuickPreview with navigation
 *
 * Isolated component that reads selection state for prev/next navigation.
 * Only re-renders when quickPreviewFileId changes, not on every selection change.
 */
export const QuickPreviewController = memo(function QuickPreviewController({
	sidebarWidth,
	inspectorWidth
}: {
	sidebarWidth: number;
	inspectorWidth: number;
}) {
	const {quickPreviewFileId, closeQuickPreview, currentFiles} = useExplorer();
	const {selectedFiles, selectFile} = useSelection();

	// Early return if no preview - this component won't re-render on selection changes
	// because it's memoized and doesn't read selectedFiles directly
	if (!quickPreviewFileId) return null;

	// Find the file from selectedFiles first (most reliable for ephemeral files),
	// then fallback to currentFiles
	const previewFile = useMemo(() => {
		const fromSelection = selectedFiles.find(
			(f) => f.id === quickPreviewFileId
		);
		if (fromSelection) return fromSelection;
		return currentFiles.find((f) => f.id === quickPreviewFileId) ?? null;
	}, [selectedFiles, currentFiles, quickPreviewFileId]);

	// Build a map of files for navigation (use currentFiles for navigation context)
	const filesForNavigation = currentFiles;
	const currentIndex = filesForNavigation.findIndex(
		(f) => f.id === quickPreviewFileId
	);
	const hasPrevious = currentIndex > 0;
	const hasNext = currentIndex < filesForNavigation.length - 1;

	const handleNext = () => {
		if (hasNext && filesForNavigation[currentIndex + 1]) {
			selectFile(
				filesForNavigation[currentIndex + 1],
				filesForNavigation,
				false,
				false
			);
		}
	};

	const handlePrevious = () => {
		if (hasPrevious && filesForNavigation[currentIndex - 1]) {
			selectFile(
				filesForNavigation[currentIndex - 1],
				filesForNavigation,
				false,
				false
			);
		}
	};

	return (
		<QuickPreviewFullscreen
			fileId={quickPreviewFileId}
			file={previewFile}
			isOpen={!!quickPreviewFileId}
			onClose={closeQuickPreview}
			onNext={handleNext}
			onPrevious={handlePrevious}
			hasPrevious={hasPrevious}
			hasNext={hasNext}
			sidebarWidth={sidebarWidth}
			inspectorWidth={inspectorWidth}
		/>
	);
});
