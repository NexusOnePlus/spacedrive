import {useContext} from 'react';
import {TabManagerContext, useTabExplorerState} from './TabManagerContext';

export function useTabManager() {
	const context = useContext(TabManagerContext);
	if (!context) {
		throw new Error(
			'useTabManager must be used within a TabManagerProvider'
		);
	}
	return context;
}

export {useTabExplorerState};
