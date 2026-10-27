/** Side-view rooms in the pure core (M7.3, D85, docs/specs/rooms.md): a building's places, rooms and routes. */
export {
  FLOORS_MOST,
  type FloorPlace,
  floorPlaceOf,
  type PackBuilding,
  pointOf,
  roomAt,
  SLOTS_MOST,
  widthOf,
} from './building.ts';
export { buildingsProblem } from './pack.ts';
export { buildingRoute, routeCost } from './route.ts';
