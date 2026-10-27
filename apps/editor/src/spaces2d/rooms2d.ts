/**
 * What the Rooms row and the 2D view share while a building is chosen (M7.3, D85,
 * docs/specs/rooms.md#the-editor): the tool a press uses (place, erase, stairs, or none, when a press
 * chooses and pans as before) and the room record Place lays. Small, so it rides with the Scene panel.
 */
import { signal } from '@preact/signals';

export type RoomTool = 'place' | 'erase' | 'stairs' | null;

export const roomTool = signal<RoomTool>(null);
/** The room record Place lays, or null before one is chosen. */
export const roomChoice = signal<string | null>(null);
