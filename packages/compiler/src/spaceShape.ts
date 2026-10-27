/**
 * The shape of a space's or a prefab's file (M5.1, D63; M5.2's components, placed records and
 * overrides, D64), strict zod: E058. Apart from the checks so they and spaceParts.ts both read it.
 * The spec is docs/specs/viewport.md and docs/specs/components.md.
 */
import { QUALIFIED_REF_PATTERN, RECORD_ID_PATTERN } from '@eb/core';
import { z } from '@eb/schema';

/** The shapes a space draws without an asset, each a metre across and standing on its origin. */
export const SHAPES = ['box', 'sphere', 'cylinder', 'plane'] as const;
export type Shape = (typeof SHAPES)[number];

const id = z.string().regex(RECORD_ID_PATTERN, { error: 'Not an id: use lowercase words joined by hyphens' });
const three = z.tuple([z.number(), z.number(), z.number()]);
const above = z.number().gt(0, { error: 'A scale is above 0' });

/** At most this many tags a space or an object (M6.7, D79). */
export const TAGS_MOST = 16;

/** What a space or an object is, for the quests that look for it (M6.7, D79): words, each once. */
const tags = z
  .array(z.string().regex(RECORD_ID_PATTERN, { error: 'A tag is lowercase words joined by hyphens' }))
  .max(TAGS_MOST, { error: `${TAGS_MOST} tags at most` })
  .refine((list) => new Set(list).size === list.length, { error: 'A tag is listed once' });

/** The fields an object and an override share (M5.2): what an override can change. */
export const placeFields = {
  name: z.string().min(1).max(80).optional(),
  tags: tags.optional(),
  at: three.optional(),
  turn: three.optional(),
  scale: z.tuple([above, above, above]).optional(),
  shape: z.enum(SHAPES).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, { error: 'Expected a colour like "#7a8b5c"' })
    .optional(),
  // A component's fields and an override's are only objects here: each is checked against its kind
  // or its prefab once the project's types are known (spaceParts.ts), so a half-made one still opens.
  components: z.record(id, z.record(z.string(), z.unknown(), { error: 'Expected a component’s fields' })).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
};

const WHAT = ['shape', 'prefab', 'record'] as const;

const objectSchema = z
  .strictObject({
    id,
    ...placeFields,
    prefab: id.optional(),
    record: z.string().regex(QUALIFIED_REF_PATTERN, { error: 'Expected a record as "type:id"' }).optional(),
  })
  .superRefine((object, ctx) => {
    const what = WHAT.filter((key) => object[key] !== undefined);
    if (what.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'An object is a shape, a placed prefab or a placed record: give it one',
        path: [],
      });
    } else if (what.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: `An object is one of ${what.join(' and ')}, not both`,
        path: [what[1] as string],
      });
    } else if (object.shape === undefined && object.color !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'Only a shape has a colour of its own', path: ['color'] });
    } else if (object.shape !== undefined && object.overrides !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'A shape places nothing to override', path: ['overrides'] });
    }
  });

/** A terrain's vertices a side (M5.3, D65): each a whole number of chunks of CHUNK squares. */
export const TERRAIN_SIZES = [65, 129, 257, 513] as const;
/** Squares a side of one chunk, the unit the view's detail is chosen by. */
export const CHUNK = 32;

const colour = z.string().regex(/^#[0-9a-f]{6}$/i, { error: 'Expected a colour like "#7a8b5c"' });

/** At most four foliage types a terrain (M5.6, D68), as four paint layers: one channel each of the foliage PNG. */
export const FOLIAGE_MOST = 4;

/** A space's terrain (M5.3, D65): its heights and paint are PNGs beside the space, docs/specs/terrain.md. */
export const terrainSchema = z
  .strictObject({
    size: z
      .number()
      .refine((n) => (TERRAIN_SIZES as readonly number[]).includes(n), { error: 'A size is 65, 129, 257 or 513' }),
    spacing: z.number().min(0.25, { error: 'At least 0.25 m' }).max(16, { error: 'At most 16 m' }),
    low: z.number(),
    high: z.number(),
    layers: z
      .array(z.strictObject({ name: z.string().min(1).max(40), color: colour }))
      .min(1, { error: 'A terrain has a layer at least' })
      .max(4, { error: 'A terrain has 4 layers at most' }),
    /** The foliage records it paints (M5.6, D68, docs/specs/foliage.md): channel k of its foliage PNG is the k-th's. */
    foliage: z
      .array(id)
      .max(FOLIAGE_MOST, { error: `A terrain has ${FOLIAGE_MOST} foliage types at most` })
      .refine((ids) => new Set(ids).size === ids.length, { error: 'A foliage type is listed once' })
      .optional(),
  })
  .refine((t) => t.low < t.high, { error: 'High is above low', path: ['high'] });

/** Art pixels across and up (M7.1, D83): whole, as a 2D space is drawn in whole pixels. */
const pixels = z.tuple([
  z.int({ error: 'Whole art pixels' }).min(1).max(8192),
  z.int({ error: 'Whole art pixels' }).min(1).max(8192),
]);

/** What a space is drawn as (M7.1, D83): 3D when left out. */
export const VIEWS = ['3d', '2d'] as const;

export const spaceSchema = z.strictObject({
  name: z.string().min(1).max(80),
  /** A 2D space's own (M7.1, D83, docs/specs/2d-scenes.md): its view, the art pixels it wants in view, the art pixels the camera keeps within, the colour behind it all. */
  view: z.enum(VIEWS).optional(),
  fit: pixels.optional(),
  size: pixels.optional(),
  backdrop: colour.optional(),
  /** A space's tags (M6.7): a prefab's are E058, as a placement of it carries its own. */
  tags: tags.optional(),
  /** The id of the environment record it is drawn under (M5.4, D66): a space's alone. */
  environment: id.optional(),
  terrain: terrainSchema.optional(),
  objects: z.array(objectSchema).max(5000),
});

export type SpaceJson = z.infer<typeof spaceSchema>;
export type TerrainJson = z.infer<typeof terrainSchema>;
export type SpaceObject = SpaceJson['objects'][number];
