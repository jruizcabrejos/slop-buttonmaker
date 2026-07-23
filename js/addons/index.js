import { initZoomAddon } from "./zoom.js";

const ADDONS = [
  initZoomAddon
];

export function initAddons(context) {
  return ADDONS.map(initAddon => initAddon(context));
}
