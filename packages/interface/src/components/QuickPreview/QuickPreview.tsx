import {X} from '@phosphor-icons/react';
import type {File, SdPath} from '@sd/ts-client';
import {getContentKind} from '@sd/ts-client';
import {useEffect, useMemo, useState} from 'react';
import {usePlatform} from '../../contexts/PlatformContext';
import {useNormalizedQuery} from '../../contexts/SpacedriveContext';
import {formatBytes} from '../../routes/explorer/utils';
import {ContentRenderer} from './ContentRenderer';

function MetadataPanel({file}: {file: File}) {
	return (
		<div className="bg-sidebar-box border-sidebar-line w-[280px] min-w-[280px] overflow-y-auto border-l p-4">
			<div className="space-y-4">
				<div>
					<div className="text-ink-dull mb-1 text-xs">Name</div>
					<div className="text-ink break-words text-sm">
						{file.name}
					</div>
				</div>

				<div>
					<div className="text-ink-dull mb-1 text-xs">Kind</div>
					<div className="text-ink text-sm capitalize">
						{getContentKind(file)}
					</div>
				</div>

				<div>
					<div className="text-ink-dull mb-1 text-xs">Size</div>
					<div className="text-ink text-sm">
						{formatBytes(file.size || 0)}
					</div>
				</div>

				{file.extension && (
					<div>
						<div className="text-ink-dull mb-1 text-xs">
							Extension
						</div>
						<div className="text-ink text-sm">{file.extension}</div>
					</div>
				)}

				{file.created_at && (
					<div>
						<div className="text-ink-dull mb-1 text-xs">
							Created
						</div>
						<div className="text-ink text-sm">
							{new Date(file.created_at).toLocaleString()}
						</div>
					</div>
				)}

				{file.modified_at && (
					<div>
						<div className="text-ink-dull mb-1 text-xs">
							Modified
						</div>
						<div className="text-ink text-sm">
							{new Date(file.modified_at).toLocaleString()}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export function QuickPreview() {
	const platform = usePlatform();
	const [fileId, setFileId] = useState<string | null>(null);
	const [ephemeralPath, setEphemeralPath] = useState<SdPath | null>(null);

	useEffect(() => {
		if (platform.getCurrentWindowLabel) {
			const label = platform.getCurrentWindowLabel();

			// Label format: "quick-preview-{file_id}" or "quick-preview-path-{encoded_json}"
			const pathMatch = label.match(/^quick-preview-path-(.+)$/);
			if (pathMatch) {
				try {
					const decoded = JSON.parse(
						decodeURIComponent(pathMatch[1])
					);
					setEphemeralPath(decoded);
				} catch (e) {
					console.error('Failed to parse ephemeral path:', e);
				}
				return;
			}

			const idMatch = label.match(/^quick-preview-(.+)$/);
			if (idMatch) {
				setFileId(idMatch[1]);
			}
		}
	}, [platform]);

	const {
		data: fileFromQuery,
		isLoading,
		error
	} = useNormalizedQuery<{file_id: string}, File>({
		query: 'files.by_id',
		input: {file_id: fileId!},
		resourceType: 'file',
		resourceId: fileId!,
		enabled: !!fileId && !ephemeralPath
	});

	const file = useMemo(() => {
		if (fileFromQuery) return fileFromQuery;
		if (!ephemeralPath) return null;

		const physicalPath = (ephemeralPath as any).Physical?.path;
		if (!physicalPath) return null;

		const name = physicalPath.split(/[/\\]/).pop() || physicalPath;
		const ext = name.includes('.')
			? name.split('.').pop()?.toLowerCase()
			: undefined;

		return {
			id: `ephemeral-${physicalPath}`,
			name,
			extension: ext,
			kind: 'File' as const,
			size: 0,
			sd_path: ephemeralPath,
			content_identity: null,
			sidecars: [],
			tags: [],
			created_at: null,
			modified_at: null
		} as File;
	}, [fileFromQuery, ephemeralPath]);

	const handleClose = () => {
		if (platform.closeCurrentWindow) {
			platform.closeCurrentWindow();
		}
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === 'Escape') {
				handleClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	if (isLoading || !file) {
		return (
			<div className="bg-app text-ink flex h-screen items-center justify-center">
				<div className="animate-pulse">Loading...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-app flex h-screen items-center justify-center text-red-400">
				<div>
					<div className="mb-2 text-lg font-medium">
						Error loading file
					</div>
					<div className="text-sm">{error.message}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-app text-ink flex h-screen flex-col">
			<div className="border-app-line flex items-center justify-between border-b px-4 py-3">
				<div className="flex-1 truncate text-sm font-medium">
					{file.name}
				</div>
				<button
					onClick={handleClose}
					className="hover:bg-app-hover text-ink-dull hover:text-ink rounded-md p-1"
				>
					<X size={16} weight="bold" />
				</button>
			</div>

			<div className="flex flex-1 overflow-hidden">
				<div className="bg-app-box/30 flex-1 p-6">
					<ContentRenderer file={file} />
				</div>

				<MetadataPanel file={file} />
			</div>

			<div className="border-app-line bg-app-box/30 border-t px-4 py-2">
				<div className="text-ink-dull text-center text-xs">
					Press <span className="text-ink">ESC</span> to close
				</div>
			</div>
		</div>
	);
}
