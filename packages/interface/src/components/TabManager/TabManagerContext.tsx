import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type ReactNode
} from 'react';
import {createBrowserRouter, type RouteObject} from 'react-router-dom';

type Router = ReturnType<typeof createBrowserRouter>;

/**
 * Derives a tab title from the current route pathname and search params
 */
function deriveTitleFromPath(pathname: string, search: string): string {
	const routeTitles: Record<string, string> = {
		'/': 'Overview',
		'/favorites': 'Favorites',
		'/recents': 'Recents',
		'/file-kinds': 'File Kinds',
		'/search': 'Search',
		'/jobs': 'Jobs',
		'/daemon': 'Daemon'
	};

	if (routeTitles[pathname]) {
		return routeTitles[pathname];
	}

	if (pathname.startsWith('/tag/')) {
		const tagId = pathname.split('/')[2];
		return tagId ? `Tag: ${tagId.slice(0, 8)}...` : 'Tag';
	}

	if (pathname === '/explorer' && search) {
		const params = new URLSearchParams(search);

		const view = params.get('view');
		if (view === 'device') {
			return 'This Device';
		}

		const pathParam = params.get('path');
		if (pathParam) {
			try {
				const sdPath = JSON.parse(decodeURIComponent(pathParam));
				if (sdPath?.Physical?.path) {
					const fullPath = sdPath.Physical.path as string;
					const parts = fullPath.split('/').filter(Boolean);
					return parts[parts.length - 1] || 'Explorer';
				}
			} catch {
				// Fall through
			}
		}
		return 'Explorer';
	}

	return 'Spacedrive';
}

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'grid' | 'list' | 'column' | 'media' | 'size';
export type SortBy =
	| 'name'
	| 'size'
	| 'date_modified'
	| 'date_created'
	| 'kind';

export interface Tab {
	id: string;
	title: string;
	icon: string | null;
	isPinned: boolean;
	lastActive: number;
	savedPath: string;
}

/**
 * All explorer-related state for a single tab.
 * This is the single source of truth - no sync effects needed.
 */
export interface TabExplorerState {
	// View settings
	viewMode: ViewMode;
	sortBy: SortBy;
	gridSize: number;
	gapSize: number;
	foldersFirst: boolean;

	// Column view state (serialized SdPath[] as JSON strings)
	columnStack: string[];

	// Scroll position
	scrollTop: number;
	scrollLeft: number;

	// Size view transform (zoom + pan)
	sizeViewTransform: {k: number; x: number; y: number};
}

/** Default explorer state for new tabs */
const DEFAULT_EXPLORER_STATE: TabExplorerState = {
	viewMode: 'grid',
	sortBy: 'name',
	gridSize: 120,
	gapSize: 16,
	foldersFirst: true,
	columnStack: [],
	scrollTop: 0,
	scrollLeft: 0,
	sizeViewTransform: {k: 1, x: 0, y: 0}
};

// ============================================================================
// Persistence
// ============================================================================

const STORAGE_KEY = 'sd-tabs-state';

interface PersistedState {
	tabs: Tab[];
	activeTabId: string;
	explorerStates: Record<string, TabExplorerState>;
	defaultNewTabPath: string;
}

function loadPersistedState(): PersistedState | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const parsed = JSON.parse(stored) as PersistedState;

		// Validate structure
		if (
			!Array.isArray(parsed.tabs) ||
			typeof parsed.activeTabId !== 'string' ||
			typeof parsed.explorerStates !== 'object'
		) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function savePersistedState(state: PersistedState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Silently fail if localStorage is unavailable
	}
}

// ============================================================================
// External Explorer State Store (avoids context re-render loops)
// ============================================================================

type ExplorerStateListener = (tabId: string) => void;

class ExplorerStateStore {
	private states: Map<string, TabExplorerState> = new Map();
	private listeners: Set<ExplorerStateListener> = new Set();

	getState(tabId: string): TabExplorerState {
		return this.states.get(tabId) ?? {...DEFAULT_EXPLORER_STATE};
	}

	setState(tabId: string, state: TabExplorerState): void {
		this.states.set(tabId, state);
		this.notifyListeners(tabId);
	}

	updateState(tabId: string, updates: Partial<TabExplorerState>): void {
		const current = this.states.get(tabId) ?? {...DEFAULT_EXPLORER_STATE};
		this.states.set(tabId, {...current, ...updates});
		this.notifyListeners(tabId);
	}

	deleteState(tabId: string): void {
		this.states.delete(tabId);
		this.notifyListeners(tabId);
	}

	getAllStates(): Record<string, TabExplorerState> {
		return Object.fromEntries(this.states);
	}

	loadFromRecord(record: Record<string, TabExplorerState>): void {
		this.states = new Map(Object.entries(record));
		this.listeners.forEach((l) => l(''));
	}

	subscribe(listener: ExplorerStateListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notifyListeners(tabId: string): void {
		this.listeners.forEach((l) => l(tabId));
	}
}

const explorerStateStore = new ExplorerStateStore();

// ============================================================================
// Context
// ============================================================================

interface TabManagerContextValue {
	// Tab management
	tabs: Tab[];
	activeTabId: string;
	router: Router;
	createTab: (title?: string, path?: string) => void;
	closeTab: (tabId: string) => void;
	switchTab: (tabId: string) => void;
	updateTabTitle: (tabId: string, title: string) => void;
	updateTabPath: (tabId: string, path: string) => void;
	reorderTabs: (activeId: string, overId: string) => void;
	nextTab: () => void;
	previousTab: () => void;
	selectTabAtIndex: (index: number) => void;
	setDefaultNewTabPath: (path: string) => void;

	// Explorer state (per-tab)
	getExplorerState: (tabId: string) => TabExplorerState;
	updateExplorerState: (
		tabId: string,
		updates: Partial<TabExplorerState>
	) => void;

	// Selection state (per-tab, ephemeral - not persisted)
	getSelectionIds: (tabId: string) => string[];
	updateSelectionIds: (tabId: string, fileIds: string[]) => void;
}

const TabManagerContext = createContext<TabManagerContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface TabManagerProviderProps {
	children: ReactNode;
	routes: RouteObject[];
}

export function TabManagerProvider({
	children,
	routes
}: TabManagerProviderProps) {
	const router = useMemo(() => createBrowserRouter(routes), [routes]);

	const [tabs, setTabs] = useState<Tab[]>(() => {
		const persisted = loadPersistedState();
		if (persisted && persisted.tabs.length > 0) {
			return persisted.tabs;
		}

		const initialTabId = crypto.randomUUID();
		return [
			{
				id: initialTabId,
				title: 'Overview',
				icon: null,
				isPinned: false,
				lastActive: Date.now(),
				savedPath: '/'
			}
		];
	});

	const [activeTabId, setActiveTabId] = useState<string>(() => {
		const persisted = loadPersistedState();
		if (persisted && persisted.activeTabId) {
			// Verify the activeTabId exists in tabs
			const tabExists = persisted.tabs.some(
				(t) => t.id === persisted.activeTabId
			);
			if (tabExists) return persisted.activeTabId;
		}
		return tabs[0].id;
	});

	// Initialize explorer state store from persisted state
	useEffect(() => {
		const persisted = loadPersistedState();
		if (persisted && persisted.explorerStates) {
			explorerStateStore.loadFromRecord(persisted.explorerStates);
		} else {
			explorerStateStore.setState(tabs[0].id, {
				...DEFAULT_EXPLORER_STATE
			});
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Per-tab selection state (ephemeral, not persisted to localStorage)
	const [selectionStates, setSelectionStates] = useState<
		Map<string, string[]>
	>(() => {
		const initialMap = new Map<string, string[]>();
		// Initialize with empty selection for first tab
		initialMap.set(tabs[0].id, []);
		return initialMap;
	});

	const [defaultNewTabPath, setDefaultNewTabPathState] = useState<string>(
		() => {
			const persisted = loadPersistedState();
			return persisted?.defaultNewTabPath ?? '/';
		}
	);

	// ========================================================================
	// Persistence
	// ========================================================================

	useEffect(() => {
		savePersistedState({
			tabs,
			activeTabId,
			explorerStates: explorerStateStore.getAllStates(),
			defaultNewTabPath
		});
	}, [tabs, activeTabId, defaultNewTabPath]);

	// ========================================================================
	// Tab management
	// ========================================================================

	const setDefaultNewTabPath = useCallback((path: string) => {
		setDefaultNewTabPathState(path);
	}, []);

	const createTab = useCallback(
		(title?: string, path?: string) => {
			const tabPath = path ?? defaultNewTabPath;
			const [pathname, search = ''] = tabPath.split('?');
			const derivedTitle =
				title ||
				deriveTitleFromPath(pathname, search ? `?${search}` : '');

			const newTab: Tab = {
				id: crypto.randomUUID(),
				title: derivedTitle,
				icon: null,
				isPinned: false,
				lastActive: Date.now(),
				savedPath: tabPath
			};

			// Initialize explorer state for the new tab (in external store)
			explorerStateStore.setState(newTab.id, {...DEFAULT_EXPLORER_STATE});

			// Initialize empty selection state for the new tab
			setSelectionStates((prev) => new Map(prev).set(newTab.id, []));

			setTabs((prev) => [...prev, newTab]);
			setActiveTabId(newTab.id);
		},
		[defaultNewTabPath]
	);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((prev) => {
				const filtered = prev.filter((t) => t.id !== tabId);

				if (filtered.length === 0) {
					return prev;
				}

				if (tabId === activeTabId) {
					const currentIndex = prev.findIndex((t) => t.id === tabId);
					const newIndex = Math.max(0, currentIndex - 1);
					const newActiveTab = filtered[newIndex] || filtered[0];
					if (newActiveTab) {
						setActiveTabId(newActiveTab.id);
					}
				}

				return filtered;
			});

			// Clean up explorer state for closed tab (in external store)
			explorerStateStore.deleteState(tabId);

			// Clean up selection state for closed tab
			setSelectionStates((prev) => {
				const next = new Map(prev);
				next.delete(tabId);
				return next;
			});
		},
		[activeTabId]
	);

	const switchTab = useCallback(
		(newTabId: string) => {
			if (newTabId === activeTabId) {
				return;
			}

			setTabs((prev) =>
				prev.map((tab) =>
					tab.id === newTabId ? {...tab, lastActive: Date.now()} : tab
				)
			);

			setActiveTabId(newTabId);
		},
		[activeTabId]
	);

	const updateTabTitle = useCallback((tabId: string, title: string) => {
		setTabs((prev) =>
			prev.map((tab) => (tab.id === tabId ? {...tab, title} : tab))
		);
	}, []);

	const updateTabPath = useCallback((tabId: string, path: string) => {
		setTabs((prev) =>
			prev.map((tab) =>
				tab.id === tabId ? {...tab, savedPath: path} : tab
			)
		);
	}, []);

	const reorderTabs = useCallback((activeId: string, overId: string) => {
		setTabs((prev) => {
			const oldIndex = prev.findIndex((tab) => tab.id === activeId);
			const newIndex = prev.findIndex((tab) => tab.id === overId);

			if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
				return prev;
			}

			const newTabs = [...prev];
			const [movedTab] = newTabs.splice(oldIndex, 1);
			newTabs.splice(newIndex, 0, movedTab);

			return newTabs;
		});
	}, []);

	const nextTab = useCallback(() => {
		const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
		const nextIndex = (currentIndex + 1) % tabs.length;
		switchTab(tabs[nextIndex].id);
	}, [tabs, activeTabId, switchTab]);

	const previousTab = useCallback(() => {
		const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
		const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		switchTab(tabs[prevIndex].id);
	}, [tabs, activeTabId, switchTab]);

	const selectTabAtIndex = useCallback(
		(index: number) => {
			if (index >= 0 && index < tabs.length) {
				switchTab(tabs[index].id);
			}
		},
		[tabs, switchTab]
	);

	// ========================================================================
	// Explorer state (per-tab) - using external store to avoid re-render loops
	// ========================================================================

	const getExplorerState = useCallback(
		(tabId: string): TabExplorerState => {
			return explorerStateStore.getState(tabId);
		},
		[] // Stable reference - always returns current state from store
	);

	const updateExplorerState = useCallback(
		(tabId: string, updates: Partial<TabExplorerState>) => {
			explorerStateStore.updateState(tabId, updates);
		},
		[] // Stable reference
	);

	// ========================================================================
	// Selection state (per-tab)
	// ========================================================================

	const getSelectionIds = useCallback(
		(tabId: string): string[] => {
			return selectionStates.get(tabId) ?? [];
		},
		[selectionStates]
	);

	const updateSelectionIds = useCallback(
		(tabId: string, fileIds: string[]) => {
			setSelectionStates((prev) => new Map(prev).set(tabId, fileIds));
		},
		[]
	);

	// ========================================================================
	// Context value
	// ========================================================================

	const value = useMemo<TabManagerContextValue>(
		() => ({
			tabs,
			activeTabId,
			router,
			createTab,
			closeTab,
			switchTab,
			updateTabTitle,
			updateTabPath,
			reorderTabs,
			nextTab,
			previousTab,
			selectTabAtIndex,
			setDefaultNewTabPath,
			getExplorerState,
			updateExplorerState,
			getSelectionIds,
			updateSelectionIds
		}),
		[
			tabs,
			activeTabId,
			router,
			createTab,
			closeTab,
			switchTab,
			updateTabTitle,
			updateTabPath,
			reorderTabs,
			nextTab,
			previousTab,
			selectTabAtIndex,
			setDefaultNewTabPath,
			// getExplorerState and updateExplorerState are stable (empty deps)
			// getSelectionIds and updateSelectionIds - only getSelectionIds changes
			getSelectionIds,
			updateSelectionIds
		]
	);

	return (
		<TabManagerContext.Provider value={value}>
			{children}
		</TabManagerContext.Provider>
	);
}

/**
 * Hook to subscribe to explorer state changes for a specific tab.
 * Uses useSyncExternalStore to avoid re-render loops.
 * This is the recommended way to read tab explorer state.
 */
export function useTabExplorerState(tabId: string): TabExplorerState {
	const state = useSyncExternalStore(
		(callback) =>
			explorerStateStore.subscribe((changedTabId) => {
				// Only notify if this tab changed
				if (changedTabId === '' || changedTabId === tabId) {
					callback();
				}
			}),
		() => explorerStateStore.getState(tabId),
		() => ({...DEFAULT_EXPLORER_STATE})
	);
	return state;
}

export {TabManagerContext};
