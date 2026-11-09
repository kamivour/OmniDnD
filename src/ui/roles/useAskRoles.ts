import { useStore } from 'zustand';
import { deviceStore } from '../../state/device-settings';

/** Whether to show the role questions at all (the device can switch them off). */
export const useAskRoles = () => useStore(deviceStore, (state) => state.askRoles);
