import type { PortRef, TopologyDocument } from "@ping9/shared";

import { availablePorts } from "./format/available-ports";

export interface CableState {
  readonly active: boolean;
  readonly first: PortRef | null;
  readonly pickerDeviceId: string | null;
}

export const CABLE_OFF: CableState = { active: false, first: null, pickerDeviceId: null };
export const CABLE_READY: CableState = { active: true, first: null, pickerDeviceId: null };

/** 외부 편집으로 지워지거나 점유된 연결점은 다음 연결에 재사용하지 않는다. */
export function syncCableState(state: CableState, document: TopologyDocument): CableState {
  if (!state.active) return state;
  if (state.first !== null && !availablePorts(document, state.first.deviceId).includes(state.first.port)) return CABLE_READY;
  if (state.pickerDeviceId !== null && !document.devices.some(device => device.id === state.pickerDeviceId)) {
    return { ...state, pickerDeviceId: null };
  }
  return state;
}
